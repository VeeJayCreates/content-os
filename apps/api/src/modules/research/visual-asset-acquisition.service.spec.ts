jest.mock('@content-os/storage', () => ({ VisualAssetRepository: class {}, VisualAssetAcquisitionRepository: class {} }));
jest.mock('@content-os/contracts', () => ({
  VisualAssetManifestStatus: { STALE: 'stale' },
  VisualAssetProviderCapability: { IMAGE_SEARCH: 'image_search', VIDEO_SEARCH: 'video_search' },
}));

import { BadRequestException, ConflictException } from '@nestjs/common';
import { VisualAssetAcquisitionProviderRegistry } from './visual-asset-acquisition-provider.registry';
import { PexelsVisualAssetProvider } from './pexels-visual-asset.provider';
import { VisualAssetProviderError } from './visual-asset-acquisition-provider.registry';
import { normalizeProviderCandidate, normalizeQueries, planRequirement, safeHttpsUrl, safeResolvedHttpsUrl, VisualAssetAcquisitionService } from './visual-asset-acquisition.service';

const requirement = (overrides = {}) => ({ id: 'req-1', plannedSceneId: 'scene-1', requirementType: 'stock_footage', acquisitionStrategy: 'provider_search', primarySearchQuery: ' India  France ', alternateSearchQueries: ['India France', ' India-France '], expectedMediaType: 'video', targetAspectRatio: '9:16', preferredOrientation: 'portrait', licenceRequirements: { commercialUseRequired: true, modificationAllowed: true, attributionRequired: false, provenanceRequired: true, unknownLicenceRequiresManualReview: true }, manualReviewRequired: false, reviewReasons: [], ...overrides });
const provider = (overrides = {}) => ({ id: 'provider-a', enabled: true, priority: 1, capabilities: ['video_search'], strategies: ['provider_search'], resultLimit: 5, version: 'v1', configurationIdentity: 'public-v1', search: jest.fn().mockResolvedValue([]), ...overrides });
const manifest = (overrides = {}) => ({ id: 'manifest', projectId: 'project', inputHash: 'manifest-hash', status: 'needs_review', requirements: [requirement()], ...overrides });
const persistedProviderPlan = [{ id: 'provider-a', version: 'v1', configurationIdentity: 'public-v1' }];

