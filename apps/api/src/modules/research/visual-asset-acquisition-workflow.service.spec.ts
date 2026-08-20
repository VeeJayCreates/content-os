jest.mock('@content-os/storage', () => ({ VisualAssetRepository: class {}, VisualAssetAcquisitionRepository: class {} }));
jest.mock('@content-os/contracts', () => ({
  VisualAssetManifestStatus: { STALE: 'stale' },
  VisualAssetProviderCapability: { IMAGE_SEARCH: 'image_search', VIDEO_SEARCH: 'video_search' },
}));

import { VisualAssetAcquisitionWorkflowService } from './visual-asset-acquisition-workflow.service';

describe('VisualAssetAcquisitionWorkflowService', () => {
  it('reads the latest run without configuring or invoking a provider', async () => {
    const run = { id: 'run-1', contentScriptId: 'script-1' };
    const acquisition = { findLatest: jest.fn().mockResolvedValue(run) };
    const pexels = { id: 'pexels', search: jest.fn() };
    const workflow = new VisualAssetAcquisitionWorkflowService(acquisition as never, pexels as never);

    await expect(workflow.findLatest('script-1')).resolves.toBe(run);
    expect(acquisition.findLatest).toHaveBeenCalledWith('script-1');
    expect(pexels.search).not.toHaveBeenCalled();
  });

  it('executes an eligible persisted run with the configured Pexels provider', async () => {
    const acquisition = { prepare: jest.fn(), execute: jest.fn().mockResolvedValue({ status: 'completed' }) };
    const pexels = { id: 'pexels', search: jest.fn() };
    const workflow = new VisualAssetAcquisitionWorkflowService(acquisition as never, pexels as never);

    await workflow.execute('script-1', 'run-1');

    expect(acquisition.execute).toHaveBeenCalledWith('run-1', [pexels], 'script-1');
  });
});
