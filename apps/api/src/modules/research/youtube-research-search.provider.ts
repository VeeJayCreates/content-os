import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  ExternalResearchSearchProvider,
  ExternalResearchSearchResult,
} from './external-research-discovery.types';

const execFileAsync = promisify(execFile);

type YtDlpSearchResult = {
  id?: string;
  title?: string;
  url?: string;
  webpage_url?: string;
  channel?: string;
  channel_id?: string;
};

@Injectable()
export class YouTubeResearchSearchProvider
  implements ExternalResearchSearchProvider
{
  async search(input: {
    query: string;
    maxResults: number;
  }): Promise<ExternalResearchSearchResult[]> {
    const maxResults = Math.max(1, Math.min(input.maxResults, 10));

    const { stdout } = await execFileAsync(
      'yt-dlp',
      [
        `ytsearch${maxResults}:${input.query}`,
        '--flat-playlist',
        '--dump-json',
        '--no-warnings',
      ],
      {
        windowsHide: true,
        timeout: 20_000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );

    const results: ExternalResearchSearchResult[] = [];
    const seenVideos = new Set<string>();
    const seenChannels = new Set<string>();

    for (const line of stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;

      let item: YtDlpSearchResult;

      try {
        item = JSON.parse(line) as YtDlpSearchResult;
      } catch {
        continue;
      }

      const id = item.id?.trim();
      const title = item.title?.trim();
      const channelId = item.channel_id?.trim();

      if (!id || !title) continue;
      if (seenVideos.has(id)) continue;

      // One result per publisher/channel prevents multiple videos from the
      // same YouTube channel being treated as independent evidence sources.
      if (channelId && seenChannels.has(channelId)) continue;

      seenVideos.add(id);

      if (channelId) {
        seenChannels.add(channelId);
      }

      results.push({
        title,
        url: `https://www.youtube.com/watch?v=${id}`,
        snippet: item.channel
          ? `YouTube video published by ${item.channel}`
          : null,
        publishedAt: null,

        publisherId: channelId ?? null,
        publisherName: item.channel?.trim() ?? null,
        publisherUrl: channelId
          ? `https://www.youtube.com/channel/${channelId}`
          : null,
      });
    }

    return results.slice(0, maxResults);
  }
}