import { BadRequestException, Injectable, Logger } from '@nestjs/common';

const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com']);
const MAX_RESPONSE_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 10_000;
const RESERVED_ROOT_PATHS = new Set([
  'watch',
  'playlist',
  'shorts',
  'channel',
  'c',
  'user',
  'feed',
  'results',
]);

type ChannelUrlForm = 'handle' | 'channel' | 'custom' | 'user' | 'legacy';

interface ChannelPath {
  form: ChannelUrlForm;
  value: string;
}

export interface YouTubeChannelIdentity {
  channelId: string;
  handle: string | null;
  channelName: string;
  canonicalUrl: string;
}

interface ChannelPageMetadata {
  channelId: string | null;
  channelName: string | null;
}

@Injectable()
export class YouTubeChannelResolver {
  private readonly logger = new Logger(YouTubeChannelResolver.name);

  validate(value: string): URL {
    let url: URL;

    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException('YouTube channel URL is invalid');
    }

    if (
      url.protocol !== 'https:' ||
      !YOUTUBE_HOSTS.has(url.hostname.toLowerCase()) ||
      url.search ||
      url.hash ||
      !this.channelPath(url)
    ) {
      throw new BadRequestException(
        'YouTube source must identify a specific channel',
      );
    }

    return url;
  }

  async resolve(value: string): Promise<YouTubeChannelIdentity> {
    const url = this.validate(value);
    const path = this.channelPath(url);
    if (!path) {
      throw new BadRequestException('YouTube source must identify a specific channel');
    }

    if (path.form === 'channel') {
      return {
        channelId: path.value,
        handle: null,
        channelName: path.value,
        canonicalUrl: this.toCanonicalUrl(path.value),
      };
    }

    const metadata = await this.fetchChannelMetadata(url, path.form);
    if (!metadata.channelId) {
      this.logFailure(url, path.form, 'identity_marker_missing');
      throw new BadRequestException('YouTube channel ID could not be resolved');
    }

    return {
      channelId: metadata.channelId,
      handle: path.form === 'handle' ? path.value : null,
      channelName: metadata.channelName ?? this.fallbackName(path),
      canonicalUrl: this.toCanonicalUrl(metadata.channelId),
    };
  }

  private channelPath(url: URL): ChannelPath | null {
    const path = url.pathname.replace(/\/+$/, '');
    const channel = /^\/channel\/(UC[\w-]{20,})$/i.exec(path);
    if (channel?.[1]) return { form: 'channel', value: channel[1] };

    const handle = /^\/@([\w.-]+)$/i.exec(path);
    if (handle?.[1]) return { form: 'handle', value: handle[1] };

    const custom = /^\/c\/([\w.-]+)$/i.exec(path);
    if (custom?.[1]) return { form: 'custom', value: custom[1] };

    const user = /^\/user\/([\w.-]+)$/i.exec(path);
    if (user?.[1]) return { form: 'user', value: user[1] };

    const legacy = /^\/([\w.-]+)$/i.exec(path);
    if (legacy?.[1] && !RESERVED_ROOT_PATHS.has(legacy[1].toLowerCase())) {
      return { form: 'legacy', value: legacy[1] };
    }

    return null;
  }

  private async fetchChannelMetadata(
    url: URL,
    form: ChannelUrlForm,
  ): Promise<ChannelPageMetadata> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          Accept: 'text/html',
          'User-Agent': 'Mozilla/5.0 (compatible; ContentOS/1.0)',
        },
      });

      if (!response.ok) {
        this.logFailure(url, form, 'http_status', response.status);
        throw new BadRequestException('YouTube channel could not be resolved');
      }

      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        this.logFailure(url, form, 'response_too_large');
        throw new BadRequestException('YouTube channel response is too large');
      }

      return await this.readChannelMetadata(response, url, form);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logFailure(
        url,
        form,
        error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network',
      );
      throw new BadRequestException('YouTube channel could not be resolved');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readChannelMetadata(
    response: Response,
    url: URL,
    form: ChannelUrlForm,
  ): Promise<ChannelPageMetadata> {
    if (!response.body) {
      this.logFailure(url, form, 'empty_response');
      throw new BadRequestException('YouTube channel response was empty');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytesRead = 0;
    let text = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        bytesRead += value.byteLength;
        if (bytesRead > MAX_RESPONSE_BYTES) {
          this.logFailure(url, form, 'response_too_large');
          throw new BadRequestException('YouTube channel response is too large');
        }

        text += decoder.decode(value, { stream: true });
        const metadata = this.extractPageMetadata(text);
        if (metadata.channelId) {
          await reader.cancel();
          return metadata;
        }
      }

      return this.extractPageMetadata(text + decoder.decode());
    } finally {
      reader.releaseLock();
    }
  }

  private extractPageMetadata(html: string): ChannelPageMetadata {
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
        return { channelId, channelName: this.extractChannelName(html) };
      }
    }

    return { channelId: null, channelName: this.extractChannelName(html) };
  }

  private extractChannelName(html: string): string | null {
    const ogTitle = /<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1]
      ?? /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:title["']/i.exec(html)?.[1];
    const pageTitle = /<title>([^<]+)<\/title>/i.exec(html)?.[1];
    const title = ogTitle ?? pageTitle;
    if (!title) return null;

    const normalized = title
      .replace(/&amp;/gi, '&')
      .replace(/\s*[-|]\s*YouTube\s*$/i, '')
      .trim();
    return normalized || null;
  }

  private fallbackName(path: ChannelPath): string {
    if (path.form === 'handle') return `@${path.value}`;
    return path.value;
  }

  private logFailure(
    url: URL,
    form: ChannelUrlForm,
    category: string,
    status?: number,
  ) {
    this.logger.warn(
      JSON.stringify({
        event: 'youtube_channel_resolution_failed',
        urlForm: form,
        host: url.hostname,
        status,
        category,
      }),
    );
  }

  private toCanonicalUrl(channelId: string): string {
    return `https://www.youtube.com/channel/${channelId}`;
  }
}
