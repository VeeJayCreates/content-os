import { createHash } from 'node:crypto';
import { request } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import { MediaAssetRepository, VisualAssetRepository } from '@content-os/storage';
import { MEDIA_STORAGE_PROVIDER, type MediaStorageProvider } from './media-storage-provider';
import { isGlobalAddress, safeHttpsUrl, type AddressResolver } from '../../common/public-network-url';

type PinnedFetcher = (url: URL, addresses: string[], signal: AbortSignal) => Promise<Response>;
export interface MediaMaterializationOptions { maxBytes?: number; allowedMimeTypes?: string[]; resolver?: AddressResolver; maxRedirects?: number; requestTimeoutMs?: number; downloadTimeoutMs?: number; fetcher?: PinnedFetcher; }
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const extension: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4' };
const mediaTypeByMime: Record<string, 'image' | 'video'> = { 'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'video/mp4': 'video' };
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const MAX_CONFIGURED_BYTES = 1024 * 1024 * 1024;
const parseMaxBytes = (configured: number | string | undefined) => {
  const value = configured === undefined ? DEFAULT_MAX_BYTES : typeof configured === 'number' ? configured : Number(configured);
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_CONFIGURED_BYTES) {
    throw new Error(`MEDIA_MAX_BYTES must be a positive integer no greater than ${MAX_CONFIGURED_BYTES}`);
  }
  return value;
};
const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
};

@Injectable()
export class MediaMaterializationService {
  private readonly maxBytes: number; private readonly allowed: Set<string>; private readonly resolver: AddressResolver; private readonly maxRedirects: number; private readonly requestTimeoutMs: number; private readonly downloadTimeoutMs: number; private readonly fetcher: PinnedFetcher;
  constructor(private readonly visuals: VisualAssetRepository, private readonly assets: MediaAssetRepository,
    @Inject(MEDIA_STORAGE_PROVIDER) private readonly storage: MediaStorageProvider,
    options: MediaMaterializationOptions = {}) {
    this.maxBytes = parseMaxBytes(options.maxBytes ?? process.env.MEDIA_MAX_BYTES);
    this.allowed = new Set(options.allowedMimeTypes ?? ['image/jpeg', 'image/png', 'image/webp', 'video/mp4']);
    this.resolver = options.resolver ?? (async (hostname) => (await import('node:dns/promises')).lookup(hostname, { all: true, verbatim: true }));
    this.maxRedirects = options.maxRedirects ?? 3;
    this.requestTimeoutMs = options.requestTimeoutMs ?? Number(process.env.MEDIA_REQUEST_TIMEOUT_MS || 10_000);
    this.downloadTimeoutMs = options.downloadTimeoutMs ?? Number(process.env.MEDIA_DOWNLOAD_TIMEOUT_MS || 30_000);
    this.fetcher = options.fetcher ?? this.fetchPinned;
  }

  async findCompatibleReadyAsset(requirementId: string, candidateId: string, assetId: string) {
    const [requirement, candidate, asset] = await Promise.all([
      this.visuals.getRequirementForMaterialization(requirementId),
      this.visuals.getCandidate(candidateId),
      this.assets.findById(assetId),
    ]);
    if (!requirement || !candidate || candidate.requirementId !== requirementId) return undefined;
    const selected = requirement.selectedCandidateId === candidateId && candidate.status === 'selected';
    if (!selected && candidate.status !== 'approved') return undefined;
    if (!['image', 'video'].includes(candidate.mediaType) || candidate.mediaType !== requirement.expectedMediaType) return undefined;
    if (!asset || asset.status !== 'ready' || asset.requirementId !== requirementId || asset.sourceId !== candidateId ||
      asset.mediaType !== requirement.expectedMediaType || asset.mediaType !== candidate.mediaType ||
      asset.storageProvider !== this.storage.id || !await this.storage.exists(asset.storageKey)) return undefined;
    return asset;
  }

