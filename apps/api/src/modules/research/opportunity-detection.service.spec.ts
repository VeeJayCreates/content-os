jest.mock('@content-os/storage', () => ({
  OpportunityRepository: class OpportunityRepository {},
  SignalRepository: class SignalRepository {},
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
    const signals = { findAll: jest.fn().mockResolvedValue([firstSignal, secondSignal]) };
    const opportunities = {
      findAll: jest.fn().mockResolvedValue([existingOpportunity]),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(existingOpportunity),
      attachSignal: jest.fn(async (_opportunityId: string, signalId: string) => {
        if (linkedSignalIds.has(signalId)) return false;
        linkedSignalIds.add(signalId);
        return true;
      }),
      findSignalsByOpportunityIds: jest.fn(async () => new Map([
        [existingOpportunity.id, [firstSignal, secondSignal]],
      ])),
    };
    const service = new OpportunityDetectionService(signals as never, opportunities as never);

    const firstRun = await service.detect('project-1');
    const firstAggregate = opportunities.update.mock.calls.at(-1)?.[1];

    expect(firstRun).toMatchObject({ opportunitiesCreated: 0, opportunitiesUpdated: 2, linksCreated: 1 });
    expect(firstAggregate).toEqual({
      score: scoreOpportunity([firstSignal, secondSignal]),
      signalCount: 2,
      sourceCount: 2,
      firstSeenAt: firstSignal.discoveredAt,
      lastSeenAt: secondSignal.discoveredAt,
    });

    const secondRun = await service.detect('project-1');
    const secondAggregate = opportunities.update.mock.calls.at(-1)?.[1];

    expect(secondRun).toMatchObject({ opportunitiesCreated: 0, linksCreated: 0 });
    expect(secondAggregate).toEqual(firstAggregate);
    expect(linkedSignalIds).toEqual(new Set([firstSignal.id, secondSignal.id]));
  });
});
