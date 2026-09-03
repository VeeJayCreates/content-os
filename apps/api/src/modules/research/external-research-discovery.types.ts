export type ExternalResearchSearchResult = {
  title: string;
  url: string;
  snippet?: string | null;
  publishedAt?: string | null;

  publisherId?: string | null;
  publisherName?: string | null;
  publisherUrl?: string | null;
};

export interface ExternalResearchSearchProvider {
  search(input: {
    query: string;
    maxResults: number;
  }): Promise<ExternalResearchSearchResult[]>;
}

/** Deliberately safe transport diagnostics: never retain provider output. */
export type ExternalResearchSearchFailureCategory =
  | 'local_network_permission_denied'
  | 'executable_unavailable'
  | 'timeout'
  | 'transport_unavailable';

export class ExternalResearchSearchError extends Error {
  constructor(readonly category: ExternalResearchSearchFailureCategory) {
    super(`External research search failed: ${category}`);
    this.name = 'ExternalResearchSearchError';
  }
}
