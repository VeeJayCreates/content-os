jest.mock('@content-os/contracts', () => ({
  ResearchSourceType: { YOUTUBE: 'youtube' },
}));

jest.mock('@content-os/storage', () => ({
  OpportunityRepository: class OpportunityRepository {},
  SignalRepository: class SignalRepository {},
}));

import { NewVideoTopicService } from './new-video-topic.service';

const ResearchSourceType = { YOUTUBE: 'youtube' } as const;

const projectId = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const now = '2026-08-31T10:00:00.000Z';

function signal(
  id: string,
  title: string,
  externalId = `youtube:${id}`,
) {
  return {
    id,
    projectId,
    researchSourceId: sourceId,
    sourceType: ResearchSourceType.YOUTUBE,
    externalId,
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    summary: null,
    publishedAt: now,
    discoveredAt: now,
    createdAt: now,
    projectName: 'Project',
    sourceName: 'Source',
  };
}

function opportunity(
  id: string,
  title: string,
  clusterKey = 'old',
) {
  return {
    id,
    projectId,
    projectName: 'Project',
    clusterKey,
    title,
    representativeUrl: 'https://example.test',
    summary: null,
    status: 'detected',
    score: 75,
    signalCount: 1,
    sourceCount: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function harness() {
  const signals = {
    findById: jest.fn(),
    normalizeYouTubeExternalIds: jest.fn().mockResolvedValue(0),
  };

  const opportunities = {
    findRecentByProject: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    attachSignal: jest.fn().mockResolvedValue(true),
    findSignalsByOpportunityIds: jest.fn().mockResolvedValue(new Map()),
    update: jest.fn(),
  };

  const semanticClustering = {
    cluster: jest.fn().mockResolvedValue([]),
    findBestMatch: jest.fn().mockResolvedValue(undefined),
    retrieveBestCandidates: jest.fn().mockResolvedValue([]),
  };

  const eventCoreference = {
    compare: jest.fn().mockResolvedValue(null),
    compareCandidates: jest.fn().mockResolvedValue({
      matchedCandidateId: null,
      reason: 'No matching event.',
    }),
  };

  return {
    signals,
    opportunities,
    semanticClustering,
    eventCoreference,
    service: new NewVideoTopicService(
      signals as never,
      opportunities as never,
      semanticClustering as never,
      eventCoreference as never,
    ),
  };
}

describe('NewVideoTopicService', () => {
  it('creates a topic and provenance link from one new video without a transcript', async () => {
    const h = harness();

    h.signals.findById.mockResolvedValue(
      signal(
        'video-1',
        'China India border tensions update',
      ),
    );

    h.opportunities.create.mockResolvedValue(
      opportunity(
        'topic-1',
        'China India border tensions update',
      ),
    );

    await expect(
      h.service.process(projectId, ['video-1']),
    ).resolves.toMatchObject({
      newVideosProcessed: 1,
      topicsCreated: 1,
      linksCreated: 1,
      videosJoinedToExistingTopic: 0,
      mappings: [
        {
          signalId: 'video-1',
          videoId: 'video-1',
          topicId: 'topic-1',
          decision: 'created',
        },
      ],
    });

    expect(
      h.opportunities.findRecentByProject,
    ).toHaveBeenCalledWith(projectId, 100);

    expect(
      h.opportunities.attachSignal,
    ).toHaveBeenCalledWith('topic-1', 'video-1');
  });

  it('conservatively joins an exact normalized recent topic and updates only that topic', async () => {
    const h = harness();

    const existing = opportunity(
      'topic-1',
      'China India border tensions update',
    );

    h.opportunities.findRecentByProject.mockResolvedValue([
      existing,
    ]);

    h.signals.findById.mockResolvedValue(
      signal(
        'video-2',
        'China India Border Tensions Update',
      ),
    );

    h.opportunities.findSignalsByOpportunityIds.mockResolvedValue(
      new Map([
        [
          'topic-1',
          [
            signal(
              'old-video',
              'China India border tensions update',
            ),
            signal(
              'video-2',
              'China India Border Tensions Update',
            ),
          ],
        ],
      ]),
    );

    await expect(
      h.service.process(projectId, ['video-2']),
    ).resolves.toMatchObject({
      topicsCreated: 0,
      videosJoinedToExistingTopic: 1,
      linksCreated: 1,
    });

    expect(
      h.opportunities.create,
    ).not.toHaveBeenCalled();

    expect(
      h.opportunities.update,
    ).toHaveBeenCalledWith(
      'topic-1',
      expect.objectContaining({
        signalCount: 2,
      }),
    );

    expect(
      h.semanticClustering.retrieveBestCandidates,
    ).not.toHaveBeenCalled();

    expect(
      h.eventCoreference.compareCandidates,
    ).not.toHaveBeenCalled();
  });

  it('creates a separate topic for an unrelated video rather than aggressively merging', async () => {
    const h = harness();

    h.opportunities.findRecentByProject.mockResolvedValue([
      opportunity(
        'topic-1',
        'China India border tensions update',
      ),
    ]);

    h.signals.findById.mockResolvedValue(
      signal(
        'video-3',
        'Global oil prices and shipping routes explained',
      ),
    );

    h.semanticClustering.retrieveBestCandidates.mockResolvedValue([]);

    h.opportunities.create.mockResolvedValue(
      opportunity(
        'topic-2',
        'Global oil prices and shipping routes explained',
      ),
    );

    const result = await h.service.process(
      projectId,
      ['video-3'],
    );

    expect(result.topicsCreated).toBe(1);
    expect(result.videosJoinedToExistingTopic).toBe(0);

    expect(
      h.semanticClustering.retrieveBestCandidates,
    ).toHaveBeenCalledTimes(1);

    expect(
      h.eventCoreference.compareCandidates,
    ).not.toHaveBeenCalled();
  });

  it('joins one GLM-confirmed same-event recent topic after exact matching misses', async () => {
    const h = harness();

    const existing = opportunity(
      'topic-1',
      'India defence exports reach a record high',
    );

    h.opportunities.findRecentByProject.mockResolvedValue([
      existing,
    ]);

    h.signals.findById.mockResolvedValue(
      signal(
        'video-4',
        'India achieves new defence export record',
      ),
    );

    h.semanticClustering.retrieveBestCandidates.mockResolvedValue([
      {
        candidateId: 'topic-1',
        similarity: 0.91,
      },
    ]);

    h.eventCoreference.compareCandidates.mockResolvedValue({
      matchedCandidateId: 'topic-1',
      reason: 'Same specific defence export announcement.',
    });

    await expect(
      h.service.process(projectId, ['video-4']),
    ).resolves.toMatchObject({
      topicsCreated: 0,
      videosJoinedToExistingTopic: 1,
    });

    expect(
      h.opportunities.create,
    ).not.toHaveBeenCalled();

    expect(
      h.opportunities.attachSignal,
    ).toHaveBeenCalledWith('topic-1', 'video-4');

    expect(
      h.semanticClustering.retrieveBestCandidates,
    ).toHaveBeenCalledTimes(1);

    expect(
      h.eventCoreference.compareCandidates,
    ).toHaveBeenCalledTimes(1);

    expect(
      h.eventCoreference.compareCandidates,
    ).toHaveBeenCalledWith(
      'India achieves new defence export record',
      [
        {
          id: 'topic-1',
          title: 'India defence exports reach a record high',
        },
      ],
    );
  });

  it('joins the GLM-selected same-event candidate when multiple related candidates exist', async () => {
    const h = harness();

    const first = opportunity(
      'topic-1',
      'India signs Javelin missile deal with US',
    );

    const second = opportunity(
      'topic-2',
      'India defence partnership with United States',
    );

    h.opportunities.findRecentByProject.mockResolvedValue([
      first,
      second,
    ]);

    h.signals.findById.mockResolvedValue(
      signal(
        'video-5',
        'India places order for US Javelin missiles',
      ),
    );

    h.semanticClustering.retrieveBestCandidates.mockResolvedValue([
      {
        candidateId: 'topic-1',
        similarity: 0.89,
      },
      {
        candidateId: 'topic-2',
        similarity: 0.84,
      },
    ]);

    h.eventCoreference.compareCandidates.mockResolvedValue({
      matchedCandidateId: 'topic-1',
      reason: 'Same Javelin procurement event.',
    });

    await expect(
      h.service.process(projectId, ['video-5']),
    ).resolves.toMatchObject({
      topicsCreated: 0,
      videosJoinedToExistingTopic: 1,
    });

    expect(
      h.opportunities.create,
    ).not.toHaveBeenCalled();

    expect(
      h.opportunities.attachSignal,
    ).toHaveBeenCalledWith('topic-1', 'video-5');

    expect(
      h.eventCoreference.compareCandidates,
    ).toHaveBeenCalledTimes(1);

    expect(
      h.eventCoreference.compareCandidates,
    ).toHaveBeenCalledWith(
      'India places order for US Javelin missiles',
      expect.arrayContaining([
        {
          id: 'topic-1',
          title: 'India signs Javelin missile deal with US',
        },
        {
          id: 'topic-2',
          title: 'India defence partnership with United States',
        },
      ]),
    );
  });

  it('allows GLM to select the second retrieved candidate in one batched comparison', async () => {
    const h = harness();

    const first = opportunity(
      'topic-1',
      'India Javelin missile procurement',
    );

    const second = opportunity(
      'topic-2',
      'India signs Javelin missile acquisition deal',
    );

    h.opportunities.findRecentByProject.mockResolvedValue([
      first,
      second,
    ]);

    h.signals.findById.mockResolvedValue(
      signal(
        'video-6',
        'India confirms Javelin missile deal with US',
      ),
    );

    h.semanticClustering.retrieveBestCandidates.mockResolvedValue([
      {
        candidateId: 'topic-1',
        similarity: 0.91,
      },
      {
        candidateId: 'topic-2',
        similarity: 0.88,
      },
    ]);

    h.eventCoreference.compareCandidates.mockResolvedValue({
      matchedCandidateId: 'topic-2',
      reason: 'The second candidate describes the same specific acquisition deal.',
    });

    const result = await h.service.process(
      projectId,
      ['video-6'],
    );

    expect(result.topicsCreated).toBe(0);
    expect(result.videosJoinedToExistingTopic).toBe(1);

    expect(
      h.opportunities.attachSignal,
    ).toHaveBeenCalledWith('topic-2', 'video-6');

    // The important optimization:
    // both candidates are evaluated in one GLM request.
    expect(
      h.eventCoreference.compareCandidates,
    ).toHaveBeenCalledTimes(1);

    expect(
      h.eventCoreference.compareCandidates,
    ).toHaveBeenCalledWith(
      'India confirms Javelin missile deal with US',
      expect.arrayContaining([
        {
          id: 'topic-1',
          title: 'India Javelin missile procurement',
        },
        {
          id: 'topic-2',
          title: 'India signs Javelin missile acquisition deal',
        },
      ]),
    );
  });

  it('rejects semantically related candidates when GLM says none describe the same event', async () => {
    const h = harness();

    const existing = opportunity(
      'topic-1',
      'Pakistan requests dialogue with India over Indus waters',
    );

    h.opportunities.findRecentByProject.mockResolvedValue([
      existing,
    ]);

    h.signals.findById.mockResolvedValue(
      signal(
        'video-7',
        'India rejects Permanent Court arbitration order on Indus treaty',
      ),
    );

    h.semanticClustering.retrieveBestCandidates.mockResolvedValue([
      {
        candidateId: 'topic-1',
        similarity: 0.87,
      },
    ]);

    h.eventCoreference.compareCandidates.mockResolvedValue({
      matchedCandidateId: null,
      reason: 'Same dispute, but different specific developments.',
    });

    h.opportunities.create.mockResolvedValue(
      opportunity(
        'topic-2',
        'India rejects Permanent Court arbitration order on Indus treaty',
      ),
    );

    const result = await h.service.process(
      projectId,
      ['video-7'],
    );

    expect(result.topicsCreated).toBe(1);
    expect(result.videosJoinedToExistingTopic).toBe(0);

    expect(
      h.opportunities.attachSignal,
    ).toHaveBeenCalledWith('topic-2', 'video-7');

    expect(
      h.eventCoreference.compareCandidates,
    ).toHaveBeenCalledTimes(1);
  });

  it('creates a separate topic when the GLM provider cannot return a decision', async () => {
    const h = harness();

    h.opportunities.findRecentByProject.mockResolvedValue([
      opportunity(
        'topic-1',
        'India signs Javelin missile deal with US',
      ),
    ]);

    h.signals.findById.mockResolvedValue(
      signal(
        'video-8',
        'India confirms Javelin acquisition',
      ),
    );

    h.semanticClustering.retrieveBestCandidates.mockResolvedValue([
      {
        candidateId: 'topic-1',
        similarity: 0.9,
      },
    ]);

    h.eventCoreference.compareCandidates.mockResolvedValue(null);

    h.opportunities.create.mockResolvedValue(
      opportunity(
        'topic-2',
        'India confirms Javelin acquisition',
      ),
    );

    const result = await h.service.process(
      projectId,
      ['video-8'],
    );

    expect(result.topicsCreated).toBe(1);
    expect(result.videosJoinedToExistingTopic).toBe(0);

    expect(
      h.opportunities.attachSignal,
    ).toHaveBeenCalledWith('topic-2', 'video-8');

    expect(
      h.eventCoreference.compareCandidates,
    ).toHaveBeenCalledTimes(1);
  });

  it('is idempotent when the same video already has a topic-source link', async () => {
    const h = harness();

    const existing = opportunity(
      'topic-1',
      'China India border tensions update',
    );

    h.opportunities.findRecentByProject.mockResolvedValue([
      existing,
    ]);

    h.signals.findById.mockResolvedValue(
      signal(
        'video-1',
        'China India border tensions update',
      ),
    );

    h.opportunities.attachSignal.mockResolvedValue(false);

    await expect(
      h.service.process(projectId, [
        'video-1',
        'video-1',
      ]),
    ).resolves.toMatchObject({
      newVideosProcessed: 1,
      topicsCreated: 0,
      duplicateNoops: 1,
      linksCreated: 0,
    });

    expect(
      h.opportunities.create,
    ).not.toHaveBeenCalled();
  });

  it('isolates an invalid item while processing another supplied video', async () => {
    const h = harness();

    h.signals.findById
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(
        signal(
          'video-2',
          'China India border tensions update',
        ),
      );

    h.opportunities.create.mockResolvedValue(
      opportunity(
        'topic-1',
        'China India border tensions update',
      ),
    );

    const result = await h.service.process(
      projectId,
      ['missing', 'video-2'],
    );

    expect(result).toMatchObject({
      newVideosProcessed: 1,
      topicsCreated: 1,
      failures: [
        {
          signalId: 'missing',
          category: 'ineligible_new_video_signal',
        },
      ],
    });
  });

  it('does not query historical signals beyond the explicitly supplied ids', async () => {
    const h = harness();

    h.signals.findById.mockResolvedValue(
      signal(
        'video-1',
        'China India border tensions update',
      ),
    );

    h.opportunities.create.mockResolvedValue(
      opportunity(
        'topic-1',
        'China India border tensions update',
      ),
    );

    await h.service.process(projectId, ['video-1']);

    expect(
      h.signals.findById,
    ).toHaveBeenCalledTimes(1);

    expect(
      h.signals,
    ).not.toHaveProperty('findAll');
  });
});