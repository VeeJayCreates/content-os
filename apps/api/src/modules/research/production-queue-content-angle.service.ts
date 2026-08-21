import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ProductionQueueStatus, ResearchVerificationStatus, type EditorialAssessment } from '@content-os/contracts';
import { OpportunityRepository, ProductionQueueRepository, ProjectRepository, ResearchPackageRepository, TopicCandidateRepository } from '@content-os/storage';
import { EditorialAssessmentService } from './editorial-assessment.service';
import { AGENT_PIPELINE_BRIDGE, observeAgentPipeline, type AgentPipelineBridge } from '../agent-runtime/agent-pipeline-bridge.token';
import { evaluateResearchVerification } from './research-verification';

@Injectable()
export class ProductionQueueContentAngleService {
  constructor(private readonly queue: ProductionQueueRepository, private readonly projects: ProjectRepository, private readonly opportunities: OpportunityRepository, private readonly packages: ResearchPackageRepository, private readonly candidates: TopicCandidateRepository, private readonly editorial: EditorialAssessmentService, @Optional() @Inject(AGENT_PIPELINE_BRIDGE) private readonly agentPipeline?: AgentPipelineBridge) {}
  async generate(queueItemId: string): Promise<EditorialAssessment> {
    const context = await this.resolveEligibleContext(queueItemId);
    await this.queue.updateStatus(queueItemId, ProductionQueueStatus.PROCESSING);
    await observeAgentPipeline(this.agentPipeline?.synchronize(queueItemId));
    try { return await this.editorial.assessWithPackage(context.opportunity, context.item.researchPackageId); }
    catch (error) { await this.queue.updateStatus(queueItemId, ProductionQueueStatus.FAILED); await observeAgentPipeline(this.agentPipeline?.synchronize(queueItemId)); throw error; }
  }
  async find(queueItemId: string): Promise<EditorialAssessment> {
    const context = await this.context(queueItemId, false);
    return this.editorial.findOneWithPackage(context.opportunity, context.item.researchPackageId);
  }

  async resolveEligibleContext(queueItemId: string) { return this.context(queueItemId, true); }

  private async context(queueItemId: string, requireEligible: boolean) {
    const item = await this.queue.findById(queueItemId); if (!item) throw new NotFoundException('Production queue item not found');
    if (requireEligible && item.status !== ProductionQueueStatus.QUEUED && item.status !== ProductionQueueStatus.PROCESSING) throw new ConflictException('Queue item is not available for Content Angle generation');
    const [project, opportunity, researchPackage, membership] = await Promise.all([this.projects.findById(item.projectId), this.opportunities.findById(item.opportunityId), this.packages.findById(item.researchPackageId), this.candidates.membershipCountsByOpportunityIds([item.opportunityId])]);
    if (!project || !opportunity || opportunity.projectId !== item.projectId) throw new ConflictException('Queue item context is unavailable');
    if (!requireEligible) return { item, opportunity };
    if (project.status !== 'active' || !researchPackage || researchPackage.projectId !== item.projectId || researchPackage.opportunityId !== item.opportunityId || researchPackage.status !== 'ready' || (membership.get(item.opportunityId) ?? 0) === 0) throw new ConflictException('Queue item is not eligible for Content Angle generation');
    const rows = (await this.packages.findFactsWithEvidenceByPackageIds([researchPackage.id])).get(researchPackage.id) ?? [];
    const verification = evaluateResearchVerification({ signals: rows.filter(row => row.signalId && row.researchSourceId).map(row => ({ signalId: row.signalId!, researchSourceId: row.researchSourceId! })), candidateClaimCount: new Set(rows.map(row => row.normalizedClaimKey)).size, facts: rows });
    if (verification.verificationStatus !== ResearchVerificationStatus.CORROBORATED || !verification.canProceedAutomatically) throw new ConflictException('Queue item research is not corroborated');
    return { item, opportunity };
  }
}
