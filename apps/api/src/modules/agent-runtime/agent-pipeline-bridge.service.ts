import { Injectable, NotFoundException } from '@nestjs/common';
import { AgentPipelineEventType, AgentPipelineStage, AgentTaskStatus, ResearchPackageStatus, ScriptStatus, VideoRenderJobStatus, type AgentPipeline } from '@content-os/contracts';
import { AgentPipelineRepository, ContentScriptRepository, ProductionQueueRepository, ResearchPackageRepository, VideoRenderJobRepository } from '@content-os/storage';

@Injectable()
export class AgentPipelineBridgeService {
  constructor(
    private readonly pipelines: AgentPipelineRepository,
    private readonly queue: ProductionQueueRepository,
    private readonly packages: ResearchPackageRepository,
    private readonly scripts: ContentScriptRepository,
    private readonly renderJobs: VideoRenderJobRepository,
  ) {}

  async synchronize(productionQueueItemId: string): Promise<AgentPipeline> {
    const queueItem = await this.queue.findById(productionQueueItemId);
    if (!queueItem) throw new NotFoundException('Production queue item not found');
    const researchPackage = await this.packages.findByOpportunityId(queueItem.opportunityId);
    if (!researchPackage || researchPackage.id !== queueItem.researchPackageId) throw new NotFoundException('Research package not found');

    const research = await this.task({ projectId: queueItem.projectId, stage: AgentPipelineStage.RESEARCH, agentKey: 'research_agent', sourceType: 'research_package', sourceId: researchPackage.id, status: this.researchStatus(researchPackage.status), sourceStatus: researchPackage.status, occurredAt: researchPackage.updatedAt });
    const script = await this.scripts.findByQueueItemId(queueItem.id);
    const content = await this.task({ projectId: queueItem.projectId, stage: AgentPipelineStage.CONTENT, agentKey: 'content_agent', sourceType: 'production_queue_item', sourceId: queueItem.id, eventSourceType: script ? 'content_script' : 'production_queue_item', eventSourceId: script?.id ?? queueItem.id, status: script ? this.scriptStatus(script.status) : this.queueStatus(queueItem.status), sourceStatus: script?.status ?? queueItem.status, occurredAt: script?.updatedAt ?? queueItem.updatedAt });
    const taskIds = [research.id, content.id];

    if (research.status === AgentTaskStatus.COMPLETED) await this.handoff(research.id, content.id, 'research_package', researchPackage.id);

    if (script?.status === ScriptStatus.READY) {
      const renderJob = await this.renderJobs.findByContentScriptId(script.id);
      const production = await this.task({ projectId: queueItem.projectId, stage: AgentPipelineStage.PRODUCTION, agentKey: 'production_agent', sourceType: 'content_script', sourceId: script.id, eventSourceType: renderJob ? 'video_render_job' : 'content_script', eventSourceId: renderJob?.id ?? script.id, status: renderJob ? this.renderStatus(renderJob.status) : AgentTaskStatus.QUEUED, sourceStatus: renderJob?.status ?? script.status, occurredAt: renderJob?.updatedAt ?? script.updatedAt });
      taskIds.push(production.id);
      await this.handoff(content.id, production.id, 'content_script', script.id);
    }

    const stored = await this.pipelines.getPipeline(taskIds);
    return { productionQueueItemId, ...stored } as AgentPipeline;
  }

  async synchronizeContentScript(contentScriptId: string): Promise<AgentPipeline> {
    const script = await this.scripts.findById(contentScriptId);
    if (!script) throw new NotFoundException('Content script not found');
    return this.synchronize(script.productionQueueItemId);
  }

  private async task(data: { projectId: string; stage: AgentPipelineStage; agentKey: string; sourceType: string; sourceId: string; eventSourceType?: string; eventSourceId?: string; status: AgentTaskStatus; sourceStatus: string; occurredAt: string }) {
    const { eventSourceType, eventSourceId, occurredAt, ...taskData } = data;
    const task = await this.pipelines.upsertTask(taskData);
    await this.pipelines.ensureEvent({ taskId: task.id, type: AgentPipelineEventType.SOURCE_STATUS_CHANGED, sourceType: eventSourceType ?? data.sourceType, sourceId: eventSourceId ?? data.sourceId, sourceStatus: data.sourceStatus, occurredAt });
    return task;
  }
  private async handoff(fromTaskId: string, toTaskId: string, sourceType: string, sourceId: string) { await this.pipelines.ensureHandoff({ fromTaskId, toTaskId, sourceType, sourceId }); }
  private researchStatus(status: string) { return status === ResearchPackageStatus.READY ? AgentTaskStatus.COMPLETED : status === ResearchPackageStatus.FAILED ? AgentTaskStatus.FAILED : AgentTaskStatus.RUNNING; }
  private queueStatus(status: string) { return status === 'failed' ? AgentTaskStatus.FAILED : status === 'processing' ? AgentTaskStatus.RUNNING : status === 'completed' ? AgentTaskStatus.COMPLETED : AgentTaskStatus.QUEUED; }
  private scriptStatus(status: string) { return status === ScriptStatus.READY ? AgentTaskStatus.COMPLETED : status === ScriptStatus.FAILED ? AgentTaskStatus.FAILED : AgentTaskStatus.RUNNING; }
  private renderStatus(status: string) { return status === VideoRenderJobStatus.COMPLETED ? AgentTaskStatus.COMPLETED : status === VideoRenderJobStatus.FAILED ? AgentTaskStatus.FAILED : status === VideoRenderJobStatus.STALE ? AgentTaskStatus.STALE : status === VideoRenderJobStatus.RUNNING ? AgentTaskStatus.RUNNING : AgentTaskStatus.QUEUED; }
}
