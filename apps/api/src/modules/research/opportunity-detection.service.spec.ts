jest.mock('@content-os/storage', () => ({
  OpportunityRepository: class OpportunityRepository {},
  OpportunityMetricRepository: class OpportunityMetricRepository {},
  SignalRepository: class SignalRepository {},
  TopicCandidateRepository: class TopicCandidateRepository {},
}));
jest.mock('@content-os/contracts', () => ({
  ResearchSourceType: { RSS: 'rss', WEBSITE: 'website', YOUTUBE: 'youtube' },
  OPPORTUNITY_METRICS_V2_VERSION: 'opportunity-metrics-v2',
}));

import { OpportunityDetectionService } from './opportunity-detection.service';
import { scoreOpportunity } from './opportunity-detection';

const firstSignal = {
  id: 'signal-1', projectId: 'project-1', title: 'Space agency launches climate satellite mission', url: 'https://source-one.example.com/story', summary: 'First report', researchSourceId: 'source-1', sourceType: 'rss', discoveredAt: '2026-01-01T00:00:00.000Z', projectName: 'Project', sourceName: 'Source one', externalId: null, normalizedText: null, publishedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
};

const secondSignal = {
  ...firstSignal, id: 'signal-2', url: 'https://source-two.example.com/coverage', researchSourceId: 'source-2', sourceName: 'Source two', discoveredAt: '2026-01-02T00:00:00.000Z',
};

const existingOpportunity = {
  id: 'opportunity-1', projectId: 'project-1', projectName: 'Project', clusterKey: 'url:https://source-one.example.com/story', title: firstSignal.title, representativeUrl: firstSignal.url, summary: firstSignal.summary, status: 'detected', score: 75, signalCount: 1, sourceCount: 1, firstSeenAt: firstSignal.discoveredAt, lastSeenAt: firstSignal.discoveredAt, createdAt: firstSignal.discoveredAt, updatedAt: firstSignal.discoveredAt,
};

function createHarness(records: typeof firstSignal[], initialCandidates = [] as typeof existingOpportunity[]) {
  const candidates = [...initialCandidates];
  const links = new Map<string, Set<string>>();
  const metricsByOpportunity = new Map<string, { inputHash: string }>();
  const topicCandidates = new Map<string, { id: string; projectId: string; signalId: string; text: string; normalizedText: string }>();
  const candidateLinks = new Map<string, Set<string>>();
  const signals = { findAll: jest.fn().mockResolvedValue(records) };
  const opportunities = {
    findAll: jest.fn().mockImplementation(() => candidates),
    persistDetectionBatch: jest.fn(async (creates, updates, pendingLinks) => {
      for (const created of creates) {
        if (!candidates.some((candidate) => candidate.id === created.id)) {
          candidates.push({ ...created, projectName: 'Project' });
        }
      }
      for (const update of updates) {
        const candidate = candidates.find((item) => item.id === update.id);
        if (candidate) Object.assign(candidate, update.data);
      }
      let linksCreated = 0;
      for (const link of pendingLinks) {
        const signalIds = links.get(link.opportunityId) ?? new Set<string>();
        if (!signalIds.has(link.signalId)) {
          signalIds.add(link.signalId);
          linksCreated += 1;
        }
        links.set(link.opportunityId, signalIds);
      }
      return linksCreated;
    }),
    findSignalsByOpportunityIds: jest.fn(async (ids: string[]) => new Map(ids.map((id) => [id, records.filter((record) => links.get(id)?.has(record.id))]))),
    updateAggregates: jest.fn(async (updates) => {
      for (const update of updates) {
        const candidate = candidates.find((item) => item.id === update.id);
        if (candidate) Object.assign(candidate, update.data);
      }
    }),
  };
  const metrics = {
    findByOpportunityIds: jest.fn(async (ids: string[]) => new Map(ids.flatMap((id) => {
      const metric = metricsByOpportunity.get(id);
      return metric ? [[id, metric] as const] : [];
    }))),
    upsertMany: jest.fn(async (entries) => {
      for (const metric of entries) metricsByOpportunity.set(metric.opportunityId, metric);
    }),
  };
  const candidateRepository = {
    upsert: jest.fn(async (data) => { const id = `candidate-${data.signalId}-${data.normalizedText}`; const stored = { id, ...data }; topicCandidates.set(id, stored); return stored; }),
    attachToOpportunity: jest.fn(async (opportunityId, candidateId) => { const attached = candidateLinks.get(opportunityId) ?? new Set<string>(); const fresh = !attached.has(candidateId); attached.add(candidateId); candidateLinks.set(opportunityId, attached); return fresh; }),
    findByOpportunityIds: jest.fn(async (ids) => new Map(ids.map((id) => [id, [...(candidateLinks.get(id) ?? [])].map((candidateId) => topicCandidates.get(candidateId)).filter(Boolean)]))),
  };
  const clustering = { cluster: jest.fn(async (items) => items.map((item) => ({ candidateIds: [item.id], titleCandidateId: item.id, clusterKey: `semantic-v2:${item.id}` }))) };
  return { candidates, links, metricsByOpportunity, signals, opportunities, metrics, candidateRepository, clustering };
}

