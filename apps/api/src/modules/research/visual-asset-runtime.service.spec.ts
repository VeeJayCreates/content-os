jest.mock('@content-os/storage', () => ({
  AudioGenerationRepository: class {}, ContentScriptRepository: class {}, ScenePlanRepository: class {}, VisualAssetRepository: class {},
}));
jest.mock('@content-os/contracts', () => ({
  AudioGenerationStatus: { READY: 'ready' },
  ScenePlanStatus: { READY: 'ready' },
  VisualAssetCandidateStatus: { DISCOVERED: 'discovered', REJECTED: 'rejected' },
  VisualAssetManifestStatus: { READY: 'ready', NEEDS_REVIEW: 'needs_review', STALE: 'stale' },
  SceneMediaStrategy: {},
}));

import { VisualAssetRuntimeService } from './visual-asset-runtime.service';

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
