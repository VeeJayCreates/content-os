import { LocalEmbeddingProvider } from './local-embedding.provider';
import { LocalRerankingProvider } from './local-reranking.provider';

describe('local llama.cpp capability providers', () => {
  const fetchMock = jest.fn();
  const embeddingRoute = { task: 'semantic_embedding' as never, provider: 'local-qwen-embedding', model: 'Qwen3-Embedding-0.6B', capability: 'embedding' as never, timeoutMs: 30_000, costMode: 'zero' as const, fallback: null };
  const rerankRoute = { task: 'semantic_reranking' as never, provider: 'local-bge-reranker', model: 'bge-reranker-v2-m3', capability: 'reranking' as never, timeoutMs: 30_000, costMode: 'zero' as const, fallback: null };

  beforeEach(() => { jest.resetAllMocks(); global.fetch = fetchMock; });

  it('accepts a 1024-dimensional embedding batch and restores original input order', async () => {
    const first = Array.from({ length: 1024 }, () => 0.1);
    const second = Array.from({ length: 1024 }, () => 0.2);
    fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers(), json: async () => ({ data: [{ index: 1, embedding: second }, { index: 0, embedding: first }], usage: { prompt_tokens: 3, total_tokens: 3 } }) });
    const result = await new LocalEmbeddingProvider().embed({ task: 'semantic_embedding' as never, projectId: 'project-1', texts: ['first', 'second'], route: embeddingRoute });
    expect(result.dimensions).toBe(1024);
    expect(result.embeddings).toEqual([first, second]);
    expect(result.usage.inputTokens).toBe(3);
  });

  it.each([
    [{ data: [{ index: 0, embedding: [1] }, { index: 1, embedding: [1, 2] }] }],
    [{ data: [{ index: 0, embedding: [Number.NaN] }, { index: 1, embedding: [1] }] }],
  ])('rejects malformed embedding vectors', async (body) => {
    fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers(), json: async () => body });
    await expect(new LocalEmbeddingProvider().embed({ task: 'semantic_embedding' as never, projectId: null, texts: ['a', 'b'], route: embeddingRoute })).rejects.toMatchObject({ category: 'malformed_response' });
  });

  it('preserves negative rerank scores with deterministic ordering', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers(), json: async () => ({ results: [{ index: 1, relevance_score: -2.9 }, { index: 0, relevance_score: 0.5 }] }) });
    await expect(new LocalRerankingProvider().rerank({ task: 'semantic_reranking' as never, projectId: null, query: 'alliance', documents: ['same alliance', 'generic Pakistan'], route: rerankRoute })).resolves.toMatchObject({ results: [{ index: 0, relevanceScore: 0.5 }, { index: 1, relevanceScore: -2.9 }] });
  });

  it.each([
    [{ results: [{ index: 0, relevance_score: 1 }, { index: 0, relevance_score: 0 }] }],
    [{ results: [{ index: 0, relevance_score: 1 }, { index: 3, relevance_score: 0 }] }],
    [{ results: [{ index: 0, relevance_score: 1 }, { index: 1, relevance_score: Number.POSITIVE_INFINITY }] }],
  ])('rejects invalid rerank indexes and scores', async (body) => {
    fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers(), json: async () => body });
    await expect(new LocalRerankingProvider().rerank({ task: 'semantic_reranking' as never, projectId: null, query: 'query', documents: ['a', 'b'], route: rerankRoute })).rejects.toMatchObject({ category: 'malformed_response' });
  });

  it('returns controlled network failures without leaking endpoint configuration', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connection refused'));
    await expect(new LocalEmbeddingProvider().embed({ task: 'semantic_embedding' as never, projectId: null, texts: ['source'], route: embeddingRoute })).rejects.toMatchObject({ category: 'network' });
  });
});
