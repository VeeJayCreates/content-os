jest.mock('@content-os/storage', () => ({ AudioGenerationRepository: class {}, ContentScriptRepository: class {}, ScenePlanRepository: class {}, VisualAssetRepository: class {} }));
jest.mock('@content-os/contracts', () => ({
  AudioGenerationStatus: { READY: 'ready' }, ScenePlanStatus: { READY: 'ready' }, VisualAssetCandidateStatus: { DISCOVERED: 'discovered', REJECTED: 'rejected' }, VisualAssetManifestStatus: { READY: 'ready', NEEDS_REVIEW: 'needs_review', STALE: 'stale' }, SceneMediaStrategy: {},
}));

import { VisualAssetManifestController } from './visual-asset-manifest.controller';

describe('VisualAssetManifestController', () => {
  const service = { prepare: jest.fn(), find: jest.fn(), finalize: jest.fn(), listCandidates: jest.fn(), upsertCandidate: jest.fn(), selectCandidate: jest.fn(), rejectCandidate: jest.fn(), clearCandidateSelection: jest.fn() };
  const controller = new VisualAssetManifestController(service as never);

  it('delegates every candidate operation through the requested content script', () => {
    const id = '00000000-0000-4000-8000-000000000001'; const candidate = '00000000-0000-4000-8000-000000000002';
    const body = { provider: 'test', providerAssetId: 'asset', mediaType: 'image' };
    controller.upsertCandidate(id, 'requirement-hash', body as never);
    controller.listCandidates(id, 'requirement-hash');
    controller.selectCandidate(id, 'requirement-hash', candidate);
    controller.rejectCandidate(id, 'requirement-hash', candidate, { reason: 'unsafe licence' });
    controller.clearSelection(id, 'requirement-hash');
    controller.finalize(id);
    expect(service.upsertCandidate).toHaveBeenCalledWith(id, 'requirement-hash', body);
    expect(service.listCandidates).toHaveBeenCalledWith(id, 'requirement-hash');
    expect(service.selectCandidate).toHaveBeenCalledWith(id, 'requirement-hash', candidate);
    expect(service.rejectCandidate).toHaveBeenCalledWith(id, 'requirement-hash', candidate, 'unsafe licence');
    expect(service.clearCandidateSelection).toHaveBeenCalledWith(id, 'requirement-hash');
    expect(service.finalize).toHaveBeenCalledWith(id);
  });
});
