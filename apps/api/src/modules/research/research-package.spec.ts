import { ConflictException, NotFoundException } from '@nestjs/common';

jest.mock('@content-os/contracts', () => ({
  ResearchFactStatus: { SUPPORTED: 'supported', CONFLICTING: 'conflicting', UNVERIFIED: 'unverified' },
  ResearchVerificationStatus: { INSUFFICIENT: 'insufficient', SINGLE_SOURCE: 'single_source', CORROBORATED: 'corroborated', CONFLICTING: 'conflicting', REVIEW_REQUIRED: 'review_required' },
  ResearchLifecycleState: { RESEARCHING: 'researching', NEEDS_MORE_EVIDENCE: 'needs_more_evidence', CORROBORATED: 'corroborated', REVIEW_READY: 'review_ready', APPROVED: 'approved', REJECTED: 'rejected' },
  TopicSelectionDecision: { SELECTED: 'selected', HOLD: 'hold' },
}));
jest.mock('@content-os/storage', () => ({
  OpportunityRepository: class OpportunityRepository {},
  ResearchPackageRepository: class ResearchPackageRepository {},
}));

import {
  isVerifiableResearchClaim,
  scoreResearchConfidence,
} from './research-package';
import { ResearchPackageService } from './research-package.service';
import { ResearchVerificationStatus } from '@content-os/contracts';

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

  beforeEach(() => {
    jest.resetAllMocks();
    packages.replaceFactsWithEvidence.mockResolvedValue({ previousFactCount: 0 });
  });

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

  it('rejects editorial headline framing rather than persisting it as a Research Fact', () => {
    expect(
      isVerifiableResearchClaim('Hormuz Become Iran Big Bargaining Chip'),
    ).toBe(false);
    expect(
      isVerifiableResearchClaim(
        "The Strait of Hormuz is Iran's Biggest Bargaining Chip - US Iran Latest update",
      ),
    ).toBe(false);
    expect(
      isVerifiableResearchClaim(
        'India and France signed a cooperation agreement for a fighter programme',
      ),
    ).toBe(true);
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
              researchSourceId: signals[0]?.researchSourceId,
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
    expect(detail.verification).toMatchObject({
      verificationStatus: ResearchVerificationStatus.SINGLE_SOURCE,
      evidenceSignalCount: 1,
      canProceedAutomatically: false,
    });
  });

  it('records human approval or rejection on the research package only', async () => {
    const researchPackage = {
      id: 'package-1', projectId: opportunity.projectId, opportunityId: opportunity.id,
      projectName: opportunity.projectName, opportunityTitle: opportunity.title,
      title: opportunity.title, summary: opportunity.summary, status: 'ready', confidenceScore: 85,
      sourceCount: 3, signalCount: 3, lifecycleState: 'review_ready',
      createdAt: opportunity.createdAt, updatedAt: opportunity.updatedAt,
    };
    packages.findById.mockResolvedValue(researchPackage);
    packages.update.mockImplementation(async (_id: string, changes: object) => ({ ...researchPackage, ...changes }));

    await expect(service.review(researchPackage.id, 'approved')).resolves.toMatchObject({ lifecycleState: 'approved' });
    await expect(service.review(researchPackage.id, 'rejected')).resolves.toMatchObject({ lifecycleState: 'rejected' });
    expect(packages.update).toHaveBeenNthCalledWith(1, researchPackage.id, { lifecycleState: 'approved' });
    expect(packages.update).toHaveBeenNthCalledWith(2, researchPackage.id, { lifecycleState: 'rejected' });
  });

  it('does not permit a weak package to bypass the review-ready lifecycle gate', async () => {
    packages.findById.mockResolvedValue({
      id: 'package-weak',
      lifecycleState: 'needs_more_evidence',
    });

    await expect(service.review('package-weak', 'approved')).rejects.toBeInstanceOf(ConflictException);
    expect(packages.update).not.toHaveBeenCalled();
  });
});
