import { BadRequestException } from '@nestjs/common';

import { YouTubeIngestionAdapter } from './youtube-ingestion.adapter';
import { YouTubeChannelResolver } from './youtube-channel-resolver';

const channelId = 'UCabcdefghijklmnopqrstuv';
const atomFeed = `
  <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
    <entry>
      <yt:videoId>video-123</yt:videoId>
      <title><![CDATA[Channel update]]></title>
      <published>2026-08-09T10:00:00+00:00</published>
    </entry>
  </feed>
`;

describe('YouTubeIngestionAdapter', () => {
  const resolver = { resolve: jest.fn() };
  const adapter = new YouTubeIngestionAdapter(resolver as never);

  beforeEach(() => jest.resetAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('ingests the official feed for a direct channel URL', async () => {
    const directResolver = new YouTubeChannelResolver();
    const directAdapter = new YouTubeIngestionAdapter(directResolver);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(atomFeed, { status: 200 }),
    );

    await expect(
      directAdapter.fetchItems(`https://youtube.com/channel/${channelId}`),
    ).resolves.toMatchObject([
      {
        externalId: 'video-123',
        title: 'Channel update',
        url: 'https://www.youtube.com/watch?v=video-123',
        summary: null,
        publishedAt: '2026-08-09T10:00:00.000Z',
      },
    ]);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'www.youtube.com',
        pathname: '/feeds/videos.xml',
        search: `?channel_id=${channelId}`,
      }),
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('resolves a handle before fetching its channel feed', async () => {
    resolver.resolve.mockResolvedValue({
      channelId,
      handle: 'contentos',
      canonicalUrl: `https://www.youtube.com/channel/${channelId}`,
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(atomFeed, { status: 200 }),
    );

    await adapter.fetchItems('https://youtube.com/@contentos');

    expect(resolver.resolve).toHaveBeenCalledWith(
      'https://youtube.com/@contentos',
    );
  });

  it('fails cleanly for a malformed or empty Atom feed', async () => {
    resolver.resolve.mockResolvedValue({ channelId });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<feed></feed>', { status: 200 }),
    );

    await expect(adapter.fetchItems('https://youtube.com/@contentos')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('fails cleanly when the feed upstream is unavailable', async () => {
    resolver.resolve.mockResolvedValue({ channelId });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 502 }),
    );

    await expect(adapter.fetchItems('https://youtube.com/@contentos')).rejects.toEqual(
      expect.objectContaining({ message: 'YouTube channel feed is unavailable' }),
    );
  });
});
