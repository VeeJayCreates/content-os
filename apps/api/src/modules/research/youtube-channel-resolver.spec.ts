import { BadRequestException } from '@nestjs/common';

import { YouTubeChannelResolver } from './youtube-channel-resolver';

const channelId = 'UCabcdefghijklmnopqrstuv';

describe('YouTubeChannelResolver', () => {
  const resolver = new YouTubeChannelResolver();

  afterEach(() => jest.restoreAllMocks());

  it.each([
    'https://www.youtube.com/@contentos',
    'https://youtube.com/@contentos',
    `https://www.youtube.com/channel/${channelId}`,
  ])('accepts a channel-specific YouTube URL: %s', (url) => {
    expect(resolver.validate(url)).toBeInstanceOf(URL);
  });

  it.each([
    'https://youtube.com',
    'https://www.youtube.com/',
    'https://youtube.com/watch?v=video',
    'https://youtube.com/playlist?list=playlist',
    'https://youtube.com/shorts/video',
    'http://youtube.com/@contentos',
    'https://example.com/@contentos',
    'not a url',
  ])('rejects unsupported YouTube URL shapes: %s', (url) => {
    expect(() => resolver.validate(url)).toThrow(BadRequestException);
  });

  it('normalizes a direct channel URL without a network request', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    await expect(
      resolver.resolve(`https://youtube.com/channel/${channelId}`),
    ).resolves.toEqual({
      channelId,
      handle: null,
      canonicalUrl: `https://www.youtube.com/channel/${channelId}`,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves a handle from a channelId JSON marker', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`<script>{"channelId":"${channelId}"}</script>`, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(resolver.resolve('https://youtube.com/@contentos')).resolves.toEqual({
      channelId,
      handle: 'contentos',
      canonicalUrl: `https://www.youtube.com/channel/${channelId}`,
    });
  });

  it('resolves a handle from a browseId JSON marker', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`<script>{"browseId":"${channelId}"}</script>`, {
        status: 200,
      }),
    );

    await expect(resolver.resolve('https://youtube.com/@contentos')).resolves.toMatchObject({
      channelId,
    });
  });

  it('resolves a handle from a canonical channel URL', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        `<link rel="canonical" href="https://www.youtube.com/channel/${channelId}">`,
        { status: 200 },
      ),
    );

    await expect(resolver.resolve('https://youtube.com/@contentos')).resolves.toMatchObject({
      channelId,
    });
  });

  it('rejects pages without a valid channel ID', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        '<script>{"browseId":"not-a-youtube-channel"}</script>',
        { status: 200 },
      ),
    );

    await expect(resolver.resolve('https://youtube.com/@contentos')).rejects.toEqual(
      expect.objectContaining({
        message: 'YouTube channel ID could not be resolved',
      }),
    );
  });

  it('returns a controlled error when the channel page cannot be resolved', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network failure'));

    await expect(resolver.resolve('https://youtube.com/@contentos')).rejects.toEqual(
      expect.objectContaining({
        message: 'YouTube channel could not be resolved',
      }),
    );
  });
});
