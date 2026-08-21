import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ProductionQueueStatus, ResearchVerificationStatus, type FillProductionQueueResult, type ProductionQueueItem } from '@content-os/contracts';
import { ProductionQueueRepository, ProjectRepository, ResearchPackageRepository, TopicCandidateRepository } from '@content-os/storage';
import { evaluateResearchVerification } from './research-verification';
import { AGENT_PIPELINE_BRIDGE, observeAgentPipeline, type AgentPipelineBridge } from '../agent-runtime/agent-pipeline-bridge.token';

@Injectable()
export class ProductionQueueService {
  constructor(private readonly queue: ProductionQueueRepository, private readonly projects: ProjectRepository, private readonly packages: ResearchPackageRepository, private readonly candidates: TopicCandidateRepository, @Optional() @Inject(AGENT_PIPELINE_BRIDGE) private readonly agentPipeline?: AgentPipelineBridge) {}
  async fill(projectId: string, targetCount: number): Promise<FillProductionQueueResult> {
    const project = await this.projects.findById(projectId); if (!project) throw new NotFoundException('Project not found');
    const skipped: Record<string, number> = {}; const skip = (reason: string) => { skipped[reason] = (skipped[reason] ?? 0) + 1; };
    if (project.status !== 'active') return { requestedCount: targetCount, queuedCount: 0, skipped: { inactive_project: 1 }, items: [] };
    const [rows, covered] = await Promise.all([this.queue.selectionCandidates(projectId), this.queue.findCoveredOpportunityIds(projectId)]);
    const packageIds = rows.flatMap((row) => row.researchPackage ? [row.researchPackage.id] : []);
    const opportunityIds = rows.map((row) => row.opportunity.id);
    const [facts, memberships] = await Promise.all([this.packages.findFactsWithEvidenceByPackageIds(packageIds), this.candidates.membershipCountsByOpportunityIds(opportunityIds)]);
    const eligible = rows.flatMap((row) => {
      if (covered.has(row.opportunity.id)) { skip('already_covered'); return []; }
      if (row.opportunity.status === 'rejected') { skip('rejected'); return []; }
      if (!row.researchPackage || row.researchPackage.status !== 'ready' || (memberships.get(row.opportunity.id) ?? 0) === 0) { skip('missing_candidate_safe_package'); return []; }
      const evidence = facts.get(row.researchPackage.id) ?? [];
      const signals = [...new Map(evidence.filter((fact) => fact.signalId && fact.researchSourceId).map((fact) => [fact.signalId!, { signalId: fact.signalId!, researchSourceId: fact.researchSourceId! }])).values()];
      const verification = evaluateResearchVerification({ signals, candidateClaimCount: evidence.length, facts: evidence });
      if (verification.verificationStatus !== ResearchVerificationStatus.CORROBORATED || !verification.canProceedAutomatically) { skip(verification.verificationStatus); return []; }
      const score = Math.max(0, Math.min(100, Math.round(row.opportunity.score * .55 + row.researchPackage.confidenceScore * .35 + Math.min(10, row.researchPackage.sourceCount * 3))));
      return [{ row, verification, score }];
    });
    eligible.sort((a, b) => b.score - a.score || b.row.opportunity.score - a.row.opportunity.score || b.row.opportunity.lastSeenAt.localeCompare(a.row.opportunity.lastSeenAt) || a.row.opportunity.id.localeCompare(b.row.opportunity.id));
    const selected = eligible.slice(0, targetCount); if (eligible.length > selected.length) skipped.target_limit = eligible.length - selected.length;
    const items: ProductionQueueItem[] = [];
    for (const [index, candidate] of selected.entries()) {
      const item = await this.queue.enqueue({ projectId, opportunityId: candidate.row.opportunity.id, researchPackageId: candidate.row.researchPackage!.id, status: ProductionQueueStatus.QUEUED, priority: index + 1, selectionScore: candidate.score, selectionReason: `Corroborated by ${candidate.verification.distinctSourceCount} configured sources; ranked by Topic Strength, Research Confidence, and freshness.`, queuedAt: new Date().toISOString(), startedAt: null, completedAt: null, failedAt: null });
      if (item) { await observeAgentPipeline(this.agentPipeline?.synchronize(item.id)); items.push({ ...item, status: ProductionQueueStatus.QUEUED, title: candidate.row.opportunity.title, verificationStatus: candidate.verification.verificationStatus }); }
    }
    return { requestedCount: targetCount, queuedCount: items.length, skipped, items };
  }
  async findAll(projectId: string): Promise<ProductionQueueItem[]> { const project = await this.projects.findById(projectId); if (!project) throw new NotFoundException('Project not found'); return (await this.queue.findAll(projectId)).map(({ item, title }) => ({ ...item, title, verificationStatus: ResearchVerificationStatus.CORROBORATED, status: item.status as ProductionQueueStatus })); }
}
