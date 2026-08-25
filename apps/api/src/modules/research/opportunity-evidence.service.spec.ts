jest.mock('@content-os/storage', () => ({
  OpportunityRepository: class OpportunityRepository {},
  TopicCandidateRepository: class TopicCandidateRepository {},
}));

import {
  OpportunityEvidenceResolutionError,
  OpportunityEvidenceService,
} from './opportunity-evidence.service';

const signal = {
  id: 'signal-1',
  projectId: 'project-1',
  researchSourceId: 'source-1',
  title: 'Japan F-2 Fighter Jet | India-France FCAS | IAF Honey Trap',
  url: 'https://example.test/video',
  summary: null,
  externalId: 'video-1',
  sourceType: 'youtube',
  publishedAt: null,
  discoveredAt: '2026-08-12T00:00:00.000Z',
  createdAt: '2026-08-12T00:00:00.000Z',
  sourceName: 'Channel one',
};

describe('OpportunityEvidenceService', () => {
  const opportunities = { findSignalsByOpportunityIds: jest.fn() };

  const candidates = {
    membershipCountsByOpportunityIds: jest.fn(),
    findByOpportunityIds: jest.fn(),
  };

  const service = new OpportunityEvidenceService(
    opportunities as never,
    candidates as never,
  );

  beforeEach(() => jest.resetAllMocks());

  it('merges valid legacy evidence with candidate-backed evidence for a V2 opportunity', async () => {
    const legacySignal = {
      ...signal,
      id: 'signal-legacy',
      researchSourceId: 'source-legacy',
      sourceName: 'Original channel',
      url: 'https://example.test/original-video',
      externalId: 'original-video',
    };

    candidates.membershipCountsByOpportunityIds.mockResolvedValue(
      new Map([['opportunity-fcas', 1]]),
    );

    candidates.findByOpportunityIds.mockResolvedValue(
      new Map([
        [
          'opportunity-fcas',
          [
            {
              id: 'candidate-fcas',
              signalId: signal.id,
              text: 'India-France FCAS sixth-generation fighter programme',
              signal,
              sourceId: signal.researchSourceId,
              sourceName: signal.sourceName,
            },
          ],
        ],
      ]),
    );

    opportunities.findSignalsByOpportunityIds.mockResolvedValue(
      new Map([['opportunity-fcas', [legacySignal]]]),
    );

    const resolved =
      await service.resolveOpportunityEvidence('opportunity-fcas');

    expect(resolved).toMatchObject({
      kind: 'candidate',
      candidates: [
        {
          candidateId: 'candidate-fcas',
          candidateText:
            'India-France FCAS sixth-generation fighter programme',
        },
      ],
    });

    expect(resolved.signals).toHaveLength(2);

    expect(resolved.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'signal-legacy',
          researchSourceId: 'source-legacy',
        }),
        expect.objectContaining({
          id: 'signal-1',
          researchSourceId: 'source-1',
        }),
      ]),
    );

    expect(
      opportunities.findSignalsByOpportunityIds,
    ).toHaveBeenCalledWith(['opportunity-fcas']);
  });

  it('does not duplicate a parent Signal when it exists through both legacy and candidate evidence', async () => {
    candidates.membershipCountsByOpportunityIds.mockResolvedValue(
      new Map([['opportunity-1', 2]]),
    );

    candidates.findByOpportunityIds.mockResolvedValue(
      new Map([
        [
          'opportunity-1',
          [
            {
              id: 'candidate-1',
              signalId: signal.id,
              text: 'Candidate A',
              signal,
              sourceId: signal.researchSourceId,
              sourceName: signal.sourceName,
            },
            {
              id: 'candidate-2',
              signalId: signal.id,
              text: 'Candidate B',
              signal,
              sourceId: signal.researchSourceId,
              sourceName: signal.sourceName,
            },
          ],
        ],
      ]),
    );

    opportunities.findSignalsByOpportunityIds.mockResolvedValue(
      new Map([['opportunity-1', [signal]]]),
    );

    const resolved =
      await service.resolveOpportunityEvidence('opportunity-1');

    expect(resolved.signals).toHaveLength(1);
    expect(resolved.kind).toBe('candidate');
  });

  it('uses legacy opportunity_signals only when no candidate membership exists', async () => {
    candidates.membershipCountsByOpportunityIds.mockResolvedValue(new Map());
    candidates.findByOpportunityIds.mockResolvedValue(new Map());

    opportunities.findSignalsByOpportunityIds.mockResolvedValue(
      new Map([['legacy-opportunity', [signal]]]),
    );

    await expect(
      service.resolveOpportunityEvidence('legacy-opportunity'),
    ).resolves.toEqual({
      kind: 'legacy',
      candidates: [],
      signals: [signal],
    });
  });

  it('fails instead of falling back when a candidate membership has missing parent data', async () => {
    candidates.membershipCountsByOpportunityIds.mockResolvedValue(
      new Map([['opportunity-1', 1]]),
    );

    candidates.findByOpportunityIds.mockResolvedValue(new Map());

    await expect(
      service.resolveOpportunityEvidence('opportunity-1'),
    ).rejects.toMatchObject({
      category: 'candidate_parent_data_missing',
    } satisfies Partial<OpportunityEvidenceResolutionError>);

    expect(
      opportunities.findSignalsByOpportunityIds,
    ).not.toHaveBeenCalled();
  });
});