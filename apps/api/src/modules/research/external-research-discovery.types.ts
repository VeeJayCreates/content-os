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