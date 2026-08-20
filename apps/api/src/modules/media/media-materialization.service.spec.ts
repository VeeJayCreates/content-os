jest.mock('@content-os/storage', () => ({ MediaAssetRepository: class {}, VisualAssetRepository: class {} }));
import { MediaMaterializationService } from './media-materialization.service';

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
const mp4 = Uint8Array.from([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0,0,0,0,8,109,111,111,118]);
const response = (bytes = png, headers: Record<string,string> = { 'content-type': 'image/png' }) =>
  new Response(bytes, { status: 200, headers });

describe('MediaMaterializationService', () => {
  const requirement = { id: 'req', selectedCandidateId: 'candidate', expectedMediaType: 'image', manualReviewRequired: false, licenceRequirements: { commercialUseRequired: true, modificationAllowed: true, attributionRequired: false, provenanceRequired: true, unknownLicenceRequiresManualReview: true } };
  const candidate = { id: 'candidate', requirementId: 'req', status: 'selected', sourceUrl: 'https://8.8.8.8/image', provider: 'pexels', providerAssetId: '42', mediaIdentity: 'pexels:42', mediaType: 'image', mimeType: 'image/png', checksum: null, licenceType: 'pexels', commercialUseAllowed: true, modificationAllowed: true };
  const visuals = { getRequirementForMaterialization: jest.fn(), getCandidate: jest.fn() };
  const assets = { findById: jest.fn(), findReadyBySourceChecksum: jest.fn(), createReady: jest.fn() };
  const storage = { id: 'local', materialize: jest.fn(), resolve: jest.fn(), exists: jest.fn(), remove: jest.fn() };
  const fetcher = jest.fn();
  const service = (options: Record<string, unknown> = {}) => new MediaMaterializationService(visuals as never, assets as never, storage as never, { fetcher, ...options });
  beforeEach(() => { jest.resetAllMocks(); visuals.getRequirementForMaterialization.mockResolvedValue(requirement); visuals.getCandidate.mockResolvedValue(candidate); assets.findReadyBySourceChecksum.mockResolvedValue(undefined); storage.materialize.mockResolvedValue(true); storage.exists.mockResolvedValue(true); assets.createReady.mockImplementation(async (v) => v); fetcher.mockImplementation(async () => response()); });
  it.each([Number.NaN, 0, -1, Number.POSITIVE_INFINITY, 1.5, 1024 * 1024 * 1024 + 1])('rejects invalid maxBytes configuration %s before downloading', (maxBytes) => {
    expect(() => service({ maxBytes })).toThrow('MEDIA_MAX_BYTES must be a positive integer');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects malformed MEDIA_MAX_BYTES configuration before downloading', () => {
    const previous = process.env.MEDIA_MAX_BYTES;
    process.env.MEDIA_MAX_BYTES = 'not-a-number';
    try { expect(() => service()).toThrow('MEDIA_MAX_BYTES must be a positive integer'); }
    finally { if (previous === undefined) delete process.env.MEDIA_MAX_BYTES; else process.env.MEDIA_MAX_BYTES = previous; }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('persists only provider-neutral metadata after promotion and reconciles retries', async () => {
    const subject = service();
    const first = await subject.materialize('req', 'candidate');
    expect(first.id).toMatch(/^ma_/); expect(first.storageKey).toMatch(/^image\//); expect(JSON.stringify(first)).not.toContain('ContentOS-Media');
    expect(storage.materialize.mock.invocationCallOrder[0]).toBeLessThan(assets.createReady.mock.invocationCallOrder[0]);
    assets.findReadyBySourceChecksum.mockResolvedValue(first);
    await expect(subject.materialize('req', 'candidate')).resolves.toBe(first);
    expect(storage.materialize).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['unapproved', requirement, { ...candidate, status: 'shortlisted' }, 'selected or approved'],
    ['rights unknown', requirement, { ...candidate, licenceType: null }, 'rights require review'],
    ['non-HTTPS', requirement, { ...candidate, sourceUrl: 'http://example.test/a' }, 'HTTPS'],
  ])('rejects %s without writing', async (_label, reqOrCandidate, candidateValue, message) => {
    visuals.getRequirementForMaterialization.mockResolvedValue(reqOrCandidate); visuals.getCandidate.mockResolvedValue(candidateValue);
    await expect(service().materialize('req', 'candidate')).rejects.toThrow(message);
    expect(storage.materialize).not.toHaveBeenCalled(); expect(assets.createReady).not.toHaveBeenCalled();
  });
  it.each([
    ['commercial use', { commercialUseRequired: true }, { commercialUseAllowed: false }, 'commercial-use'],
    ['modification', { modificationAllowed: true }, { modificationAllowed: false }, 'modification'],
    ['attribution', { attributionRequired: true }, { attributionText: null }, 'attribution'],
    ['provenance', { provenanceRequired: true }, { providerAssetId: null, sourceUrl: null }, 'provenance'],
    ['unknown permission', { unknownLicenceRequiresManualReview: true }, { modificationAllowed: null }, 'rights require review'],
  ])('rejects a candidate that violates required %s constraints', async (_label, licenceOverride, candidateOverride, message) => {
    visuals.getRequirementForMaterialization.mockResolvedValue({ ...requirement, licenceRequirements: { ...requirement.licenceRequirements, commercialUseRequired: false, modificationAllowed: false, provenanceRequired: false, unknownLicenceRequiresManualReview: false, ...licenceOverride } });
    visuals.getCandidate.mockResolvedValue({ ...candidate, ...candidateOverride });
    await expect(service().materialize('req', 'candidate')).rejects.toThrow(message);
    expect(fetcher).not.toHaveBeenCalled(); expect(storage.materialize).not.toHaveBeenCalled(); expect(assets.createReady).not.toHaveBeenCalled();
  });
  it('requires known rights even when requirement flags are relaxed', async () => {
    visuals.getRequirementForMaterialization.mockResolvedValue({ ...requirement, licenceRequirements: {} });
    visuals.getCandidate.mockResolvedValue({ ...candidate, licenceType: null, commercialUseAllowed: null, modificationAllowed: null });
    await expect(service().materialize('req', 'candidate')).rejects.toThrow('rights require review');
    expect(fetcher).not.toHaveBeenCalled(); expect(storage.materialize).not.toHaveBeenCalled(); expect(assets.createReady).not.toHaveBeenCalled();
  });
  it('aborts a stalled request at the configured deadline', async () => {
    let aborted = false;
    fetcher.mockImplementation(async (_url, _addresses, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); })));
    await expect(service({ requestTimeoutMs: 10 }).materialize('req', 'candidate')).rejects.toThrow('request timed out');
    expect(aborted).toBe(true); expect(storage.materialize).not.toHaveBeenCalled();
  });
  it('cancels a stalled response body at the configured deadline', async () => {
    let cancelled = false;
    fetcher.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }), { headers: { 'content-type': 'image/png' } }));
    await expect(service({ downloadTimeoutMs: 10 }).materialize('req', 'candidate')).rejects.toThrow('body timed out');
    expect(cancelled).toBe(true); expect(storage.materialize).not.toHaveBeenCalled();
  });
  it('accepts an approved candidate that is not selected, but rejects an unapproved unselected candidate', async () => {
    visuals.getRequirementForMaterialization.mockResolvedValue({ ...requirement, selectedCandidateId: 'other' });
    visuals.getCandidate.mockResolvedValue({ ...candidate, status: 'approved' });
    await expect(service().materialize('req', 'candidate')).resolves.toMatchObject({ sourceId: 'candidate' });
    visuals.getCandidate.mockResolvedValue({ ...candidate, status: 'shortlisted' });
    await expect(service().materialize('req', 'candidate')).rejects.toThrow('selected or approved');
  });
  it.each([
    ['image/png', Uint8Array.from([137,80,78,71,13,10,26,10])],
    ['image/jpeg', Uint8Array.from([255,216,255,217])],
    ['image/webp', Uint8Array.from([82,73,70,70,4,0,0,0,87,69,66,80])],
    ['video/mp4', Uint8Array.from([0,0,0,8,102,116,121,112])],
  ])('rejects structurally corrupt %s content', async (mimeType, bytes) => {
    visuals.getCandidate.mockResolvedValue({ ...candidate, mimeType, mediaType: mimeType === 'video/mp4' ? 'video' : 'image' });
    visuals.getRequirementForMaterialization.mockResolvedValue({ ...requirement, expectedMediaType: mimeType === 'video/mp4' ? 'video' : 'image' });
    fetcher.mockResolvedValue(response(bytes, { 'content-type': mimeType }));
    await expect(service().materialize('req', 'candidate')).rejects.toThrow('malformed');
  });
  it.each([
    ['image candidate with video bytes', 'image', 'image', 'video/mp4', mp4],
    ['video candidate with image bytes', 'video', 'video', 'image/png', png],
  ])('rejects %s when candidate MIME metadata is absent', async (_label, mediaType, expectedMediaType, mimeType, bytes) => {
    visuals.getCandidate.mockResolvedValue({ ...candidate, mediaType, mimeType: null });
    visuals.getRequirementForMaterialization.mockResolvedValue({ ...requirement, expectedMediaType });
    fetcher.mockResolvedValue(response(bytes, { 'content-type': mimeType }));
    await expect(service().materialize('req', 'candidate')).rejects.toThrow('malformed or incompatible');
    expect(storage.materialize).not.toHaveBeenCalled(); expect(assets.createReady).not.toHaveBeenCalled();
  });
  it('rejects oversized and malformed downloads before promotion', async () => {
    fetcher.mockResolvedValue(response(Uint8Array.from([1,2]), { 'content-type': 'image/png', 'content-length': '200' }));
    await expect(service({ maxBytes: 100 }).materialize('req', 'candidate')).rejects.toThrow('size limit');
    fetcher.mockResolvedValue(response(Uint8Array.from([1,2])));
    await expect(service().materialize('req', 'candidate')).rejects.toThrow('malformed');
  });
  it('stops reading a chunked body as soon as the byte limit is exceeded', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(Uint8Array.from([137,80,78,71,13,10])); controller.enqueue(Uint8Array.from([26,10,0])); },
      cancel() { cancelled = true; },
    });
    fetcher.mockResolvedValue(new Response(body, { headers: { 'content-type': 'image/png' } }));
    await expect(service({ maxBytes: 8 }).materialize('req', 'candidate')).rejects.toThrow('size limit');
    expect(cancelled).toBe(true); expect(storage.materialize).not.toHaveBeenCalled();
  });
  it.each(['https://127.0.0.1/a', 'https://[::1]/a', 'https://10.0.0.1/a', 'https://[fc00::1]/a'])('rejects non-public address %s', async (sourceUrl) => {
    visuals.getCandidate.mockResolvedValue({ ...candidate, sourceUrl });
    await expect(service().materialize('req', 'candidate')).rejects.toThrow('not public');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects a hostname resolving to a non-public address', async () => {
    visuals.getCandidate.mockResolvedValue({ ...candidate, sourceUrl: 'https://media.example/image' });
    const resolver = jest.fn().mockResolvedValue([{ address: '192.168.1.10' }]);
    await expect(service({ resolver }).materialize('req', 'candidate')).rejects.toThrow('not public');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('validates every redirect destination before following it', async () => {
    fetcher.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/internal' } }));
    await expect(service().materialize('req', 'candidate')).rejects.toThrow('not public');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('pins the connection to the single validated DNS result to prevent rebinding', async () => {
    visuals.getCandidate.mockResolvedValue({ ...candidate, sourceUrl: 'https://media.example/image' });
    const resolver = jest.fn().mockResolvedValue([{ address: '8.8.8.8' }]);
    await service({ resolver }).materialize('req', 'candidate');
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ hostname: 'media.example' }), ['8.8.8.8'], expect.any(AbortSignal));
  });
  it('recreates a missing object instead of returning stale ready metadata', async () => {
    const existing = { id: 'ma_existing', sourceIdentity: candidate.mediaIdentity, checksum: 'unused', storageKey: 'image/missing.png', status: 'ready' };
    const expectedChecksum = '4c4b6a3be1314ab86138bef4314dde02239f8e870645b359c2a78b63ae6a75f1';
    assets.findReadyBySourceChecksum.mockImplementation(async (_source, checksum) => checksum === expectedChecksum ? { ...existing, checksum } : undefined);
    storage.exists.mockResolvedValue(false); assets.createReady.mockResolvedValue({ ...existing, checksum: expectedChecksum });
    await expect(service().materialize('req', 'candidate')).resolves.toMatchObject({ id: 'ma_existing' });
    expect(storage.materialize).toHaveBeenCalled();
  });
  it('does not reuse a ready row when its stored object is missing', async () => {
    assets.findById.mockResolvedValue({ id: 'ma_missing', status: 'ready', requirementId: 'req', sourceId: 'candidate', mediaType: 'image', storageProvider: 'local', storageKey: 'image/missing.png' });
    storage.exists.mockResolvedValue(false);
    await expect(service().findCompatibleReadyAsset('req', 'candidate', 'ma_missing')).resolves.toBeUndefined();
  });
  it('does not reuse a ready row whose media type conflicts with the requirement', async () => {
    assets.findById.mockResolvedValue({ id: 'ma_video', status: 'ready', requirementId: 'req', sourceId: 'candidate', mediaType: 'video', storageProvider: 'local', storageKey: 'video/file.mp4' });
    await expect(service().findCompatibleReadyAsset('req', 'candidate', 'ma_video')).resolves.toBeUndefined();
    expect(storage.exists).not.toHaveBeenCalled();
  });
  it('does not remove shared content-addressed bytes when one concurrent metadata write fails', async () => {
    assets.createReady.mockRejectedValueOnce(new Error('database failed')).mockImplementationOnce(async (value) => value);
    const [failed, successful] = await Promise.allSettled([service().materialize('req', 'candidate'), service().materialize('req', 'candidate')]);
    expect(failed).toMatchObject({ status: 'rejected', reason: new Error('database failed') });
    expect(successful).toMatchObject({ status: 'fulfilled', value: { status: 'ready' } });
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
