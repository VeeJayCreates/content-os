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
} from '@content-os/storage';

import {
  clusterKey,
  DetectionSignal,
  scoreOpportunity,
  titlesMatch,
} from './opportunity-detection';
import {
  calculateOpportunityMetricsV2,
  OPPORTUNITY_METRICS_V2_VERSION,
} from './opportunity-metrics-v2';

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
  ) {}

  async detect(
    projectId?: string,
    calculationTime = new Date(),
  ): Promise<OpportunityDetectionResult> {
    const records = await this.signals.findAll(projectId);
    const grouped = new Map<string, DetectionSignal[]>();

    for (const signal of records) {
      const item: DetectionSignal = {
        id: signal.id,
        projectId: signal.projectId,
        title: signal.title,
        url: signal.url,
        summary: signal.summary,
        researchSourceId: signal.researchSourceId,
        sourceType: signal.sourceType as ResearchSourceType,
        discoveredAt: signal.discoveredAt,
      };
      const key = `${item.projectId}:${clusterKey(item)}`;
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }

    const result: OpportunityDetectionResult = {
      signalsProcessed: records.length,
      opportunitiesCreated: 0,
      opportunitiesUpdated: 0,
      linksCreated: 0,
      warnings: [],
    };
    const candidatesByProject = new Map<string, DetectionCandidate[]>();
    const creates: NewOpportunity[] = [];
    const updates: Array<{
      id: string;
      data: OpportunityData;
    }> = [];
    const links: Array<{ opportunityId: string; signalId: string }> = [];
    const affectedOpportunityIds = new Set<string>();

    for (const groupedSignals of grouped.values()) {
      const representative = groupedSignals[0];
      if (!representative) continue;

      const key = clusterKey(representative);
      let candidates = candidatesByProject.get(representative.projectId);
      if (!candidates) {
        candidates = await this.opportunities.findAll(representative.projectId);
        candidatesByProject.set(representative.projectId, candidates);
      }

      let opportunity = candidates.find(
        (candidate) => candidate.clusterKey === key,
      );
      if (!opportunity) {
        opportunity = candidates.find((candidate) =>
          titlesMatch(candidate.title, representative.title),
        );
      }

      const data = aggregateOpportunityData(groupedSignals, representative);
      if (opportunity) {
        updates.push({ id: opportunity.id, data });
        result.opportunitiesUpdated += 1;
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
      }

      for (const signal of groupedSignals) {
        links.push({ opportunityId: opportunity.id, signalId: signal.id });
      }
      affectedOpportunityIds.add(opportunity.id);
    }

    result.linksCreated = await this.opportunities.persistDetectionBatch(
      creates,
      updates,
      links,
    );
    await this.recalculateAggregatesAndMetrics(
      [...affectedOpportunityIds],
      calculationTime,
    );
    return result;
  }

  private async recalculateAggregatesAndMetrics(
    opportunityIds: string[],
    calculationTime: Date,
  ): Promise<void> {
    const signalsByOpportunity =
      await this.opportunities.findSignalsByOpportunityIds(opportunityIds);
    const currentMetrics = await this.metrics.findByOpportunityIds(
      opportunityIds,
      OPPORTUNITY_METRICS_V2_VERSION,
    );
    const aggregateUpdates: Array<{ id: string; data: AggregateData }> = [];
    const metricUpserts: Array<Omit<NewOpportunityMetric, 'id'>> = [];

    for (const opportunityId of opportunityIds) {
      const attachedSignals = signalsByOpportunity.get(opportunityId) ?? [];
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
    title: representative.title,
    representativeUrl: representative.url,
    summary: representative.summary,
    score: scoreOpportunity(signals),
    signalCount: signals.length,
    sourceCount: new Set(signals.map((signal) => signal.researchSourceId)).size,
    firstSeenAt,
    lastSeenAt,
  };
}