describe('OpportunityDetectionService', () => {
  it('recomputes persisted aggregates after a title-fallback match without duplicating links on rerun', async () => {
    const harness = createHarness([firstSignal, secondSignal], [existingOpportunity]);
    const service = new OpportunityDetectionService(harness.signals as never, harness.opportunities as never, harness.metrics as never, harness.candidateRepository as never, harness.clustering as never);
    const calculationTime = new Date('2026-01-02T12:00:00.000Z');

    const firstRun = await service.detect('project-1', calculationTime);
    expect(firstRun).toMatchObject({ opportunitiesCreated: 2, linksCreated: 2 });

    const secondRun = await service.detect('project-1', calculationTime);
    expect(secondRun).toMatchObject({ opportunitiesCreated: 0, linksCreated: 0 });
  });

  it('keeps distinct YouTube videos in separate URL clusters across repeated detection', async () => {
    const videos = [
      { ...firstSignal, id: 'video-signal-1', title: 'First distinct video', url: 'https://www.youtube.com/watch?v=AAA&utm_source=x', externalId: 'AAA' },
      { ...secondSignal, id: 'video-signal-2', title: 'Second distinct video', url: 'https://www.youtube.com/watch?v=BBB&utm_campaign=y', externalId: 'BBB' },
    ];
    const harness = createHarness(videos);
    const service = new OpportunityDetectionService(harness.signals as never, harness.opportunities as never, harness.metrics as never, harness.candidateRepository as never, harness.clustering as never);
    const calculationTime = new Date('2026-01-02T12:00:00.000Z');

    expect(await service.detect('project-1', calculationTime)).toMatchObject({ opportunitiesCreated: 2, linksCreated: 2 });
    expect(await service.detect('project-1', calculationTime)).toMatchObject({ opportunitiesCreated: 0, linksCreated: 0 });
    expect(harness.candidates.map((candidate) => candidate.clusterKey).sort()).toEqual([
      'semantic-v2:candidate-video-signal-1-first distinct video', 'semantic-v2:candidate-video-signal-2-second distinct video',
    ]);
    expect(harness.metricsByOpportunity.size).toBe(2);
  });

  it('completes and remains idempotent for 300 Signals while repository reads remain usable', async () => {
    const records = Array.from({ length: 300 }, (_, index) => ({
      ...firstSignal,
      id: `signal-${index}`,
      title: `Distinct source content ${index}`,
      url: `https://source.example.com/story-${index}`,
      researchSourceId: `source-${index % 4}`,
      discoveredAt: `2026-01-02T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
    }));
    const harness = createHarness(records);
    const service = new OpportunityDetectionService(harness.signals as never, harness.opportunities as never, harness.metrics as never, harness.candidateRepository as never, harness.clustering as never);
    const calculationTime = new Date('2026-01-03T00:00:00.000Z');

    expect(await service.detect('project-1', calculationTime)).toMatchObject({ signalsProcessed: 300, opportunitiesCreated: 300, linksCreated: 300 });
    expect(await service.detect('project-1', calculationTime)).toMatchObject({ signalsProcessed: 300, opportunitiesCreated: 0, linksCreated: 0 });
    expect(harness.candidates).toHaveLength(300);
    expect(harness.opportunities.findAll('project-1')).toHaveLength(300);
    expect(await harness.signals.findAll('project-1')).toHaveLength(300);
  });
});
