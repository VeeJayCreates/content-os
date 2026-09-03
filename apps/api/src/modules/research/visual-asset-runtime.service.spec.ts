jest.mock('@content-os/storage', () => ({
  AudioGenerationRepository: class {}, ContentScriptRepository: class {}, ScenePlanRepository: class {}, VisualAssetRepository: class {},
}));
jest.mock('@content-os/contracts', () => ({
  AudioGenerationStatus: { READY: 'ready' },
  ScenePlanStatus: { READY: 'ready' },
  VisualAssetCandidateStatus: { DISCOVERED: 'discovered', REJECTED: 'rejected' },
  VisualAssetManifestStatus: { READY: 'ready', NEEDS_REVIEW: 'needs_review', STALE: 'stale' },
  SceneMediaStrategy: { STOCK_OR_SOURCE_FOOTAGE: 'stock_or_source_footage', TEXT_ONLY: 'text_only', REUSABLE_MAP_ANIMATION: 'reusable_map_animation' }, validateInternalVisualSpecification: (value:any) => value,
}));

import { createInternalVisualSpecification, VisualAssetRuntimeService } from './visual-asset-runtime.service';

describe('Internal visual specification generation', () => {
  const mapScene = {
    primarySearchQuery: 'Named route overview',
    visualDescription: 'Zoomed-in map of a narrow chokepoint with a pressure pulse.',
    onScreenText: 'Operational pressure',
    explicitLocations: ['Named Region', 'Named Region'],
  };

  it('compiles explicit scene intent into deterministic bounded map primitives without coordinates', () => {
    const first: any = createInternalVisualSpecification('reusable_map_animation', mapScene);
    const second: any = createInternalVisualSpecification('reusable_map_animation', mapScene);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ type: 'map', spec: { viewport: { framing: 'close', geometryStatus: 'unavailable' }, highlightedRegions: ['Named Region'], regionDetails: [{ label: 'Named Region', geometryStatus: 'named_region' }], markers: [], routes: [], zones: [{ kind: 'chokepoint' }, { kind: 'pressure' }], labels: ['Operational pressure'] } });
  });

  it('compiles flow and pressure concepts into executable primitives without descriptive prose or coordinates', () => {
    const visual: any = createInternalVisualSpecification('programmatic_animation', { primarySearchQuery: 'Corridor traffic', visualDescription: 'Traffic flowing through a narrow corridor slows as a pressure wave approaches.', onScreenText: 'Pressure rises' });
    expect(visual).toMatchObject({ type: 'flow_or_corridor', spec: { direction: 'forward', lanes: [], laneConfiguration: [{ role: 'primary', geometryStatus: 'unavailable' }], movingEntities: ['generic'], entityConfiguration: [{ kind: 'generic', count: 3 }], compression: 'pressure', progression: 'approach', pressureZoneDetails: { kind: 'chokepoint' }, labels: ['Pressure rises'] } });
    expect(JSON.stringify(visual)).not.toContain('Traffic flowing');
  });
});

const candidate = (overrides = {}) => ({
  id: 'candidate-a', provider: 'provider-a', providerAssetId: 'asset-a', sourceUrl: 'https://example.test/a', mediaType: 'image',
  commercialUseAllowed: true, modificationAllowed: true, attributionText: null, status: 'discovered', ...overrides,
});
const requirement = (overrides = {}) => ({
  id: 'requirement-a', expectedMediaType: 'image', acquisitionStrategy: 'provider_search', manualReviewRequired: false,
  licenceRequirements: { commercialUseRequired: true, modificationAllowed: true, attributionRequired: false }, ...overrides,
});
const manifest = (overrides = {}) => ({ id: 'manifest-a', status: 'needs_review', requirements: [requirement()], ...overrides });

