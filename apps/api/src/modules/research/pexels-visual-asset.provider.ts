import { Injectable, Optional } from '@nestjs/common';
import { VisualAssetProviderCapability } from '@content-os/contracts';

import type { VisualAssetAcquisitionProvider, VisualAssetProviderSearchRequest } from './visual-asset-acquisition-provider.registry';

type FetchLike = typeof fetch;

@Injectable()
export class PexelsVisualAssetProvider implements VisualAssetAcquisitionProvider {
  readonly id = 'pexels';
  readonly enabled: boolean;
  readonly priority = 100;
  readonly capabilities = [VisualAssetProviderCapability.IMAGE_SEARCH, VisualAssetProviderCapability.VIDEO_SEARCH];
  readonly strategies = ['provider_search'];
  readonly resultLimit = 15;
  readonly version = 'v1';
  readonly configurationIdentity = 'pexels-public-api-v1';

  constructor(@Optional() private readonly apiKey = process.env.PEXELS_API_KEY ?? '', @Optional() private readonly fetcher: FetchLike = fetch) {
    this.enabled = this.apiKey.length > 0;
  }

  async search(request: VisualAssetProviderSearchRequest): Promise<unknown[]> {
    if (!this.enabled) throw new Error('provider_unavailable');
    const endpoint = request.mediaType === 'video' ? 'videos/search' : 'v1/search';
    const url = new URL(`https://api.pexels.com/${endpoint}`);
    url.searchParams.set('query', request.query);
    url.searchParams.set('per_page', String(Math.min(request.limit, this.resultLimit)));
    if (['landscape', 'portrait', 'square'].includes(request.orientation)) url.searchParams.set('orientation', request.orientation);
    const response = await this.fetcher(url, { headers: { Authorization: this.apiKey }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('provider_request_failed');
    const body = await response.json() as any;
    const entries = request.mediaType === 'video' ? body?.videos : body?.photos;
    if (!Array.isArray(entries)) throw new Error('provider_response_invalid');
    return entries.slice(0, request.limit).map((entry: any) => request.mediaType === 'video' ? this.video(entry) : this.image(entry));
  }

  private image(entry: any) {
    return { provider: this.id, providerAssetId: entry?.id == null ? null : String(entry.id), sourceUrl: entry?.src?.original, previewUrl: entry?.src?.medium, mediaType: 'image', mimeType: 'image/jpeg', width: entry?.width, height: entry?.height, title: entry?.alt ?? null, licenceType: null, licenceUrl: null, attributionText: entry?.photographer ? `Photo by ${entry.photographer} on Pexels` : null, commercialUseAllowed: null, modificationAllowed: null, providerScore: null };
  }

  private video(entry: any) {
    const files = Array.isArray(entry?.video_files) ? entry.video_files.filter((file: any) => file?.link?.startsWith('https://') && file?.file_type?.startsWith('video/')).sort((a: any, b: any) => (b.width ?? 0) - (a.width ?? 0)) : [];
    const file = files[0];
    return { provider: this.id, providerAssetId: entry?.id == null ? null : String(entry.id), sourceUrl: file?.link, previewUrl: entry?.image, mediaType: 'video', mimeType: file?.file_type ?? null, width: file?.width ?? entry?.width, height: file?.height ?? entry?.height, durationMs: Number.isFinite(entry?.duration) ? entry.duration * 1000 : null, title: null, licenceType: null, licenceUrl: null, attributionText: entry?.user?.name ? `Video by ${entry.user.name} on Pexels` : null, commercialUseAllowed: null, modificationAllowed: null, providerScore: null };
  }
}
