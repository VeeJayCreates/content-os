import { Inject, Injectable } from '@nestjs/common';
import {
  ResearchSourceRole,
  ResearchSourceType,
} from '@content-os/contracts';
import {
  ResearchSourceRepository,
  SignalRepository,
} from '@content-os/storage';

import {
  EXTERNAL_RESEARCH_SEARCH_PROVIDER,
} from './external-research-discovery.tokens';
import type {
  ExternalResearchSearchProvider,
  ExternalResearchSearchResult,
} from './external-research-discovery.types';

const MAX_QUERIES = 3;
const MAX_RESULTS_PER_QUERY = 6;
const MAX_ACCEPTED_RESULTS = 5;

@Injectable()
export class ExternalResearchDiscoveryService {
  constructor(
    private readonly sources: ResearchSourceRepository,
    private readonly signals: SignalRepository,
    @Inject(EXTERNAL_RESEARCH_SEARCH_PROVIDER)
    private readonly searchProvider: ExternalResearchSearchProvider,
  ) {}

  async discover(input: {
    projectId: string;
    queries: string[];
  }) {
    const queries = [...new Set(input.queries.map((q) => q.trim()).filter(Boolean))]
      .slice(0, MAX_QUERIES);

    const seenUrls = new Set<string>();
    const accepted: Array<{
      sourceId: string;
      signalId?: string;
      url: string;
      title: string;
    }> = [];

    for (const query of queries) {
      if (accepted.length >= MAX_ACCEPTED_RESULTS) break;

      const results = await this.searchProvider.search({
        query,
        maxResults: MAX_RESULTS_PER_QUERY,
      });

      for (const result of results) {
        if (accepted.length >= MAX_ACCEPTED_RESULTS) break;

        const normalized = this.normalizeResult(result);
        if (!normalized || seenUrls.has(normalized.url)) continue;

        seenUrls.add(normalized.url);

        const publisher =
          normalized.publisherId &&
          normalized.publisherName &&
          normalized.publisherUrl
            ? {
                id: normalized.publisherId,
                name: normalized.publisherName,
                baseUrl: normalized.publisherUrl,
              }
            : this.publisherFor(normalized.url);

        if (!publisher) continue;

        let source = await this.sources.findByProjectAndUrl(
          input.projectId,
          publisher.baseUrl,
        );

        const sourceType = normalized.publisherId
          ? ResearchSourceType.YOUTUBE
          : ResearchSourceType.WEBSITE;

        
        if (!source) {
          source = await this.sources.create({
            projectId: input.projectId,
            name: publisher.name,
            sourceType,
            role: ResearchSourceRole.VERIFICATION,
            url: publisher.baseUrl,
            enabled: true,
          });
        }

        const outcome = await this.signals.create({
          projectId: input.projectId,
          researchSourceId: source.id,
          sourceType,
          externalId: normalized.url,
          title: normalized.title,
          url: normalized.url,
          summary: normalized.snippet ?? null,
          publishedAt: normalized.publishedAt ?? null,
          discoveredAt: new Date().toISOString(),
        });

        if (outcome === 'created' || outcome === 'duplicate') {
          accepted.push({
            sourceId: source.id,
            url: normalized.url,
            title: normalized.title,
          });
        }
      }
    }

    return {
      queriesPlanned: queries.length,
      acceptedResults: accepted.length,
      results: accepted,
    };
  }

  private normalizeResult(
    result: ExternalResearchSearchResult,
  ): ExternalResearchSearchResult | null {
    const title = result.title.trim();
    if (!title) return null;

    let url: URL;
    try {
      url = new URL(result.url);
    } catch {
      return null;
    }

    if (!['http:', 'https:'].includes(url.protocol)) return null;

    url.hash = '';

    return {
      ...result,
      title,
      url: url.toString(),
    };
  }

  private publisherFor(value: string): {
      id?: string;
      name: string;
      baseUrl: string;
    } | null {
    try {
      const url = new URL(value);
      const hostname = url.hostname.replace(/^www\./, '');
      const name = hostname.split('.')[0];

      if (!name) return null;

      return {
        name,
        baseUrl: `${url.protocol}//${url.hostname}`,
      };
    } catch {
      return null;
    }
  }
}