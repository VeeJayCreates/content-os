import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { OpportunityDetectionResult } from '@content-os/contracts';
import { ResearchSourceType } from '@content-os/contracts';
import {
  NewOpportunity,
  NewOpportunityMetric,
  OpportunityMetricRepository,
  OpportunityRepository,
  OpportunityWithProject,
  SignalRepository,
  TopicCandidateRepository,
} from '@content-os/storage';

import {
  DetectionSignal,
  scoreOpportunity,
} from './opportunity-detection';
import {
  calculateOpportunityMetricsV2,
  OPPORTUNITY_METRICS_V2_VERSION,
} from './opportunity-metrics-v2';
import { extractTopicCandidates } from './topic-candidate-extraction';
import { SemanticTopicClusteringService } from './semantic-topic-clustering.service';
import { ResearchExecutionLogger } from './research-execution-logger.service';
import { Optional } from '@nestjs/common';

type DetectionCandidate = Pick<
  OpportunityWithProject,
  'id' | 'clusterKey' | 'title'
>;

@Injectable()
export class OpportunityDetectionService {
  constructor(
    private readonly signals: SignalRepository,
    private readonly opportunities: OpportunityRepository,
    private readonly metrics: OpportunityMetricRepository,
    private readonly candidates: TopicCandidateRepository,
    private readonly clustering: SemanticTopicClusteringService,
    @Optional() private readonly executionLog?: ResearchExecutionLogger,
  ) {}