  async materialize(requirementId: string, candidateId: string) {
    const [requirement, candidate] = await Promise.all([this.visuals.getRequirementForMaterialization(requirementId), this.visuals.getCandidate(candidateId)]);
    if (!requirement || !candidate || candidate.requirementId !== requirementId) throw new Error('Visual candidate not found');
    const selected = requirement.selectedCandidateId === candidateId && candidate.status === 'selected';
    if (!selected && candidate.status !== 'approved') throw new Error('Candidate is not selected or approved');
    const licence = requirement.licenceRequirements as Record<string, boolean>;
    if (requirement.manualReviewRequired) throw new Error('Candidate rights require review');
    if (!candidate.licenceType?.trim() || typeof candidate.commercialUseAllowed !== 'boolean' || typeof candidate.modificationAllowed !== 'boolean') throw new Error('Candidate rights require review');
    if (licence.commercialUseRequired && candidate.commercialUseAllowed !== true) throw new Error('Candidate commercial-use permission is required');
    if (licence.modificationAllowed && candidate.modificationAllowed !== true) throw new Error('Candidate modification permission is required');
    if (licence.attributionRequired && !candidate.attributionText?.trim()) throw new Error('Candidate attribution is required');
    if (licence.unknownLicenceRequiresManualReview && (!candidate.licenceType?.trim() || typeof candidate.commercialUseAllowed !== 'boolean' || typeof candidate.modificationAllowed !== 'boolean')) throw new Error('Candidate rights require review');
    if (licence.provenanceRequired && (!candidate.licenceType?.trim() || (!candidate.providerAssetId && !candidate.sourceUrl))) throw new Error('Candidate provenance is required');
    if (!candidate.sourceUrl) throw new Error('Candidate source URL is required');
    const url = new URL(candidate.sourceUrl); if (url.protocol !== 'https:') throw new Error('Candidate source URL must use HTTPS');
    if (!['image', 'video'].includes(candidate.mediaType) || candidate.mediaType !== requirement.expectedMediaType) throw new Error('Candidate media is incompatible');
    const response = await this.fetchPublic(url); if (!response.ok) throw new Error(`Media download failed (${response.status})`);
    const declaredSize = Number(response.headers.get('content-length') || 0); if (declaredSize > this.maxBytes) throw new Error('Media exceeds configured size limit');
    const bytes = await this.readBounded(response); if (!bytes.length) throw new Error('Media content is malformed or incompatible');
    const mimeType = (response.headers.get('content-type') || candidate.mimeType || '').split(';')[0].trim().toLowerCase();
    if (!this.allowed.has(mimeType) || mediaTypeByMime[mimeType] !== candidate.mediaType || mediaTypeByMime[mimeType] !== requirement.expectedMediaType || candidate.mimeType && candidate.mimeType !== mimeType || !this.validSignature(mimeType, bytes)) throw new Error('Media content is malformed or incompatible');
    const checksum = digest(bytes); if (candidate.checksum && candidate.checksum !== checksum) throw new Error('Media checksum mismatch');
    const sourceIdentity = candidate.mediaIdentity || `${candidate.provider}:${candidate.providerAssetId || candidate.sourceUrl}`;
    const existing = await this.assets.findReadyBySourceChecksum(sourceIdentity, checksum);
    if (existing && await this.storage.exists(existing.storageKey)) return existing;
    const storageKey = `${candidate.mediaType}/${checksum.slice(0, 2)}/${checksum}.${extension[mimeType]}`;
    const id = `ma_${digest(`${candidate.mediaType}:${mimeType}:${sourceIdentity}:${checksum}:${bytes.length}`).slice(0, 32)}`;
    await this.storage.materialize({ storageKey, bytes });
    return this.assets.createReady({ id, mediaType: candidate.mediaType, mimeType, checksum, sizeBytes: bytes.length,
      sourceType: 'visual_asset_candidate', sourceId: candidate.id, requirementId, sourceIdentity, storageProvider: this.storage.id,
      storageKey, status: 'ready', createdAt: new Date().toISOString() });
  }

  private async fetchPublic(initialUrl: URL) {
    let url = initialUrl;
    for (let redirects = 0; ; redirects++) {
      if (!safeHttpsUrl(url.toString())) throw new Error('Candidate source URL is not public');
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const addresses = isIP(host) ? [host] : (await this.resolver(host)).map(value => value.address);
      if (!addresses.length || addresses.some(address => !isGlobalAddress(address))) throw new Error('Candidate source URL is not public');
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Media download request timed out')); }, this.requestTimeoutMs); });
      let response: Response;
      try { response = await Promise.race([this.fetcher(url, addresses, controller.signal), timeout]); }
      finally { if (timer) clearTimeout(timer); }
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      if (redirects >= this.maxRedirects) throw new Error('Media download exceeded redirect limit');
      const location = response.headers.get('location');
      if (!location) throw new Error('Media download redirect is invalid');
      url = new URL(location, url);
    }
  }