describe('VisualAssetRuntimeService candidate lifecycle', () => {
  const scripts = {};
  const plans = {};
  const audio = {};
  const repository = {
    findByContentScriptId: jest.fn(), listCandidates: jest.fn(), upsertCandidate: jest.fn(), select: jest.fn(), reject: jest.fn(), clear: jest.fn(), recalculateManifestStatus: jest.fn(),
  };
  const service = () => new VisualAssetRuntimeService(scripts as never, plans as never, audio as never, repository as never);

  beforeEach(() => {
    jest.resetAllMocks();
    repository.findByContentScriptId.mockResolvedValue(manifest());
    repository.listCandidates.mockResolvedValue([candidate()]);
    repository.upsertCandidate.mockImplementation(async (_id, input) => ({ id: 'candidate-a', ...input }));
  });

  it('keeps a newly prepared asset-requiring manifest in needs_review until a candidate is selected', async () => {
    const preparedManifest = {
      id: 'manifest-a', status: 'needs_review', requirements: [],
    };
    const prepareRepository = { findByContentScriptId: jest.fn().mockResolvedValue(undefined), upsert: jest.fn().mockResolvedValue(preparedManifest) };
    const runtime = new VisualAssetRuntimeService(
      { findById: jest.fn().mockResolvedValue({ id: 'script-a', projectId: 'project-a', status: 'ready', inputHash: 'script-input', fullScript: 'Narration.' }) } as never,
      { findByContentScriptId: jest.fn().mockResolvedValue({ id: 'plan-a', projectId: 'project-a', status: 'ready', inputHash: 'plan-input', scenes: [{ id: 'scene-a', narration: 'Narration.', visualDescription: 'Visual', mediaStrategy: 'stock_or_source_footage', alternateSearchQueries: [], citedFactIds: [], estimatedDurationMs: 1000 }] }) } as never,
      { findByContentScriptId: jest.fn().mockResolvedValue(undefined) } as never,
      prepareRepository as never,
    );
    await expect(runtime.prepare('script-a')).resolves.toEqual(preparedManifest);
    expect(prepareRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'needs_review', completedAt: null }), expect.any(Array));
  });

  it('treats a deterministic text-card specification as internal rather than ambiguous external acquisition', async () => {
    const prepareRepository = { findByContentScriptId: jest.fn().mockResolvedValue(undefined), upsert: jest.fn(async (data, requirements) => ({ id: 'manifest-a', ...data, requirements })) };
    const runtime = new VisualAssetRuntimeService(
      { findById: jest.fn().mockResolvedValue({ id: 'script-a', projectId: 'project-a', status: 'ready', inputHash: 'script-input', fullScript: 'Narration.' }) } as never,
      { findByContentScriptId: jest.fn().mockResolvedValue({ id: 'plan-a', projectId: 'project-a', status: 'ready', inputHash: 'plan-input', scenes: [{ id: 'scene-a', narration: 'Narration.', visualDescription: 'This card explains the next point.', mediaStrategy: 'text_only', primarySearchQuery: null, alternateSearchQueries: [], citedFactIds: [], estimatedDurationMs: 1000, onScreenText: 'Next point' }] }) } as never,
      { findByContentScriptId: jest.fn().mockResolvedValue(undefined) } as never,
      prepareRepository as never,
    );
    const result: any = await runtime.prepare('script-a');
    expect(result.status).toBe('ready');
    expect(result.requirements[0]).toMatchObject({ acquisitionStrategy: 'none_required', manualReviewRequired: false, reviewReasons: [], textCardSpecification: { headline: 'Next point' } });
  });

  it('passes only selected authoritative entities to exact geographic resolution for map requirements', async () => {
    const entity = { id: 'entity-1', canonicalName: 'Reviewed Strait', aliases: [], entityType: 'strait', sourceFactIds: ['fact-1'], sourceSignalIds: ['signal-1'] };
    const resolver = { resolve: jest.fn().mockResolvedValue([{ id: 'reference-1', canonicalName: entity.canonicalName, point: null, bounds: null, geometryReference: 'reviewed', entityType: 'strait', geometryStatus: 'verified_geometry_reference', provenance: { sourceId: 'source', reference: 'record', version: 'v1', revision: 1 } }]) };
    const repository = { findByContentScriptId: jest.fn().mockResolvedValue(undefined), upsert: jest.fn(async (data, requirements) => ({ ...data, requirements })) };
    const runtime = new VisualAssetRuntimeService(
      { findById: jest.fn().mockResolvedValue({ id: 'script-a', projectId: 'project-a', status: 'ready', inputHash: 'script-input', fullScript: 'Narration.', geographicEntities: [entity] }) } as never,
      { findByContentScriptId: jest.fn().mockResolvedValue({ id: 'plan-a', projectId: 'project-a', status: 'ready', inputHash: 'plan-input', scenes: [{ id: 'scene-a', narration: 'Narration.', visualDescription: 'Map visual.', mediaStrategy: 'reusable_map_animation', alternateSearchQueries: [], citedFactIds: ['fact-1'], geographicEntityIds: [entity.id], estimatedDurationMs: 1000 }] }) } as never,
      { findByContentScriptId: jest.fn().mockResolvedValue(undefined) } as never, repository as never, resolver as never,
    );
    const result: any = await runtime.prepare('script-a');
    expect(resolver.resolve).toHaveBeenCalledWith([entity.canonicalName]);
    expect(result.requirements[0]).toMatchObject({ explicitLocations: [entity.canonicalName], geographicReferenceIds: ['reference-1'] });
  });

  it('uses one requirement-scoped repository identity for repeated candidate upserts', async () => {
    await service().upsertCandidate('script-a', 'requirement-a', candidate());
    await service().upsertCandidate('script-a', 'requirement-a', candidate());
    expect(repository.upsertCandidate).toHaveBeenCalledTimes(2);
    expect(repository.upsertCandidate).toHaveBeenLastCalledWith('requirement-a', expect.objectContaining({ provider: 'provider-a', providerAssetId: 'asset-a' }));
  });

  it('rejects an upsert without any provenance identity', async () => {
    await expect(service().upsertCandidate('script-a', 'requirement-a', { provider: 'provider-a', mediaType: 'image' })).rejects.toThrow('provenance');
    expect(repository.upsertCandidate).not.toHaveBeenCalled();
  });

  it('lists candidates only after resolving the requirement through the script manifest', async () => {
    await expect(service().listCandidates('script-a', 'requirement-a')).resolves.toEqual([candidate()]);
    await expect(service().listCandidates('script-a', 'other-requirement')).rejects.toThrow('Visual requirement not found');
  });

  it.each([
    ['missing provenance', candidate({ sourceUrl: null, providerAssetId: null }), 'provenance'],
    ['unknown commercial licence', candidate({ commercialUseAllowed: null }), 'commercial-use'],
    ['modification mismatch', candidate({ modificationAllowed: false }), 'modification'],
    ['wrong media metadata', candidate({ mediaType: 'video' }), 'metadata'],
  ])('rejects %s before a selection mutation', async (_name, invalid, message) => {
    repository.listCandidates.mockResolvedValue([invalid]);
    await expect(service().selectCandidate('script-a', 'requirement-a', 'candidate-a')).rejects.toThrow(message);
    expect(repository.select).not.toHaveBeenCalled();
  });

  it('requires attribution where the requirement requires it', async () => {
    repository.findByContentScriptId.mockResolvedValue(manifest({ requirements: [requirement({ licenceRequirements: { commercialUseRequired: true, modificationAllowed: true, attributionRequired: true } })] }));
    await expect(service().selectCandidate('script-a', 'requirement-a', 'candidate-a')).rejects.toThrow('attribution');
  });

  it('selects a valid candidate, recalculates readiness, and supports idempotent reselection', async () => {
    await service().selectCandidate('script-a', 'requirement-a', 'candidate-a');
    await service().selectCandidate('script-a', 'requirement-a', 'candidate-a');
    expect(repository.select).toHaveBeenCalledWith('requirement-a', 'candidate-a');
    expect(repository.recalculateManifestStatus).toHaveBeenCalledWith('manifest-a');
  });

  it('never selects a rejected candidate and records bounded rejection reasons', async () => {
    repository.listCandidates.mockResolvedValue([candidate({ status: 'rejected' })]);
    await expect(service().selectCandidate('script-a', 'requirement-a', 'candidate-a')).rejects.toThrow('Rejected');
    repository.listCandidates.mockResolvedValue([candidate()]);
    await service().rejectCandidate('script-a', 'requirement-a', 'candidate-a', '  unsuitable licence  ');
    expect(repository.reject).toHaveBeenCalledWith('requirement-a', 'candidate-a', ['unsuitable licence']);
    await expect(service().rejectCandidate('script-a', 'requirement-a', 'candidate-a', ' ')).rejects.toThrow('invalid');
  });

  it('clears safely and prevents any mutation of a stale or foreign manifest requirement', async () => {
    await service().clearCandidateSelection('script-a', 'requirement-a');
    expect(repository.clear).toHaveBeenCalledWith('requirement-a');
    repository.findByContentScriptId.mockResolvedValue(manifest({ status: 'stale' }));
    await expect(service().clearCandidateSelection('script-a', 'requirement-a')).rejects.toThrow('Stale');
    repository.findByContentScriptId.mockResolvedValue(manifest({ requirements: [requirement({ id: 'project-b-requirement' })] }));
    await expect(service().selectCandidate('script-a', 'requirement-a', 'candidate-a')).rejects.toThrow('Visual requirement not found');
  });

  it('rejects stale manifest finalization without recalculating readiness', async () => {
    repository.findByContentScriptId.mockResolvedValue(manifest({ status: 'stale' }));
    await expect(service().finalize('script-a')).rejects.toThrow('Stale');
    expect(repository.recalculateManifestStatus).not.toHaveBeenCalled();
  });
});
