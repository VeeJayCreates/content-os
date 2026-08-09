jest.mock('@content-os/storage', () => ({
  OpportunityRepository: class OpportunityRepository {},
  OpportunityMetricRepository: class OpportunityMetricRepository {},
  SignalRepository: class SignalRepository {},
}));
jest.mock('@content-os/contracts', () => ({
  ResearchSourceType: { RSS: 'rss', WEBSITE: 'website', YOUTUBE: 'youtube' },
  OPPORTUNITY_METRICS_V2_VERSION: 'opportunity-metrics-v2',
}));

import { OpportunityDetectionService } from './opportunity-detection.service';
import { scoreOpportunity } from './opportunity-detection';

const firstSignal = {
  id: 'signal-1',
  projectId: 'project-1',
  title: 'Space agency launches climate satellite mission',
  url: 'https://source-one.example.com/story',
  summary: 'First report',
  researchSourceId: 'source-1',
  sourceType: 'rss',
  discoveredAt: '2026-01-01T00:00:00.000Z',
  projectName: 'Project',
  sourceName: 'Source one',
  externalId: null,
  normalizedText: null,
  publishedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const secondSignal = {
  ...firstSignal,
  id: 'signal-2',
  url: 'https://source-two.example.com/coverage',
  researchSourceId: 'source-2',
  sourceName: 'Source two',
  discoveredAt: '2026-01-02T00:00:00.000Z',
};

const existingOpportunity = {
  id: 'opportunity-1',
  projectId: 'project-1',
  projectName: 'Project',
  clusterKey: 'url:https://source-one.example.com/story',
  title: firstSignal.title,
  representativeUrl: firstSignal.url,
  summary: firstSignal.summary,
  status: 'detected',
  score: 75,
  signalCount: 1,
  sourceCount: 1,
  firstSeenAt: firstSignal.discoveredAt,
  lastSeenAt: firstSignal.discoveredAt,
  createdAt: firstSignal.discoveredAt,
  updatedAt: firstSignal.discoveredAt,
};

describe('OpportunityDetectionService', () => {
  it('recomputes persisted aggregates after a title-fallback match without duplicating links on rerun', async () => {
    const linkedSignalIds = new Set([firstSignal.id]);
    const signals = {
      findAll: jest.fn().mockResolvedValue([firstSignal, secondSignal]),
    };
    const opportunities = {
      findAll: jest.fn().mockResolvedValue([existingOpportunity]),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(existingOpportunity),
      attachSignal: jest.fn(
        async (_opportunityId: string, signalId: string) => {
          if (linkedSignalIds.has(signalId)) return false;
          linkedSignalIds.add(signalId);
          return true;
        },
      ),
      findSignalsByOpportunityIds: jest.fn(
        async () =>
          new Map([[existingOpportunity.id, [firstSignal, secondSignal]]]),
      ),
    };
    const metrics = {
      findByOpportunityIds: jest.fn().mockResolvedValue(new Map()),
      upsert: jest.fn(),
    };
    const service = new OpportunityDetectionService(
      signals as never,
      opportunities as never,
      metrics as never,
    );

    const calculationTime = new Date('2026-01-02T12:00:00.000Z');
    const firstRun = await service.detect('project-1', calculationTime);
    const firstAggregate = opportunities.update.mock.calls.at(-1)?.[1];

    expect(firstRun).toMatchObject({
      opportunitiesCreated: 0,
      opportunitiesUpdated: 2,
      linksCreated: 1,
    });
    expect(firstAggregate).toEqual({
      score: scoreOpportunity([firstSignal, secondSignal], calculationTime),
      signalCount: 2,
      sourceCount: 2,
      firstSeenAt: firstSignal.discoveredAt,
      lastSeenAt: secondSignal.discoveredAt,
    });

    const secondRun = await service.detect('project-1', calculationTime);
    const secondAggregate = opportunities.update.mock.calls.at(-1)?.[1];

    expect(secondRun).toMatchObject({
      opportunitiesCreated: 0,
      linksCreated: 0,
    });
    expect(secondAggregate).toEqual(firstAggregate);
    expect(linkedSignalIds).toEqual(new Set([firstSignal.id, secondSignal.id]));
  });

  it('keeps distinct YouTube videos in separate URL clusters across repeated detection', async () => {
    const videos = [
      {
        ...firstSignal,
        id: 'video-signal-1',
        title: 'First distinct video',
        url: 'https://www.youtube.com/watch?v=AAA&utm_source=x',
        externalId: 'AAA',
      },
      {
        ...secondSignal,
        id: 'video-signal-2',
        title: 'Second distinct video',
        url: 'https://www.youtube.com/watch?v=BBB&utm_campaign=y',
        externalId: 'BBB',
      },
    ];
    const candidates: (typeof existingOpportunity)[] = [];
    const links = new Map<string, Set<string>>();
    const signals = { findAll: jest.fn().mockResolvedValue(videos) };
    const opportunities = {
      findAll: jest.fn().mockImplementation(() => candidates),
      create: jest.fn(async (data) => {
        return {
          ...existingOpportunity,
          ...data,
          id: `opportunity-${candidates.length + 1}`,
        };
      }),
      update: jest.fn(async (id, data) => {
        const opportunity = candidates.find((candidate) => candidate.id === id);
        if (!opportunity) return undefined;
        Object.assign(opportunity, data);
        return opportunity;
      }),
      attachSignal: jest.fn(async (opportunityId: string, signalId: string) => {
        const signalIds = links.get(opportunityId) ?? new Set<string>();
        if (signalIds.has(signalId)) return false;
        signalIds.add(signalId);
        links.set(opportunityId, signalIds);
        return true;
      }),
      findSignalsByOpportunityIds: jest.fn(
        async (ids: string[]) =>
          new Map(
            ids.map((id) => [
              id,
              videos.filter((video) => links.get(id)?.has(video.id)),
            ]),
          ),
      ),
    };
    const metricsByOpportunity = new Map<string, { inputHash: string }>();
    const metrics = {
      findByOpportunityIds: jest.fn(
        async (ids: string[]) =>
          new Map(
            ids.flatMap((id) => {
              const metric = metricsByOpportunity.get(id);
              return metric ? [[id, metric] as const] : [];
            }),
          ),
      ),
      upsert: jest.fn(async (metric) => {
        metricsByOpportunity.set(metric.opportunityId, metric);
      }),
    };
    const service = new OpportunityDetectionService(
      signals as never,
      opportunities as never,
      metrics as never,
    );

    const calculationTime = new Date('2026-01-02T12:00:00.000Z');
    const firstRun = await service.detect('project-1', calculationTime);
    const secondRun = await service.detect('project-1', calculationTime);

    expect(firstRun).toMatchObject({
      opportunitiesCreated: 2,
      linksCreated: 2,
    });
    expect(secondRun).toMatchObject({
      opportunitiesCreated: 0,
      linksCreated: 0,
    });
    expect(candidates.map((candidate) => candidate.clusterKey).sort()).toEqual([
      'url:https://www.youtube.com/watch?v=AAA',
      'url:https://www.youtube.com/watch?v=BBB',
    ]);
    expect([...links.values()].map((signalIds) => signalIds.size)).toEqual([
      1, 1,
    ]);
    expect(metrics.upsert).toHaveBeenCalledTimes(2);
    expect(metricsByOpportunity.size).toBe(2);
  });
});
