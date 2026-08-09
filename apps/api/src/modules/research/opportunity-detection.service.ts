import { Injectable } from '@nestjs/common';
import type { OpportunityDetectionResult } from '@content-os/contracts';
import { ResearchSourceType } from '@content-os/contracts';
import {
  OpportunityMetricRepository,
  OpportunityRepository,
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
    const candidatesByProject = new Map<
      string,
      Awaited<ReturnType<OpportunityRepository['findAll']>>
    >();
    const affectedOpportunityIds = new Set<string>();

    for (const groupedSignals of grouped.values()) {
      const representative = groupedSignals[0];
      if (!representative) {
        continue;
      }

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

      const firstSeenAt = groupedSignals.reduce(
        (first, signal) =>
          signal.discoveredAt < first ? signal.discoveredAt : first,
        representative.discoveredAt,
      );
      const lastSeenAt = groupedSignals.reduce(
        (last, signal) =>
          signal.discoveredAt > last ? signal.discoveredAt : last,
        representative.discoveredAt,
      );
      const data = {
        title: representative.title,
        representativeUrl: representative.url,
        summary: representative.summary,
        score: scoreOpportunity(groupedSignals),
        signalCount: groupedSignals.length,
        sourceCount: new Set(
          groupedSignals.map((signal) => signal.researchSourceId),
        ).size,
        firstSeenAt,
        lastSeenAt,
      };

      if (opportunity) {
        const updated = await this.opportunities.update(opportunity.id, data);
        if (!updated) {
          continue;
        }
        opportunity = updated;
        result.opportunitiesUpdated += 1;
      } else {
        opportunity = await this.opportunities.create({
          projectId: representative.projectId,
          clusterKey: key,
          status: 'detected',
          ...data,
        });
        candidates.push(opportunity);
        result.opportunitiesCreated += 1;
      }

      for (const signal of groupedSignals) {
        if (await this.opportunities.attachSignal(opportunity.id, signal.id)) {
          result.linksCreated += 1;
        }
      }
      affectedOpportunityIds.add(opportunity.id);
    }

    await this.recalculateAggregatesAndMetrics(
      [...affectedOpportunityIds],
      calculationTime,
    );

    return result;
  }

  private async recalculateAggregatesAndMetrics(
    opportunityIds: string[],
    calculationTime: Date,
  ) {
    const signalsByOpportunity =
      await this.opportunities.findSignalsByOpportunityIds(opportunityIds);
    const currentMetrics = await this.metrics.findByOpportunityIds(
      opportunityIds,
      OPPORTUNITY_METRICS_V2_VERSION,
    );

    for (const opportunityId of opportunityIds) {
      const attachedSignals = signalsByOpportunity.get(opportunityId) ?? [];
      if (attachedSignals.length === 0) {
        continue;
      }

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
      if (!firstSignal) {
        continue;
      }
      const firstSeenAt = aggregateSignals.reduce(
        (first, signal) =>
          signal.discoveredAt < first ? signal.discoveredAt : first,
        firstSignal.discoveredAt,
      );
      const lastSeenAt = aggregateSignals.reduce(
        (last, signal) =>
          signal.discoveredAt > last ? signal.discoveredAt : last,
        firstSignal.discoveredAt,
      );

      await this.opportunities.update(opportunityId, {
        score: scoreOpportunity(aggregateSignals, calculationTime),
        signalCount: aggregateSignals.length,
        sourceCount: new Set(
          aggregateSignals.map((signal) => signal.researchSourceId),
        ).size,
        firstSeenAt,
        lastSeenAt,
      });

      const metric = calculateOpportunityMetricsV2(
        aggregateSignals,
        calculationTime,
      );
      if (currentMetrics.get(opportunityId)?.inputHash === metric.inputHash) {
        continue;
      }

      await this.metrics.upsert({ opportunityId, ...metric });
    }
  }
}