  private fetchPinned(url: URL, addresses: string[], signal: AbortSignal) {
    return new Promise<Response>((resolve, reject) => {
      let index = 0;
      const req = request(url, {
        method: 'GET', headers: { host: url.host }, servername: url.hostname,
        lookup: (_hostname, _options, callback) => {
          const address = addresses[index++ % addresses.length];
          callback(null, address, isIP(address));
        },
      }, incoming => {
        const remote = incoming.socket.remoteAddress?.replace(/^::ffff:/, '');
        if (!remote || !addresses.includes(remote) || !isGlobalAddress(remote)) { incoming.destroy(); reject(new Error('Candidate source URL is not public')); return; }
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        resolve(new Response(Readable.toWeb(incoming) as ReadableStream, { status: incoming.statusCode ?? 500, headers }));
      });
      signal.addEventListener('abort', () => req.destroy(new Error('Media download request timed out')), { once: true });
      req.on('error', reject); req.end();
    });
  }

  private async readBounded(response: Response) {
    if (!response.body) throw new Error('Media download returned no body');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Media download body timed out')), this.downloadTimeoutMs); });
    try {
      for (;;) {
        const { done, value } = await Promise.race([reader.read(), timeout]); if (done) break;
        size += value.byteLength;
        if (size > this.maxBytes) { await reader.cancel(); throw new Error('Media exceeds configured size limit'); }
        chunks.push(value);
      }
    } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
    finally { if (timer) clearTimeout(timer); reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }

  private validSignature(mime: string, b: Uint8Array) {
    const text = (start: number, end: number) => new TextDecoder().decode(b.slice(start, end));
    const u32 = (offset: number, little = false) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(offset, little);
    if (mime === 'image/png') {
      if (b.length < 45 || ![137,80,78,71,13,10,26,10].every((v, i) => b[i] === v)) return false;
      let offset = 8, ihdr = false, idat = false, iend = false;
      while (offset + 12 <= b.length) { const length = u32(offset); const end = offset + 12 + length; if (end > b.length || crc32(b.slice(offset + 4, offset + 8 + length)) !== u32(offset + 8 + length)) return false; const type = text(offset + 4, offset + 8); ihdr ||= type === 'IHDR' && offset === 8 && length === 13; idat ||= type === 'IDAT' && length > 0; iend ||= type === 'IEND' && length === 0; offset = end; if (iend) break; }
      return ihdr && idat && iend && offset === b.length;
    }
    if (mime === 'image/jpeg') {
      if (b.length < 10 || b[0] !== 0xff || b[1] !== 0xd8 || b.at(-2) !== 0xff || b.at(-1) !== 0xd9) return false;
      let offset = 2, frame = false;
      while (offset < b.length - 2) { if (b[offset++] !== 0xff) return false; while (b[offset] === 0xff) offset++; const marker = b[offset++]; if (marker === 0xda) return frame; if (marker === 0xd9) break; if (offset + 2 > b.length) return false; const length = (b[offset] << 8) | b[offset + 1]; if (length < 2 || offset + length > b.length) return false; frame ||= marker >= 0xc0 && marker <= 0xc3; offset += length; }
      return false;
    }
    if (mime === 'image/webp') return b.length >= 20 && text(0,4) === 'RIFF' && text(8,12) === 'WEBP' && u32(4, true) + 8 === b.length && ['VP8 ','VP8L','VP8X'].includes(text(12,16)) && u32(16, true) + 20 <= b.length;
    if (mime === 'video/mp4') { let offset = 0, ftyp = false, media = false; while (offset + 8 <= b.length) { const size = u32(offset); if (size < 8 || offset + size > b.length) return false; const type = text(offset + 4, offset + 8); ftyp ||= offset === 0 && type === 'ftyp' && size >= 16; media ||= type === 'moov' || type === 'mdat'; offset += size; } return ftyp && media && offset === b.length; }
    return false;
  }
}