describe('VisualAssetAcquisitionService', () => {
  const registry = new VisualAssetAcquisitionProviderRegistry();
  const setup = (overrides: any = {}) => {
    const manifests = { findByContentScriptId: jest.fn().mockResolvedValue(manifest()), upsertCandidate: jest.fn(async (_id, candidate) => ({ id: 'candidate', ...candidate })) };
    const runs = { findCompatible: jest.fn().mockResolvedValue(undefined), findByContentScriptId: jest.fn(), findById: jest.fn(), claimExecution: jest.fn().mockResolvedValue(true), failExecution: jest.fn().mockResolvedValue(undefined), upsertPrepared: jest.fn(async (run, plans) => ({ id: 'run-1', ...run, status: 'prepared', plans })), persistFailure: jest.fn().mockResolvedValue(undefined), recordExecution: jest.fn(async (_id, counts) => counts) };
    return { manifests, runs, service: new VisualAssetAcquisitionService(manifests as never, runs as never, registry), ...overrides };
  };

  it('normalizes bounded queries without inventing context', () => expect(normalizeQueries(' India  France ', ['India France', ' India  France '])).toEqual(['India France']));

  it('reads the latest persisted run for only the requested content script', async () => {
    const { service, runs } = setup();
    const persisted = { id: 'run-1', contentScriptId: 'script-1', status: 'failed', failureCode: 'provider_unavailable', providerRequestCount: 2, plans: [{ requirementId: 'req-1' }] };
    runs.findByContentScriptId.mockResolvedValue(persisted);

    await expect(service.findLatest('script-1')).resolves.toBe(persisted);
    expect(runs.findByContentScriptId).toHaveBeenCalledWith('script-1');
  });

  it('returns a deterministic not-found error when no acquisition run exists', async () => {
    const { service } = setup();

    await expect(service.findLatest('missing-script')).rejects.toMatchObject({ status: 404, message: 'Visual asset acquisition run not found' });
  });

  it('routes internal and manual requirements away from external acquisition', () => {
    expect(planRequirement(requirement({ acquisitionStrategy: 'none_required' })).automaticAcquisitionAllowed).toBe(false);
    expect(planRequirement(requirement({ manualReviewRequired: true })).skipReason).toBe('manual_review_required');
  });

  it('rejects unsafe URLs and incomplete or incompatible provider results', async () => {
    const publicDns = jest.fn().mockResolvedValue([{ address: '93.184.216.34' }]);
    expect(safeHttpsUrl('file:///tmp/x')).toBe(false);
    expect(safeHttpsUrl('https://127.0.0.1/x')).toBe(false);
    await expect(normalizeProviderCandidate(requirement(), { provider: 'fake', providerAssetId: 'a', sourceUrl: 'https://example.invalid/a', mediaType: 'video', mimeType: 'video/mp4', width: 100, height: 100, durationMs: 1000, commercialUseAllowed: true, modificationAllowed: true }, publicDns)).resolves.toMatchObject({ status: 'discovered', commercialUseAllowed: true });
    await expect(normalizeProviderCandidate(requirement(), { provider: 'fake', providerAssetId: 'a', sourceUrl: 'https://example.invalid/a', mediaType: 'video', mimeType: 'image/jpeg' }, publicDns)).resolves.toBeNull();
    await expect(normalizeProviderCandidate(requirement(), { providerAssetId: 'a', sourceUrl: 'https://example.invalid/a', mediaType: 'image' }, publicDns)).resolves.toBeNull();
  });

  it.each([
    'https://0.0.0.0/x', 'https://127.1.2.3/x', 'https://169.254.169.254/latest/meta-data',
    'https://100.64.0.1/x', 'https://192.0.2.1/x', 'https://224.0.0.1/x', 'https://255.255.255.255/x',
    'https://[::]/x', 'https://[::1]/x', 'https://[fe80::1]/x', 'https://[fc00::1]/x',
    'https://[ff02::1]/x', 'https://[2001:db8::1]/x', 'https://[::ffff:127.0.0.1]/x',
  ])('rejects non-public network URL %s', (url) => expect(safeHttpsUrl(url)).toBe(false));

  it('accepts public IPv4, IPv6, and DNS HTTPS URLs', () => {
    expect(safeHttpsUrl('https://8.8.8.8/asset')).toBe(true);
    expect(safeHttpsUrl('https://[2606:4700:4700::1111]/asset')).toBe(true);
    expect(safeHttpsUrl('https://cdn.example.com/asset')).toBe(true);
  });

  it.each(['https://[100::1]/asset', 'https://[2001:2::1]/asset', 'https://[3fff::1]/asset'])('rejects reserved IPv6 literal %s', (url) => expect(safeHttpsUrl(url)).toBe(false));

  it('rejects DNS names resolving to any non-global target', async () => {
    await expect(safeResolvedHttpsUrl('https://cdn.example.test/a', async () => [{ address: '93.184.216.34' }])).resolves.toBe(true);
    for (const address of ['10.0.0.1', '169.254.169.254', 'fe80::1', '2001:db8::1']) await expect(safeResolvedHttpsUrl('https://cdn.example.test/a', async () => [{ address }])).resolves.toBe(false);
    await expect(safeResolvedHttpsUrl('https://cdn.example.test/a', async () => [{ address: '93.184.216.34' }, { address: '127.0.0.1' }])).resolves.toBe(false);
    await expect(safeResolvedHttpsUrl('https://missing.example.test/a', async () => { throw new Error('not found'); })).resolves.toBe(false);
  });

  it('preserves explicit licence denial and rejects object-valued identities', async () => {
    const publicDns = jest.fn().mockResolvedValue([{ address: '93.184.216.34' }]);
    const denied = await normalizeProviderCandidate(requirement(), { provider: 'provider-a', providerAssetId: 'asset', sourceUrl: 'https://example.invalid/a.mp4', mediaType: 'video', mimeType: 'video/mp4', commercialUseAllowed: false, modificationAllowed: false }, publicDns);
    expect(denied).toMatchObject({ commercialUseAllowed: false, modificationAllowed: false, rejectionReasons: expect.arrayContaining(['commercial_use_not_allowed', 'modification_not_allowed']) });
    await expect(normalizeProviderCandidate(requirement(), { provider: 'provider-a', providerAssetId: { id: 'asset' }, sourceUrl: 'https://example.invalid/a.mp4', mediaType: 'video', mimeType: 'video/mp4' }, publicDns)).resolves.toBeNull();
  });

  it('routes eligible requirements only to deterministic compatible enabled providers', async () => {
    const { service } = setup();
    const result = await service.prepare('script', [provider({ id: 'provider-b', priority: 2 }), provider({ id: 'provider-a', priority: 1 }), provider({ id: 'disabled', enabled: false, priority: 0 })] as never);
    expect(result.plans[0].providerIds).toEqual(['provider-a']);
    expect(result.plans[0].resultLimit).toBe(5);
    expect(result.providerRequestCount).toBe(0);
  });

  it('skips an external-search requirement with no compatible provider', async () => {
    const { service } = setup();
    const result = await service.prepare('script', [provider({ capabilities: ['image_search'] })] as never);
    expect(result.plans[0]).toMatchObject({ automaticAcquisitionAllowed: false, skipReason: 'no_compatible_provider', providerIds: [] });
  });

  it('rejects duplicate or malformed provider configuration before persistence', async () => {
    const { service, runs } = setup();
    await expect(service.prepare('script', [provider(), provider()] as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.prepare('script', [provider({ resultLimit: 0 })] as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(runs.upsertPrepared).not.toHaveBeenCalled();
  });

  it('reuses a compatible prepared run and invalidates it for provider configuration changes', async () => {
    const { service, runs } = setup();
    runs.findCompatible.mockResolvedValueOnce({ id: 'ready-run', status: 'prepared', plans: [] }).mockResolvedValueOnce(undefined);
    const reused = await service.prepare('script', [provider()] as never);
    await service.prepare('script', [provider({ configurationIdentity: 'public-v2' })] as never);
    expect(reused.id).toBe('ready-run');
    expect(runs.upsertPrepared).toHaveBeenCalledTimes(1);
  });

  it('persists a sanitized failed attempt without corrupting an existing prepared run', async () => {
    const { service, runs } = setup();
    runs.upsertPrepared.mockRejectedValueOnce(new Error('unsafe implementation detail'));
    await expect(service.prepare('script', [provider()] as never)).rejects.toThrow('unsafe implementation detail');
    expect(runs.persistFailure).toHaveBeenCalledWith(expect.any(Object), 'preparation_failed');
  });

  it('blocks duplicate in-flight preparation and never invokes provider methods', async () => {
    const { service, manifests } = setup();
    let release!: () => void;
    manifests.findByContentScriptId.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(manifest()); }));
    const first = service.prepare('script', [provider()] as never);
    await expect(service.prepare('script', [provider()] as never)).rejects.toBeInstanceOf(ConflictException);
    release(); await first;
  });

  it('executes only eligible persisted guidance, normalizes candidates, and never selects one', async () => {
    const { service, manifests, runs } = setup();
    const search = jest.fn().mockResolvedValue([
      { provider: 'provider-a', providerAssetId: 'asset-1', sourceUrl: 'https://8.8.8.8/video.mp4', previewUrl: 'http://unsafe.test/preview.jpg', mediaType: 'video', mimeType: 'video/mp4', width: 1080, height: 1920, durationMs: 5000 },
      { provider: 'provider-a', providerAssetId: 'asset-2', sourceUrl: 'http://unsafe.test/video.mp4', mediaType: 'video' },
    ]);
    runs.findById.mockResolvedValue({ id: 'run-1', status: 'prepared', manifestId: 'manifest', manifestInputHash: 'manifest-hash', contentScriptId: 'script', providerPlan: persistedProviderPlan, plans: [{ ...planRequirement(requirement()), providerIds: ['provider-a'], queries: ['India France'], resultLimit: 5 }] });
    const result = await service.execute('run-1', [provider({ search })] as never);
    expect(search).toHaveBeenCalledWith({ query: 'India France', mediaType: 'video', orientation: 'portrait', limit: 5 });
    expect(manifests.upsertCandidate).toHaveBeenCalledWith('req-1', expect.objectContaining({ status: 'discovered', commercialUseAllowed: null, modificationAllowed: null, previewUrl: null, rejectionReasons: expect.arrayContaining(['provenance_review_required', 'licence_review_required']) }));
    expect((manifests as any).select).toBeUndefined();
    expect(result).toMatchObject({ providerRequestCount: 1, candidatesDiscovered: 2, candidatesAccepted: 1, candidatesRejected: 1 });
  });

  it('fails deterministically when every provider request fails and rejects stale execution inputs', async () => {
    const { service, manifests, runs } = setup();
    runs.findById.mockResolvedValue({ id: 'run-1', status: 'prepared', manifestId: 'manifest', manifestInputHash: 'manifest-hash', contentScriptId: 'script', providerPlan: persistedProviderPlan, plans: [{ ...planRequirement(requirement()), providerIds: ['provider-a'], queries: ['India France'] }] });
    await expect(service.execute('run-1', [provider({ search: jest.fn().mockRejectedValue(new VisualAssetProviderError('provider_http_rejected')) })] as never)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'provider_http_rejected' }) });
    expect(runs.failExecution).toHaveBeenCalledWith('run-1', 'provider_http_rejected', { providerRequestCount: 1, candidatesDiscovered: 0, candidatesAccepted: 0, candidatesRejected: 0 });
    manifests.findByContentScriptId.mockResolvedValueOnce(manifest({ inputHash: 'changed' }));
    await expect(service.execute('run-1', [provider({ search: jest.fn() })] as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('claims a compatible prepared run and persists unavailable Pexels configuration', async () => {
    const { service, runs } = setup();
    const unavailablePexels = new PexelsVisualAssetProvider('', jest.fn() as never);
    runs.findById.mockResolvedValue({ id: 'run-1', status: 'prepared', manifestId: 'manifest', manifestInputHash: 'manifest-hash', contentScriptId: 'script', providerPlan: [{ id: 'pexels', version: 'v1', configurationIdentity: 'pexels-public-api-v1' }], plans: [{ ...planRequirement(requirement()), providerIds: ['pexels'], queries: ['India France'] }] });

    await expect(service.execute('run-1', [unavailablePexels] as never)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'provider_unavailable' }) });
    expect(runs.claimExecution).toHaveBeenCalledWith('run-1');
    expect(runs.failExecution).toHaveBeenCalledWith('run-1', 'provider_unavailable', { providerRequestCount: 1, candidatesDiscovered: 0, candidatesAccepted: 0, candidatesRejected: 0 });
    expect(runs.recordExecution).not.toHaveBeenCalled();
  });

  it('reclaims a compatible failed run and completes valid zero-result responses', async () => {
    const { service, runs } = setup();
    runs.findById.mockResolvedValue({ id: 'run-1', status: 'failed', failureCode: 'provider_network_failure', manifestId: 'manifest', manifestInputHash: 'manifest-hash', contentScriptId: 'script', providerPlan: persistedProviderPlan, plans: [{ ...planRequirement(requirement()), providerIds: ['provider-a'], queries: ['India France'] }] });
    await expect(service.execute('run-1', [provider()] as never)).resolves.toMatchObject({ providerRequestCount: 1, candidatesDiscovered: 0, candidatesAccepted: 0, candidatesRejected: 0 });
    expect(runs.claimExecution).toHaveBeenCalledWith('run-1');
    expect(runs.recordExecution).toHaveBeenCalledWith('run-1', { providerRequestCount: 1, candidatesDiscovered: 0, candidatesAccepted: 0, candidatesRejected: 0 });
  });

  it.each(['preparation_failed', 'unknown_failure'] as const)('rejects non-retryable failed runs with %s', async (failureCode) => {
    const { service, runs } = setup();
    runs.findById.mockResolvedValue({ id: 'run-1', status: 'failed', failureCode, manifestId: 'manifest', manifestInputHash: 'manifest-hash', contentScriptId: 'script', providerPlan: persistedProviderPlan, plans: [] });

    await expect(service.execute('run-1', [provider()] as never)).rejects.toBeInstanceOf(ConflictException);
    expect(runs.claimExecution).not.toHaveBeenCalled();
    expect(runs.recordExecution).not.toHaveBeenCalled();
  });

  it('atomically claims execution and rejects malformed persisted guidance', async () => {
    const { service, runs } = setup();
    runs.findById.mockResolvedValue({ id: 'run-1', status: 'prepared', manifestId: 'manifest', manifestInputHash: 'manifest-hash', contentScriptId: 'script', providerPlan: persistedProviderPlan, plans: [{ ...planRequirement(requirement()), providerIds: ['provider-a'], queries: ['India France'] }] });
    runs.claimExecution.mockResolvedValueOnce(false);
    await expect(service.execute('run-1', [provider()] as never)).rejects.toBeInstanceOf(ConflictException);
    runs.findById.mockResolvedValueOnce({ id: 'run-2', status: 'prepared', manifestId: 'manifest', manifestInputHash: 'manifest-hash', contentScriptId: 'script', providerPlan: persistedProviderPlan, plans: [{ ...planRequirement(requirement()), providerIds: ['provider-a'], queries: ['x'.repeat(301)] }] });
    await expect(service.execute('run-2', [provider()] as never)).rejects.toThrow('Persisted visual asset acquisition plan is invalid');
    runs.findById.mockResolvedValueOnce({ id: 'run-3', status: 'prepared', manifestId: 'manifest', manifestInputHash: 'manifest-hash', contentScriptId: 'script', providerPlan: persistedProviderPlan, plans: [{ ...planRequirement(requirement()), acquisitionStrategy: 'manual', providerIds: ['provider-a'], queries: ['India France'] }] });
    await expect(service.execute('run-3', [provider()] as never)).rejects.toThrow('Persisted visual asset acquisition plan is invalid');
    expect(runs.claimExecution).toHaveBeenCalledTimes(1);
  });

  it('maps the Pexels API response without inferring licence permissions', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ photos: [{ id: 42, width: 1200, height: 800, alt: 'City', photographer: 'Alex', src: { original: 'https://images.pexels.test/original.jpg', medium: 'https://images.pexels.test/medium.jpg' } }] }) });
    const adapter = new PexelsVisualAssetProvider('test-key', fetcher as never);
    const validated = registry.validate([adapter])[0];
    const results = await validated.search({ query: 'Delhi skyline', mediaType: 'image', orientation: 'landscape', limit: 3 }) as any[];
    expect(String(fetcher.mock.calls[0][0])).toContain('query=Delhi+skyline');
    expect(results[0]).toMatchObject({ provider: 'pexels', providerAssetId: '42', licenceType: null, commercialUseAllowed: null, modificationAllowed: null });
  });

  it.each([
    ['unavailable configuration', new PexelsVisualAssetProvider('', jest.fn() as never), 'provider_unavailable'],
    ['network failure', new PexelsVisualAssetProvider('key', jest.fn().mockRejectedValue(new Error('secret')) as never), 'provider_network_failure'],
    ['rejected HTTP response', new PexelsVisualAssetProvider('key', jest.fn().mockResolvedValue({ ok: false }) as never), 'provider_http_rejected'],
    ['malformed response', new PexelsVisualAssetProvider('key', jest.fn().mockResolvedValue({ ok: true, json: async () => ({ photos: null }) }) as never), 'provider_response_malformed'],
  ])('maps Pexels %s to a bounded failure code', async (_case, adapter, code) => {
    await expect(adapter.search({ query: 'safe', mediaType: 'image', orientation: 'portrait', limit: 1 })).rejects.toMatchObject({ code });
  });
});
