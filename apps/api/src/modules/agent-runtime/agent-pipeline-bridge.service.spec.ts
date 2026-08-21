import { NotFoundException } from '@nestjs/common';
import { AgentPipelineStage, AgentTaskStatus } from '@content-os/contracts';
import { AgentPipelineBridgeService } from './agent-pipeline-bridge.service';

jest.mock('@content-os/contracts', () => ({
  AgentPipelineEventType: { SOURCE_STATUS_CHANGED: 'source_status_changed' }, AgentPipelineStage: { RESEARCH: 'research', CONTENT: 'content', PRODUCTION: 'production' },
  AgentTaskStatus: { QUEUED: 'queued', RUNNING: 'running', COMPLETED: 'completed', FAILED: 'failed', STALE: 'stale' }, ResearchPackageStatus: { READY: 'ready', FAILED: 'failed' },
  ScriptStatus: { GENERATING: 'generating', READY: 'ready', FAILED: 'failed' }, VideoRenderJobStatus: { QUEUED: 'queued', RUNNING: 'running', COMPLETED: 'completed', FAILED: 'failed', STALE: 'stale' },
}));
jest.mock('@content-os/storage', () => ({ AgentPipelineRepository: class {}, ContentScriptRepository: class {}, ProductionQueueRepository: class {}, ResearchPackageRepository: class {}, VideoRenderJobRepository: class {} }));

describe('AgentPipelineBridgeService', () => {
  const queue = { findById: jest.fn() }; const packages = { findByOpportunityId: jest.fn() }; const scripts = { findByQueueItemId: jest.fn() }; const jobs = { findByContentScriptId: jest.fn() };
  const repository = { upsertTask: jest.fn(), ensureEvent: jest.fn(), ensureHandoff: jest.fn(), getPipeline: jest.fn() };
  const service = () => new AgentPipelineBridgeService(repository as never, queue as never, packages as never, scripts as never, jobs as never);
  const now = '2026-08-21T00:00:00.000Z';

  beforeEach(() => {
    jest.resetAllMocks();
    queue.findById.mockResolvedValue({ id: 'queue-1', projectId: 'project-1', opportunityId: 'opportunity-1', researchPackageId: 'package-1', status: 'processing', updatedAt: now });
    packages.findByOpportunityId.mockResolvedValue({ id: 'package-1', status: 'ready', updatedAt: now });
    repository.upsertTask.mockImplementation(async (value) => ({ id: `task-${value.stage}`, ...value }));
    repository.getPipeline.mockImplementation(async (ids) => ({ tasks: ids.map((id: string) => ({ id })), events: [], handoffs: [] }));
  });

  it('persists real research, content, and production tasks with completed-boundary handoffs', async () => {
    scripts.findByQueueItemId.mockResolvedValue({ id: 'script-1', status: 'ready', updatedAt: now });
    jobs.findByContentScriptId.mockResolvedValue({ id: 'render-1', status: 'running', updatedAt: now });
    const result = await service().synchronize('queue-1');
    expect(repository.upsertTask).toHaveBeenCalledWith(expect.objectContaining({ stage: AgentPipelineStage.RESEARCH, sourceId: 'package-1', status: AgentTaskStatus.COMPLETED }));
    expect(repository.upsertTask).toHaveBeenCalledWith(expect.objectContaining({ stage: AgentPipelineStage.CONTENT, sourceId: 'queue-1', status: AgentTaskStatus.COMPLETED }));
    expect(repository.upsertTask).toHaveBeenCalledWith(expect.objectContaining({ stage: AgentPipelineStage.PRODUCTION, sourceId: 'script-1', status: AgentTaskStatus.RUNNING }));
    expect(repository.ensureEvent).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'content_script', sourceId: 'script-1', sourceStatus: 'ready' }));
    expect(repository.ensureEvent).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'video_render_job', sourceId: 'render-1', sourceStatus: 'running' }));
    expect(repository.ensureHandoff).toHaveBeenCalledTimes(2);
    expect(repository.ensureEvent).toHaveBeenCalledTimes(3);
    expect(result.tasks).toHaveLength(3);
  });

  it('does not invent a production task or content handoff before a real ready script exists', async () => {
    scripts.findByQueueItemId.mockResolvedValue(undefined);
    await service().synchronize('queue-1');
    expect(repository.upsertTask).toHaveBeenCalledTimes(2);
    expect(repository.upsertTask).not.toHaveBeenCalledWith(expect.objectContaining({ stage: AgentPipelineStage.PRODUCTION }));
    expect(repository.ensureHandoff).toHaveBeenCalledTimes(1);
    expect(jobs.findByContentScriptId).not.toHaveBeenCalled();
  });

  it('rejects queue items without their source-of-truth research package', async () => {
    packages.findByOpportunityId.mockResolvedValue(undefined);
    await expect(service().synchronize('queue-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.upsertTask).not.toHaveBeenCalled();
  });

  it('preserves a stale render job as stale agent work', async () => {
    scripts.findByQueueItemId.mockResolvedValue({ id: 'script-1', status: 'ready', updatedAt: now });
    jobs.findByContentScriptId.mockResolvedValue({ id: 'render-1', status: 'stale', updatedAt: now });
    await service().synchronize('queue-1');
    expect(repository.upsertTask).toHaveBeenCalledWith(expect.objectContaining({ stage: AgentPipelineStage.PRODUCTION, status: AgentTaskStatus.STALE }));
  });
});