  async detect(
    projectId?: string,
    calculationTime = new Date(),
  ): Promise<OpportunityDetectionResult> {
    const started = Date.now();
    this.executionLog?.event('info', 'opportunity_detection.signal_lookup.started', 'started', { result: { projectId: projectId ?? null } });
    const records = await this.signals.findAll(projectId);
    this.executionLog?.event('info', 'opportunity_detection.signal_lookup.completed', 'completed', { result: { signalCount: records.length } });
    const signals = records.map((signal): DetectionSignal => ({
        id: signal.id,
        projectId: signal.projectId,
        title: signal.title,
        url: signal.url,
        summary: signal.summary,
        researchSourceId: signal.researchSourceId,
        sourceType: signal.sourceType as ResearchSourceType,
        discoveredAt: signal.discoveredAt,
      }));
    const signalById = new Map(signals.map((signal) => [signal.id, signal]));
    const persistedCandidates = [] as Array<{ id: string; projectId: string; signalId: string; text: string; normalizedText: string }>;
    for (const signal of signals) {
      for (const extracted of extractTopicCandidates(signal.title)) {
        const stored = await this.candidates.upsert({ projectId: signal.projectId, signalId: signal.id, ...extracted });
        persistedCandidates.push(stored);
        this.executionLog?.withContext({ signalId: signal.id, topicCandidateId: stored.id }, () => this.executionLog?.event('debug', 'topic_candidate.persistence.completed', 'completed', { result: { normalizedText: stored.normalizedText } }));
      }
    }
    // A repeated manual detection must not recluster the complete historical
    // corpus when every deterministic candidate is already represented by an
    // opportunity. New candidates still take the existing full clustering path
    // so they can merge with historical candidates without changing identity.
    const projectIds = [...new Set(persistedCandidates.map((candidate) => candidate.projectId))];
    const existingByProject = new Map<string, DetectionCandidate[]>();
    for (const candidateProjectId of projectIds) existingByProject.set(candidateProjectId, await this.opportunities.findAll(candidateProjectId));
    const existingOpportunityIds = [...existingByProject.values()].flat().map((opportunity) => opportunity.id);
    const attachedByOpportunity = await this.candidates.findByOpportunityIds(existingOpportunityIds);
    const attachedCandidateIds = new Set([...attachedByOpportunity.values()].flat().map((candidate) => candidate.id));
    const candidatesRequiringClustering = persistedCandidates.filter((candidate) => !attachedCandidateIds.has(candidate.id));
    this.executionLog?.event('info', 'semantic_clustering.incremental_plan', 'completed', { result: { candidateCount: persistedCandidates.length, reusedCandidateCount: persistedCandidates.length - candidatesRequiringClustering.length, candidatesRequiringClustering: candidatesRequiringClustering.length, existingOpportunityCount: existingOpportunityIds.length } });
    if (persistedCandidates.length > 0 && candidatesRequiringClustering.length === 0) {
      const result: OpportunityDetectionResult = { signalsProcessed: records.length, opportunitiesCreated: 0, opportunitiesUpdated: 0, linksCreated: 0, warnings: [] };
      this.executionLog?.event('info', 'opportunity_detection.completed', 'reused', { durationMs: Date.now() - started, result });
      return result;
    }
    // All provider work completes before Topic/cluster persistence. A local model
    // failure may leave reusable candidate rows, but never partial reconciliation.
    const clusters = await this.clustering.cluster(persistedCandidates);
    this.executionLog?.event('info', 'topic_clustering.completed', 'completed', { result: { candidateCount: persistedCandidates.length, clusterCount: clusters.length } });

    const result: OpportunityDetectionResult = {
      signalsProcessed: records.length,
      opportunitiesCreated: 0,
      opportunitiesUpdated: 0,
      linksCreated: 0,
      warnings: [],
    };
    const candidatesByProject = new Map<string, DetectionCandidate[]>(existingByProject);
    const creates: NewOpportunity[] = [];
    const updates: Array<{
      id: string;
      data: OpportunityData;
    }> = [];
    const affectedOpportunityIds = new Set<string>();
    const candidateMemberships: Array<{ opportunityId: string; candidateId: string }> = [];

    for (const cluster of clusters) {
      const clusterCandidates = cluster.candidateIds.map((id) => persistedCandidates.find((candidate) => candidate.id === id)).filter(isPersistedCandidate);
      const groupedSignals = [...new Map(clusterCandidates.map((candidate) => [candidate.signalId, signalById.get(candidate.signalId)])).values()].filter(isDetectionSignal);
      const representativeCandidate = clusterCandidates.find((candidate) => candidate.id === cluster.titleCandidateId);
      const representative = representativeCandidate ? signalById.get(representativeCandidate.signalId) : groupedSignals[0];
      if (!representative) continue;

      const key = cluster.clusterKey;
      let candidates = candidatesByProject.get(representative.projectId);
      if (!candidates) {
        candidates = await this.opportunities.findAll(representative.projectId);
        candidatesByProject.set(representative.projectId, candidates);
      }

      let opportunity = candidates.find((candidate) => candidate.clusterKey === key);

      const data = aggregateOpportunityData(groupedSignals, representative, representativeCandidate?.text);
      if (opportunity) {
        updates.push({ id: opportunity.id, data });
        result.opportunitiesUpdated += 1;
        this.executionLog?.withContext({ opportunityId: opportunity.id, clusterKey: key }, () => this.executionLog?.event('debug', 'opportunity.persistence.completed', 'reused', { result: { signalCount: data.signalCount, sourceCount: data.sourceCount } }));
      } else {
        const now = new Date().toISOString();
        const created: NewOpportunity = {
          id: randomUUID(),
          projectId: representative.projectId,
          clusterKey: key,
          status: 'detected',
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        creates.push(created);
        opportunity = created;
        candidates.push(created);
        result.opportunitiesCreated += 1;
        this.executionLog?.withContext({ opportunityId: opportunity.id, clusterKey: key }, () => this.executionLog?.event('info', 'opportunity.persistence.completed', 'created', { result: { signalCount: data.signalCount, sourceCount: data.sourceCount, score: data.score } }));
      }

      for (const candidate of clusterCandidates) candidateMemberships.push({ opportunityId: opportunity.id, candidateId: candidate.id });
      affectedOpportunityIds.add(opportunity.id);
    }

    await this.opportunities.persistDetectionBatch(creates, updates, []);
    for (const membership of candidateMemberships) if (await this.candidates.attachToOpportunity(membership.opportunityId, membership.candidateId)) result.linksCreated += 1;
    await this.recalculateCandidateAggregatesAndMetrics([...affectedOpportunityIds], signalById, calculationTime);
    this.executionLog?.event('info', 'opportunity_detection.completed', 'completed', { durationMs: Date.now() - started, result });
    return result;
  }

  private async recalculateCandidateAggregatesAndMetrics(
    opportunityIds: string[],
    signalById: ReadonlyMap<string, DetectionSignal>,
    calculationTime: Date,
  ): Promise<void> {
    const candidatesByOpportunity = await this.candidates.findByOpportunityIds(opportunityIds);
    const currentMetrics = await this.metrics.findByOpportunityIds(
      opportunityIds,
      OPPORTUNITY_METRICS_V2_VERSION,
    );
    const aggregateUpdates: Array<{ id: string; data: AggregateData }> = [];
    const metricUpserts: Array<Omit<NewOpportunityMetric, 'id'>> = [];

    for (const opportunityId of opportunityIds) {
      const attachedSignals = [...new Map((candidatesByOpportunity.get(opportunityId) ?? []).map((candidate) => [candidate.signalId, signalById.get(candidate.signalId)])).values()].filter(isDetectionSignal);
      if (attachedSignals.length === 0) continue;
      const aggregateSignals: DetectionSignal[] = attachedSignals.map(
        (signal) => ({
          id: signal.id,
          projectId: signal.projectId,
          title: signal.title,
          url: signal.url,
          summary: signal.summary,
          researchSourceId: signal.researchSourceId,
          sourceType: signal.sourceType as ResearchSourceType,
          discoveredAt: signal.discoveredAt,
        }),
      );
      const firstSignal = aggregateSignals[0];
      if (!firstSignal) continue;
      const aggregate = aggregateOpportunityData(aggregateSignals, firstSignal);
      aggregateUpdates.push({
        id: opportunityId,
        data: {
          score: aggregate.score,
          signalCount: aggregate.signalCount,
          sourceCount: aggregate.sourceCount,
          firstSeenAt: aggregate.firstSeenAt,
          lastSeenAt: aggregate.lastSeenAt,
        },
      });

      const metric = calculateOpportunityMetricsV2(
        aggregateSignals,
        calculationTime,
      );
      if (currentMetrics.get(opportunityId)?.inputHash !== metric.inputHash) {
        metricUpserts.push({ opportunityId, ...metric });
        this.executionLog?.withContext({ opportunityId }, () => this.executionLog?.event('debug', 'opportunity_metrics.calculated', 'completed', { result: { metric } }));
      } else {
        this.executionLog?.withContext({ opportunityId }, () => this.executionLog?.event('debug', 'opportunity_metrics.skipped', 'reused', { result: { reasonCode: 'unchanged_input_hash' } }));
      }
    }

    await this.opportunities.updateAggregates(aggregateUpdates);
    await this.metrics.upsertMany(metricUpserts);
  }
}

type AggregateData = {
  score: number;
  signalCount: number;
  sourceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

type OpportunityData = AggregateData & {
  title: string;
  representativeUrl: string;
  summary: string | null;
};

function aggregateOpportunityData(
  signals: DetectionSignal[],
  representative: DetectionSignal,
  title = representative.title,
): OpportunityData {
  const firstSeenAt = signals.reduce(
    (first, signal) =>
      signal.discoveredAt < first ? signal.discoveredAt : first,
    representative.discoveredAt,
  );
  const lastSeenAt = signals.reduce(
    (last, signal) =>
      signal.discoveredAt > last ? signal.discoveredAt : last,
    representative.discoveredAt,
  );
  return {
    title,
    representativeUrl: representative.url,
    summary: representative.summary,
    score: scoreOpportunity(signals),
    signalCount: signals.length,
    sourceCount: new Set(signals.map((signal) => signal.researchSourceId)).size,
    firstSeenAt,
    lastSeenAt,
  };
}

function isDetectionSignal(value: DetectionSignal | undefined): value is DetectionSignal { return value !== undefined; }
function isPersistedCandidate(value: { id: string; projectId: string; signalId: string; text: string; normalizedText: string } | undefined): value is { id: string; projectId: string; signalId: string; text: string; normalizedText: string } { return value !== undefined; }
