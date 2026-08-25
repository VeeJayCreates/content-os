jest.mock('@content-os/storage', () => ({
  ResearchSourceRepository: class ResearchSourceRepository {},
  SignalRepository: class SignalRepository {},
}));

jest.mock('@content-os/contracts', () => ({
  ResearchSourceRole: {
    VERIFICATION: 'verification',
  },
  ResearchSourceType: {
    WEBSITE: 'website',
    YOUTUBE: 'youtube',
  },
}));

import { ExternalResearchDiscoveryService } from './external-research-discovery.service';

describe('ExternalResearchDiscoveryService', () => {
  const sources = {
    findByProjectAndUrl: jest.fn(),
    create: jest.fn(),
  };

  const signals = {
    create: jest.fn(),
  };

  const searchProvider = {
    search: jest.fn(),
  };

  const service = new ExternalResearchDiscoveryService(
    sources as never,
    signals as never,
    searchProvider as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();

    searchProvider.search.mockResolvedValue([
      {
        title: 'Iran warns over Strait of Hormuz shipping',
        url: 'https://www.reuters.com/world/middle-east/story-a',
        snippet: 'Iran issued a warning concerning shipping.',
      },
      {
        title: 'Hormuz tensions rise amid Iran US dispute',
        url: 'https://apnews.com/article/story-b',
        snippet: 'Regional tensions increased.',
      },
    ]);

    sources.findByProjectAndUrl.mockResolvedValue(undefined);

    sources.create.mockImplementation(async (data) => ({
      id: `source-${new URL(data.url).hostname}`,
      ...data,
    }));

    signals.create.mockResolvedValue('created');
  });

  it('persists results under independent publisher-level sources', async () => {
    const result = await service.discover({
      projectId: 'project-1',
      queries: ['Strait of Hormuz Iran'],
    });

    expect(result.acceptedResults).toBe(2);

    expect(sources.findByProjectAndUrl).toHaveBeenCalledWith(
      'project-1',
      'https://www.reuters.com',
    );

    expect(sources.findByProjectAndUrl).toHaveBeenCalledWith(
      'project-1',
      'https://apnews.com',
    );

    expect(sources.create).toHaveBeenCalledTimes(2);
    expect(signals.create).toHaveBeenCalledTimes(2);
  });

  it('returns an already-persisted search result so it can be reused for verification', async () => {
    searchProvider.search.mockResolvedValue([
      {
        title: 'Is the Strait of Hormuz Iran’s biggest bargaining chip?',
        url: 'https://www.youtube.com/watch?v=video-existing',
        publisherId: 'UC-trt',
        publisherName: 'TRT World Now',
        publisherUrl: 'https://www.youtube.com/channel/UC-trt',
      },
    ]);

    sources.findByProjectAndUrl.mockResolvedValue({
      id: 'source-trt',
      projectId: 'project-1',
      name: 'TRT World Now',
      sourceType: 'youtube',
      role: 'verification',
      url: 'https://www.youtube.com/channel/UC-trt',
      enabled: true,
    });

    signals.create.mockResolvedValue('duplicate');

    const result = await service.discover({
      projectId: 'project-1',
      queries: ['Strait of Hormuz Iran bargaining chip'],
    });

    expect(result.acceptedResults).toBe(1);

    expect(result.results).toEqual([
      expect.objectContaining({
        sourceId: 'source-trt',
        url: 'https://www.youtube.com/watch?v=video-existing',
      }),
    ]);
  });

  it('persists YouTube videos under independent channel-level sources', async () => {
    searchProvider.search.mockResolvedValue([
      {
        title: 'Strait of Hormuz Emerges As Key Bargaining Chip for Iran',
        url: 'https://www.youtube.com/watch?v=video-a',
        publisherId: 'UC-wion',
        publisherName: 'WION',
        publisherUrl: 'https://www.youtube.com/channel/UC-wion',
      },
      {
        title: 'Is the Strait of Hormuz Iran’s biggest bargaining chip?',
        url: 'https://www.youtube.com/watch?v=video-b',
        publisherId: 'UC-trt',
        publisherName: 'TRT World Now',
        publisherUrl: 'https://www.youtube.com/channel/UC-trt',
      },
      {
        title: 'Iran has figured out the Strait of Hormuz is a bargaining chip',
        url: 'https://www.youtube.com/watch?v=video-c',
        publisherId: 'UC-news24',
        publisherName: 'News24',
        publisherUrl: 'https://www.youtube.com/channel/UC-news24',
      },
    ]);

    const result = await service.discover({
      projectId: 'project-1',
      queries: ['Strait of Hormuz Iran bargaining chip'],
    });

    expect(result.acceptedResults).toBe(3);

    expect(sources.findByProjectAndUrl).toHaveBeenCalledWith(
      'project-1',
      'https://www.youtube.com/channel/UC-wion',
    );

    expect(sources.findByProjectAndUrl).toHaveBeenCalledWith(
      'project-1',
      'https://www.youtube.com/channel/UC-trt',
    );

    expect(sources.findByProjectAndUrl).toHaveBeenCalledWith(
      'project-1',
      'https://www.youtube.com/channel/UC-news24',
    );

    expect(sources.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'WION',
        sourceType: 'youtube',
        url: 'https://www.youtube.com/channel/UC-wion',
      }),
    );

    expect(sources.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'TRT World Now',
        sourceType: 'youtube',
        url: 'https://www.youtube.com/channel/UC-trt',
      }),
    );

    expect(sources.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'News24',
        sourceType: 'youtube',
        url: 'https://www.youtube.com/channel/UC-news24',
      }),
    );

    expect(signals.create).toHaveBeenCalledTimes(3);

    expect(signals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'youtube',
        url: 'https://www.youtube.com/watch?v=video-a',
      }),
    );
  });

  it('reuses an existing publisher source', async () => {
    sources.findByProjectAndUrl.mockResolvedValue({
      id: 'existing-source',
      projectId: 'project-1',
      name: 'Reuters',
      sourceType: 'website',
      role: 'verification',
      url: 'https://www.reuters.com',
      enabled: true,
    });

    await service.discover({
      projectId: 'project-1',
      queries: ['Strait of Hormuz Iran'],
    });

    expect(sources.create).not.toHaveBeenCalled();

    expect(signals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        researchSourceId: 'existing-source',
      }),
    );
  });

  it('deduplicates the same result URL across search queries', async () => {
    searchProvider.search.mockResolvedValue([
      {
        title: 'Iran Hormuz update',
        url: 'https://reuters.com/world/story-a',
      },
    ]);

    await service.discover({
      projectId: 'project-1',
      queries: [
        'Iran Hormuz',
        'Strait of Hormuz Iran',
      ],
    });

    expect(signals.create).toHaveBeenCalledTimes(1);
  });
});