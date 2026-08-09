import { BadRequestException, Injectable } from '@nestjs/common';

const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com']);
const MAX_RESPONSE_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface YouTubeChannelIdentity {
  channelId: string;
  handle: string | null;
  canonicalUrl: string;
}

@Injectable()
export class YouTubeChannelResolver {
  validate(value: string): URL {
    let url: URL;

    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException('YouTube channel URL is invalid');
    }

    const isSupportedHost = YOUTUBE_HOSTS.has(url.hostname.toLowerCase());
    const isHandle = /^\/@[\w.-]+\/?$/i.test(url.pathname);
    const isChannel = /^\/channel\/UC[\w-]{20,}\/?$/i.test(url.pathname);

    if (
      url.protocol !== 'https:' ||
      !isSupportedHost ||
      url.search ||
      url.hash ||
      (!isHandle && !isChannel)
    ) {
      throw new BadRequestException(
        'YouTube source must identify a channel using /@handle or /channel/<channelId>',
      );
    }

    return url;
  }

  async resolve(value: string): Promise<YouTubeChannelIdentity> {
    const url = this.validate(value);
    const channelMatch = /^\/channel\/(UC[\w-]{20,})\/?$/i.exec(url.pathname);
    const channelId = channelMatch?.[1];

    if (channelId) {
      return {
        channelId,
        handle: null,
        canonicalUrl: this.toCanonicalUrl(channelId),
      };
    }

    const handleMatch = /^\/@([\w.-]+)\/?$/i.exec(url.pathname);
    const handle = handleMatch?.[1];

    if (!handle) {
      throw new BadRequestException('YouTube source must identify a specific channel');
    }

    const html = await this.fetchChannelPage(handle);
    const resolvedChannelId = this.extractChannelId(html);

    if (!resolvedChannelId) {
      throw new BadRequestException('YouTube channel ID could not be resolved');
    }

    return {
      channelId: resolvedChannelId,
      handle,
      canonicalUrl: this.toCanonicalUrl(resolvedChannelId),
    };
  }

  private async fetchChannelPage(handle: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`https://www.youtube.com/@${handle}`, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { Accept: 'text/html' },
      });

      if (!response.ok) {
        throw new BadRequestException('YouTube channel could not be resolved');
      }

      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        throw new BadRequestException('YouTube channel response is too large');
      }

      return this.readResponseBody(response);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('YouTube channel could not be resolved');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readResponseBody(response: Response): Promise<string> {
    if (!response.body) {
      throw new BadRequestException('YouTube channel response was empty');
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
          throw new BadRequestException('YouTube channel response is too large');
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

  private extractChannelId(html: string): string | null {
    const patterns = [
      /"channelId"\s*:\s*"(UC[\w-]{20,})"/,
      /"browseId"\s*:\s*"(UC[\w-]{20,})"/,
      /"externalId"\s*:\s*"(UC[\w-]{20,})"/,
      /<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["'][^"']*\/channel\/(UC[\w-]{20,})[^"']*["']/i,
      /<link\b[^>]*\bhref=["'][^"']*\/channel\/(UC[\w-]{20,})[^"']*["'][^>]*\brel=["']canonical["']/i,
      /https?:\\?\/\\?(?:www\.)?youtube\.com\\?\/channel\\?\/(UC[\w-]{20,})/i,
    ];

    for (const pattern of patterns) {
      const channelId = pattern.exec(html)?.[1];
      if (channelId) {
        return channelId;
      }
    }

    return null;
  }

  private toCanonicalUrl(channelId: string): string {
    return `https://www.youtube.com/channel/${channelId}`;
  }
}
