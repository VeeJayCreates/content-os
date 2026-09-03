import { BadRequestException, Injectable } from '@nestjs/common';

import type { IngestionItem } from './ingestion.service';
import { YouTubeChannelResolver } from './youtube-channel-resolver';

const MAX_RESPONSE_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com']);

@Injectable()
export class YouTubeIngestionAdapter {
  constructor(private readonly channelResolver: YouTubeChannelResolver) {}

  async fetchItems(sourceUrl: string, recentUploadLimit = 50): Promise<IngestionItem[]> {
    const channel = await this.channelResolver.resolve(sourceUrl);
    const feedUrl = new URL('https://www.youtube.com/feeds/videos.xml');
    feedUrl.searchParams.set('channel_id', channel.channelId);
    const xml = await this.fetchFeed(feedUrl);

    return this.parseFeed(xml, recentUploadLimit);
  }

  private async fetchFeed(url: URL): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await this.fetchWithRedirectValidation(url, controller.signal);

      if (!response.ok) {
        throw new BadRequestException('YouTube channel feed is unavailable');
      }

      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        throw new BadRequestException('YouTube channel feed is too large');
      }

      return this.readResponseBody(response);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Unable to fetch the YouTube channel feed');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchWithRedirectValidation(
    url: URL,
    signal: AbortSignal,
    redirects = 0,
  ): Promise<Response> {
    this.assertTrustedFeedUrl(url);
    const response = await fetch(url, {
      signal,
      redirect: 'manual',
      headers: { Accept: 'application/atom+xml, application/xml' },
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    if (redirects >= MAX_REDIRECTS) {
      throw new BadRequestException('Too many YouTube channel feed redirects');
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new BadRequestException('YouTube channel feed redirect is invalid');
    }

    return this.fetchWithRedirectValidation(
      new URL(location, url),
      signal,
      redirects + 1,
    );
  }

  private assertTrustedFeedUrl(url: URL) {
    if (url.protocol !== 'https:' || !YOUTUBE_HOSTS.has(url.hostname)) {
      throw new BadRequestException('YouTube channel feed redirect is not permitted');
    }
  }

  private async readResponseBody(response: Response): Promise<string> {
    if (!response.body) {
      throw new BadRequestException('YouTube channel feed response was empty');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytesRead = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        bytesRead += value.byteLength;
        if (bytesRead > MAX_RESPONSE_BYTES) {
          throw new BadRequestException('YouTube channel feed is too large');
        }

        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const body = new Uint8Array(bytesRead);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new TextDecoder().decode(body);
  }

  private parseFeed(xml: string, recentUploadLimit: number): IngestionItem[] {
    const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];

    if (entries.length === 0) {
      throw new BadRequestException('YouTube channel feed did not contain video entries');
    }

    const items = entries
      .slice(0, Math.max(1, Math.min(recentUploadLimit, 50)))
      .map((entry) => this.toVideoItem(entry))
      .filter((item): item is IngestionItem => item !== null);

    if (items.length === 0) {
      throw new BadRequestException('YouTube channel feed did not contain valid videos');
    }

    return items;
  }

  private toVideoItem(entry: string): IngestionItem | null {
    const videoId = this.tag(entry, 'yt:videoId');
    const title = this.tag(entry, 'title');
    const publishedAt = this.tag(entry, 'published') ?? this.tag(entry, 'updated');

    if (!videoId || !title || !publishedAt || Number.isNaN(Date.parse(publishedAt))) {
      return null;
    }

    return {
      externalId: videoId,
      title,
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      summary: null,
      publishedAt: new Date(publishedAt).toISOString(),
    };
  }

  private tag(value: string, tag: string): string | null {
    const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(
      value,
    );

    return (
      match?.[1]
        ?.replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/<[^>]+>/g, '')
        .trim() ?? null
    );
  }
}
