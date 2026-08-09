import { Injectable } from '@nestjs/common';
import type { OpportunityDetectionResult } from '@content-os/contracts';
import { OpportunityRepository, SignalRepository } from '@content-os/storage';

import { clusterKey, DetectionSignal, scoreOpportunity, titlesMatch } from './opportunity-detection';

@Injectable()
export class OpportunityDetectionService {
  constructor(private readonly signals: SignalRepository, private readonly opportunities: OpportunityRepository) {}

  async detect(projectId?: string): Promise<OpportunityDetectionResult> {
    const records = await this.signals.findAll(projectId);
    const grouped = new Map<string, DetectionSignal[]>();
    for (const signal of records) {
      const item: DetectionSignal = { id: signal.id, projectId: signal.projectId, title: signal.title, url: signal.url, summary: signal.summary, researchSourceId: signal.researchSourceId, discoveredAt: signal.discoveredAt };
      const key = `${item.projectId}:${clusterKey(item)}`;
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    const result: OpportunityDetectionResult = { signalsProcessed: records.length, opportunitiesCreated: 0, opportunitiesUpdated: 0, linksCreated: 0, warnings: [] };
    const candidatesByProject = new Map<string, Awaited<ReturnType<OpportunityRepository['findAll']>>>();
    const affectedOpportunityIds = new Set<string>();

    for (const signals of grouped.values()) {
      const representative = signals[0]!;
      const key = clusterKey(representative);
      let candidates = candidatesByProject.get(representative.projectId);
      if (!candidates) {
        candidates = await this.opportunities.findAll(representative.projectId);
        candidatesByProject.set(representative.projectId, candidates);
      }
      let opportunity = candidates.find((candidate) => candidate.clusterKey === key);
      if (!opportunity) opportunity = candidates.find((candidate) => titlesMatch(candidate.title, representative.title));
      const firstSeenAt = signals.reduce((first, signal) => signal.discoveredAt < first ? signal.discoveredAt : first, representative.discoveredAt);
      const lastSeenAt = signals.reduce((last, signal) => signal.discoveredAt > last ? signal.discoveredAt : last, representative.discoveredAt);
      const data = { title: representative.title, representativeUrl: representative.url, summary: representative.summary, score: scoreOpportunity(signals), signalCount: signals.length, sourceCount: new Set(signals.map((signal) => signal.researchSourceId)).size, firstSeenAt, lastSeenAt };
      if (opportunity) { opportunity = (await this.opportunities.update(opportunity.id, data))!; result.opportunitiesUpdated++; } else { opportunity = await this.opportunities.create({ projectId: representative.projectId, clusterKey: key, status: 'detected', ...data }); candidates.push(opportunity); result.opportunitiesCreated++; }
      for (const signal of signals) if (await this.opportunities.attachSignal(opportunity.id, signal.id)) result.linksCreated++;
      affectedOpportunityIds.add(opportunity.id);
    }

    const affectedIds = [...affectedOpportunityIds];
    const signalsByOpportunity = await this.opportunities.findSignalsByOpportunityIds(affectedIds);
    for (const id of affectedIds) {
      const attachedSignals = signalsByOpportunity.get(id) ?? [];
      if (!attachedSignals.length) continue;
      const aggregateSignals: DetectionSignal[] = attachedSignals.map((signal) => ({ id: signal.id, projectId: signal.projectId, title: signal.title, url: signal.url, summary: signal.summary, researchSourceId: signal.researchSourceId, discoveredAt: signal.discoveredAt }));
      const firstSeenAt = aggregateSignals.reduce((first, signal) => signal.discoveredAt < first ? signal.discoveredAt : first, aggregateSignals[0]!.discoveredAt);
      const lastSeenAt = aggregateSignals.reduce((last, signal) => signal.discoveredAt > last ? signal.discoveredAt : last, aggregateSignals[0]!.discoveredAt);
      await this.opportunities.update(id, {
        score: scoreOpportunity(aggregateSignals),
        signalCount: aggregateSignals.length,
        sourceCount: new Set(aggregateSignals.map((signal) => signal.researchSourceId)).size,
        firstSeenAt,
        lastSeenAt,
      });
    }
    return result;
  }
}
