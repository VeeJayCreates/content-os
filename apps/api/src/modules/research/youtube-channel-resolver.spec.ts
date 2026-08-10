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
    'https://www.youtube.com/c/contentos',
    'https://www.youtube.com/user/contentos',
    'https://www.youtube.com/DefenceSquad',
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
      channelName: channelId,
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
      channelName: '@contentos',
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

  it('returns channel identity and a human-readable name from og:title', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        `<meta property="og:title" content="World Affairs by Unacademy"><script>{"browseId":"${channelId}"}</script>`,
        { status: 200 },
      ),
    );

    await expect(
      resolver.resolve('https://www.youtube.com/@WorldAffairsUnacademy'),
    ).resolves.toEqual({
      channelId,
      handle: 'WorldAffairsUnacademy',
      channelName: 'World Affairs by Unacademy',
      canonicalUrl: `https://www.youtube.com/channel/${channelId}`,
    });
  });

  it('uses a cleaned page title when og:title is absent', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`<title>Defence Squad - YouTube</title><script>{"browseId":"${channelId}"}</script>`, {
        status: 200,
      }),
    );

    await expect(
      resolver.resolve('https://www.youtube.com/DefenceSquad'),
    ).resolves.toMatchObject({ channelName: 'Defence Squad' });
  });

  it('falls back to the handle, then channel ID, when page title metadata is absent', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`<script>{"browseId":"${channelId}"}</script>`, {
        status: 200,
      }),
    );

    await expect(resolver.resolve('https://youtube.com/@contentos')).resolves.toMatchObject({
      channelName: '@contentos',
    });
    await expect(
      resolver.resolve(`https://youtube.com/channel/${channelId}`),
    ).resolves.toMatchObject({ channelName: channelId });
  });

  it.each([
    ['https://www.youtube.com/@WorldAffairsUnacademy', 'handle'],
    ['https://www.youtube.com/@ORFOnline', 'handle'],
    ['https://www.youtube.com/c/contentos', 'custom'],
    ['https://www.youtube.com/user/contentos', 'user'],
    ['https://www.youtube.com/DefenceSquad', 'legacy'],
  ])('resolves a valid %s channel form from a current browseId marker', async (url) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`<script>{"browseId":"${channelId}"}</script>`, {
        status: 200,
      }),
    );

    await expect(resolver.resolve(url)).resolves.toMatchObject({
      channelId,
      canonicalUrl: `https://www.youtube.com/channel/${channelId}`,
    });
  });

  it('extracts a channel ID before a later oversized response body is read', async () => {
    const marker = `<script>{"browseId":"${channelId}"}</script>`;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(marker));
        controller.enqueue(new Uint8Array(1_000_001));
        controller.close();
      },
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, { status: 200 }),
    );

    await expect(
      resolver.resolve('https://www.youtube.com/@WorldAffairsUnacademy'),
    ).resolves.toMatchObject({ channelId });
  });

  it('returns the same canonical identity for equivalent channel URL forms', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(`<script>{"externalId":"${channelId}"}</script>`, {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(`<script>{"externalId":"${channelId}"}</script>`, {
          status: 200,
        }),
      );

    const [handle, custom] = await Promise.all([
      resolver.resolve('https://www.youtube.com/@contentos'),
      resolver.resolve('https://www.youtube.com/c/contentos'),
    ]);
    expect(handle.canonicalUrl).toBe(custom.canonicalUrl);
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
