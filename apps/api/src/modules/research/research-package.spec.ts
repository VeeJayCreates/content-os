import { ConflictException, NotFoundException } from '@nestjs/common';

jest.mock('@content-os/storage', () => ({
  OpportunityRepository: class OpportunityRepository {},
  ResearchPackageRepository: class ResearchPackageRepository {},
}));

import { scoreResearchConfidence } from './research-package';
import { ResearchPackageService } from './research-package.service';

const opportunity = {
  id: 'opportunity-1',
  projectId: 'project-1',
  projectName: 'Project',
  title: 'Space agency launches climate satellite mission',
  summary: 'A new climate satellite launched.',
  representativeUrl: 'https://example.com',
  status: 'detected',
  score: 75,
  signalCount: 2,
  sourceCount: 2,
  firstSeenAt: '2026-01-01T00:00:00.000Z',
  lastSeenAt: '2026-01-02T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  clusterKey: 'url:https://example.com',
};
const signals = [
  {
    id: 'signal-1',
    projectId: 'project-1',
    researchSourceId: 'source-1',
    title: opportunity.title,
    url: 'https://one.example.com',
    summary: null,
    discoveredAt: '2026-01-01T00:00:00.000Z',
    sourceName: 'Source one',
    sourceType: 'rss',
    externalId: 'one',
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'signal-2',
    projectId: 'project-1',
    researchSourceId: 'source-2',
    title: opportunity.title,
    url: 'https://two.example.com',
    summary: null,
    discoveredAt: '2026-01-02T00:00:00.000Z',
    sourceName: 'Source two',
    sourceType: 'rss',
    externalId: 'two',
    publishedAt: null,
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];

describe('ResearchPackageService', () => {
  const opportunities = {
    findById: jest.fn(),
    findSignalsByOpportunityIds: jest.fn(),
  };
  const evidence = { resolveOpportunityEvidence: jest.fn() };
  const packages = {
    findByOpportunityId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsertFact: jest.fn(),
    attachEvidence: jest.fn(),
    replaceFactsWithEvidence: jest.fn(),
    findById: jest.fn(),
    findFactsWithEvidenceByPackageIds: jest.fn(),
    findAll: jest.fn(),
  };
  const service = new ResearchPackageService(
    opportunities as never,
    packages as never,
    evidence as never,
  );

  beforeEach(() => jest.resetAllMocks());

  it('fails cleanly for a missing opportunity and an opportunity without signals', async () => {
    opportunities.findById.mockResolvedValueOnce(undefined);
    await expect(service.generate(opportunity.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    opportunities.findById.mockResolvedValueOnce(opportunity);
    evidence.resolveOpportunityEvidence.mockResolvedValueOnce({
      kind: 'legacy',
      candidates: [],
      signals: [],
    });
    await expect(service.generate(opportunity.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rebuilds one package without duplicating facts or evidence', async () => {
    const researchPackage = {
      id: 'package-1',
      projectId: opportunity.projectId,
      opportunityId: opportunity.id,
      projectName: opportunity.projectName,
      opportunityTitle: opportunity.title,
      title: opportunity.title,
      summary: opportunity.summary,
      status: 'ready',
      confidenceScore: 85,
      sourceCount: 2,
      signalCount: 2,
      createdAt: opportunity.createdAt,
      updatedAt: opportunity.updatedAt,
    };
    opportunities.findById.mockResolvedValue(opportunity);
    evidence.resolveOpportunityEvidence.mockResolvedValue({
      kind: 'legacy',
      candidates: [],
      signals,
    });
    packages.findByOpportunityId
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(researchPackage);
    packages.create.mockResolvedValue(researchPackage);
    packages.update.mockResolvedValue(researchPackage);
    packages.upsertFact
      .mockResolvedValueOnce({ fact: { id: 'fact-1' }, created: true })
      .mockResolvedValueOnce({ fact: { id: 'fact-1' }, created: false });
    const linked = new Set<string>();
    packages.attachEvidence.mockImplementation(
      (_factId: string, signalId: string) => {
        if (linked.has(signalId)) return false;
        linked.add(signalId);
        return true;
      },
    );

    const first = await service.generate(opportunity.id);
    const second = await service.generate(opportunity.id);

    expect(first).toMatchObject({
      packageId: researchPackage.id,
      signalsProcessed: 2,
      sourcesUsed: 2,
      factsCreated: 1,
    });
    expect(second).toMatchObject({
      packageId: researchPackage.id,
      factsUpdated: 1,
    });
    expect(linked).toEqual(new Set(signals.map((signal) => signal.id)));
    expect(packages.create).toHaveBeenCalledTimes(1);
  });

  it('keeps confidence bounded and rewards multi-source support', () => {
    const now = new Date('2026-01-02T12:00:00.000Z');
    const firstSignal = signals[0];
    if (!firstSignal) throw new Error('Expected a signal fixture');
    const single = scoreResearchConfidence([firstSignal], now);
    const multiple = scoreResearchConfidence(signals, now);
    expect(single).toBeGreaterThanOrEqual(0);
    expect(multiple).toBeLessThanOrEqual(100);
    expect(multiple).toBeGreaterThan(single);
  });

  it('uses candidate text as the fact claim and does not attach sibling candidates', async () => {
    const researchPackage = {
      id: 'package-1', projectId: opportunity.projectId, opportunityId: opportunity.id,
      projectName: opportunity.projectName, opportunityTitle: opportunity.title,
      title: opportunity.title, summary: opportunity.summary, status: 'ready', confidenceScore: 85,
      sourceCount: 1, signalCount: 1, createdAt: opportunity.createdAt, updatedAt: opportunity.updatedAt,
    };
    const multiStorySignal = signals[0]!;
    opportunities.findById.mockResolvedValue(opportunity);
    evidence.resolveOpportunityEvidence.mockResolvedValue({
      kind: 'candidate',
      candidates: [{ candidateId: 'candidate-fcas', candidateText: 'India-France FCAS sixth-generation fighter programme', signal: multiStorySignal }],
      signals: [multiStorySignal],
    });
    packages.findByOpportunityId.mockResolvedValue(undefined);
    packages.create.mockResolvedValue(researchPackage);
    packages.replaceFactsWithEvidence.mockResolvedValue({ previousFactCount: 0 });

    const result = await service.generate(opportunity.id);

    expect(packages.replaceFactsWithEvidence).toHaveBeenCalledWith(
      researchPackage.id,
      [expect.objectContaining({
        claim: 'India-France FCAS sixth-generation fighter programme',
        signalIds: [multiStorySignal.id],
      })],
    );
    expect(packages.attachEvidence).not.toHaveBeenCalled();
    expect(result).toMatchObject({ signalsProcessed: 1, sourcesUsed: 1, factsCreated: 1 });
  });

  it('counts distinct parent Signals and configured Sources for candidate evidence', async () => {
    const researchPackage = {
      id: 'package-1', projectId: opportunity.projectId, opportunityId: opportunity.id,
      projectName: opportunity.projectName, opportunityTitle: opportunity.title,
      title: opportunity.title, summary: opportunity.summary, status: 'ready', confidenceScore: 85,
      sourceCount: 1, signalCount: 2, createdAt: opportunity.createdAt, updatedAt: opportunity.updatedAt,
    };
    const sameSourceSignal = { ...signals[1]!, researchSourceId: signals[0]!.researchSourceId };
    opportunities.findById.mockResolvedValue(opportunity);
    evidence.resolveOpportunityEvidence.mockResolvedValue({
      kind: 'candidate',
      candidates: [
        { candidateId: 'candidate-1', candidateText: 'FCAS update one', signal: signals[0]! },
        { candidateId: 'candidate-2', candidateText: 'FCAS update two', signal: sameSourceSignal },
      ],
      signals: [signals[0]!, sameSourceSignal],
    });
    packages.findByOpportunityId.mockResolvedValue(undefined);
    packages.create.mockResolvedValue(researchPackage);
    packages.replaceFactsWithEvidence.mockResolvedValue({ previousFactCount: 0 });

    const result = await service.generate(opportunity.id);

    expect(result).toMatchObject({ signalsProcessed: 2, sourcesUsed: 1, factsCreated: 2 });
    expect(packages.replaceFactsWithEvidence).toHaveBeenCalledWith(
      researchPackage.id,
      expect.arrayContaining([
        expect.objectContaining({ signalIds: [signals[0]!.id] }),
        expect.objectContaining({ signalIds: [sameSourceSignal.id] }),
      ]),
    );
  });

  it('reads facts and evidence through one batched package query', async () => {
    const researchPackage = {
      id: 'package-1',
      projectId: opportunity.projectId,
      opportunityId: opportunity.id,
      projectName: opportunity.projectName,
      opportunityTitle: opportunity.title,
      title: opportunity.title,
      summary: opportunity.summary,
      status: 'ready',
      confidenceScore: 85,
      sourceCount: 2,
      signalCount: 2,
      createdAt: opportunity.createdAt,
      updatedAt: opportunity.updatedAt,
    };
    packages.findById.mockResolvedValue(researchPackage);
    packages.findFactsWithEvidenceByPackageIds.mockResolvedValue(
      new Map([
        [
          researchPackage.id,
          [
            {
              id: 'fact-1',
              researchPackageId: researchPackage.id,
              claim: opportunity.title,
              normalizedClaimKey:
                'space agency launches climate satellite mission',
              confidence: 85,
              status: 'supported',
              createdAt: opportunity.createdAt,
              signalId: signals[0]?.id,
              signalTitle: signals[0]?.title,
              signalUrl: signals[0]?.url,
              signalSummary: signals[0]?.summary,
              signalPublishedAt: signals[0]?.publishedAt,
              signalDiscoveredAt: signals[0]?.discoveredAt,
              sourceName: signals[0]?.sourceName,
            },
          ],
        ],
      ]),
    );

    const detail = await service.findOne(researchPackage.id);

    expect(packages.findFactsWithEvidenceByPackageIds).toHaveBeenCalledWith([
      researchPackage.id,
    ]);
    expect(detail.facts[0]?.evidence).toHaveLength(1);
    expect(detail.signals).toHaveLength(1);
  });
});
