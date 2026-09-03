jest.mock('@content-os/contracts', () => ({ AiTask: { SEMANTIC_EMBEDDING: 'semantic_embedding', SEMANTIC_RERANKING: 'semantic_reranking' } }));
jest.mock('@content-os/storage', () => ({ AiExecutionRepository: class AiExecutionRepository {} }));

import { extractTopicCandidates, extractTopicCandidatesWithDiagnostics } from './topic-candidate-extraction';
import { formClusters, retrieveNeighbors, type SemanticCandidate } from './semantic-topic-clustering';
import { SemanticTopicClusteringService } from './semantic-topic-clustering.service';

const candidate = (id: string, text: string, vector: number[], projectId = 'project-1'): SemanticCandidate => ({ id, projectId, text, normalizedText: text.toLowerCase(), embedding: vector });
const embeddingCache = () => ({ findMany: jest.fn(async () => new Map<string, number[]>()), upsertMany: jest.fn(async () => undefined) });

describe('Semantic Topic Clustering V2', () => {
  it('extracts multiple meaningful candidates only from explicit update lists', () => {
    expect(extractTopicCandidates('Defence Updates - Japan F-2 Fighter Jet In India, India-France 6th Gen Jet, IAF Officer Honey Trap').map((candidate) => candidate.text)).toEqual(['Japan F-2 Fighter Jet In India', 'India-France 6th Gen Jet', 'IAF Officer Honey Trap']);
    expect(extractTopicCandidates('India-France sixth-generation fighter programme update').map((candidate) => candidate.text)).toEqual(['India-France sixth-generation fighter programme update']);
  });

  it('rejects attribution, branding, and generic explanatory fragments before embedding', () => {
    const fixtures = [
      ['By Ankit Sir', 'attribution'],
      ['By Prashant Dhawan', 'attribution'],
      ['Major Gaurav Arya', 'attribution'],
      ['Abhijit Chavda Hindi #shorts', 'branding'],
      ['The Chanakya Dialogues Major Gaurav Arya', 'branding'],
      ['Geography Explained', 'generic_explanation'],
      ['Plate Tectonic, Geography Explained', 'generic_explanation'],
      ['What It Means for the Region', 'generic_explanation'],
      ['By An Unknown Creator', 'attribution'],
      ['Future World Affairs Podcast', 'branding'],
    ] as const;
    for (const [fragment, category] of fixtures) {
      const result = extractTopicCandidatesWithDiagnostics(fragment);
      expect(result.candidates).toEqual([]);
      expect(result.rejected).toEqual([{ text: fragment, category }]);
    }
  });

  it('keeps event propositions while excluding a pipe-separated creator attribution', () => {
    const result = extractTopicCandidates('India-France FCAS sixth-generation fighter programme | India buys Rafale fighters | By An Unknown Creator');
    expect(result.map((candidate) => candidate.text)).toEqual([
      'India-France FCAS sixth-generation fighter programme',
      'India buys Rafale fighters',
    ]);
  });

  it.each([
    'Saudi–Turkey–Pakistan defence pact signed',
    'India tests Agni-6 missile',
    'India exports BrahMos missile',
    'Japan earthquake response',
    'Europe wildfire emergency',
    'India–Myanmar land swap under discussion',
    'AMCA full scale testing',
    'China deploys DF-17 hypersonic missiles',
    'Trump announces new Iran policy',
    'Pakistan signs a regional agreement',
    'India counters China over official Arunachal map',
  ])('keeps legitimate story proposition: %s', (title) => {
    expect(extractTopicCandidates(title).map((candidate) => candidate.text)).toEqual([title]);
  });

  it('retrieves a bounded, project-isolated neighbor set', () => {
    const entries = Array.from({ length: 12 }, (_, index) => candidate(String(index), `FCAS event ${index}`, [1, 0]));
    const foreign = candidate('foreign', 'FCAS foreign', [1, 0], 'project-2');
    expect(retrieveNeighbors([...entries, foreign]).get('0')).toHaveLength(8);
    expect(retrieveNeighbors([...entries, foreign]).get('0')?.some((entry) => entry.id === 'foreign')).toBe(false);
  });

  it('clusters FCAS, Trump/Iran, and Saudi pact paraphrases but rejects event conflicts', () => {
    const fcas = candidate('fcas', 'India France FCAS sixth generation fighter programme', [1, 0]);
    const fcasTwo = candidate('fcas-two', 'India joins France sixth generation fighter project', [0.98, 0.02]);
    const rafale = candidate('rafale', 'India buys Rafale fighters France', [0.97, 0.03]);
    const agni = candidate('agni', 'India tests Agni 6 missile', [0, 1]);
    const brahmos = candidate('brahmos', 'India exports BrahMos missile', [0, 0.99]);
    const clusters = formClusters([fcas, fcasTwo, rafale, agni, brahmos], [['fcas', 'fcas-two'], ['fcas', 'rafale'], ['agni', 'brahmos']]);
    expect(clusters.map((cluster) => cluster.candidateIds.sort())).toEqual(expect.arrayContaining([['fcas', 'fcas-two'], ['rafale'], ['agni'], ['brahmos']]));
  });

  it('prevents a weak A-B-C bridge from creating a megacluster', () => {
    const first = candidate('first', 'India France FCAS sixth generation programme', [1, 0]);
    const bridge = candidate('bridge', 'India France sixth generation fighter discussion', [0.9, 0.1]);
    const last = candidate('last', 'India buys Rafale fighters France', [0.8, 0.2]);
    const clusters = formClusters([first, bridge, last], [['first', 'bridge'], ['bridge', 'last']]);
    expect(clusters.some((cluster) => cluster.candidateIds.length === 3)).toBe(false);
  });

  it('uses one representative BGE request for a reciprocal provisional neighborhood', async () => {
    const runtime = {
      embed: jest.fn(async ({ texts }) => ({ embeddings: texts.map(() => [1, 0]), dimensions: 2, usage: {} })),
      rerank: jest.fn(async ({ documents }) => ({ results: documents.map((_: string, index: number) => ({ index, relevanceScore: 0.5 })), usage: {} })),
    };
    const service = new SemanticTopicClusteringService(runtime as never);
    await service.cluster([
      { id: 'a', projectId: 'project-1', text: 'FCAS India France programme', normalizedText: 'fcas india france programme' },
      { id: 'b', projectId: 'project-1', text: 'FCAS France India project', normalizedText: 'fcas france india project' },
      { id: 'c', projectId: 'project-1', text: 'FCAS joint fighter effort', normalizedText: 'fcas joint fighter effort' },
    ]);
    const metrics = service.lastExecutionMetrics();
    expect(metrics).toMatchObject({ retrievedNeighborPairs: 6, uniquePairsSentToBge: 3, reciprocalNeighborPairs: 3, provisionalNeighborhoods: 1, rerankProviderRequests: 1 });
    expect(runtime.rerank).toHaveBeenCalledTimes(1);
    expect(runtime.rerank).toHaveBeenCalledWith(expect.objectContaining({ documents: expect.any(Array) }));
    expect(runtime.rerank.mock.calls[0]?.[0].documents).toHaveLength(2);
  });

  it('does not send isolated candidates to BGE', async () => {
    const runtime = {
      embed: jest.fn(async ({ texts }) => ({ embeddings: texts.map((_: string, index: number) => index === 0 ? [1, 0] : [0, 1]), dimensions: 2, usage: {} })),
      rerank: jest.fn(async ({ documents }) => ({ results: documents.map((_: string, index: number) => ({ index, relevanceScore: 0.5 })), usage: {} })),
    };
    const service = new SemanticTopicClusteringService(runtime as never);
    const clusters = await service.cluster([
      { id: 'fcas', projectId: 'project-1', text: 'India France FCAS programme', normalizedText: 'india france fcas programme' },
      { id: 'earthquake', projectId: 'project-1', text: 'Japan earthquake response', normalizedText: 'japan earthquake response' },
    ]);
    expect(clusters).toHaveLength(2);
    expect(service.lastExecutionMetrics()).toMatchObject({ singletonCandidates: 2, projectedBgeRequests: 0, rerankProviderRequests: 0 });
    expect(runtime.rerank).not.toHaveBeenCalled();
  });

  it('embeds exact normalized duplicates once and restores vectors in candidate order', async () => {
    const runtime = {
      embed: jest.fn(async ({ texts }) => ({ embeddings: texts.map((text: string) => text === 'FCAS one' ? [1, 0] : [0, 1]), dimensions: 2, usage: {} })),
      rerank: jest.fn(),
    };
    const service = new SemanticTopicClusteringService(runtime as never);
    await service.plan([
      { id: 'first', projectId: 'project-1', text: 'FCAS one', normalizedText: 'fcas one' },
      { id: 'duplicate', projectId: 'project-1', text: 'FCAS one rewritten', normalizedText: 'fcas one' },
      { id: 'second', projectId: 'project-1', text: 'Japan earthquake', normalizedText: 'japan earthquake' },
    ]);
    expect(runtime.embed).toHaveBeenCalledWith(expect.objectContaining({ texts: ['FCAS one', 'Japan earthquake'] }));
    expect(service.lastExecutionMetrics()).toMatchObject({ candidateCount: 3, uniqueEmbeddingInputs: 2, duplicateEmbeddingInputs: 1, embeddingCacheHits: 1, embeddingProviderRequests: 1 });
    expect(runtime.rerank).not.toHaveBeenCalled();
  });

  it('uses a configured safe embedding batch size without changing mapping order', async () => {
    const previous = process.env.SEMANTIC_EMBEDDING_BATCH_SIZE;
    process.env.SEMANTIC_EMBEDDING_BATCH_SIZE = '1';
    try {
      const runtime = {
        embed: jest.fn(async ({ texts }) => ({ embeddings: texts.map((text: string) => text === 'first event' ? [1, 0] : [0, 1]), dimensions: 2, usage: {} })),
        rerank: jest.fn(),
      };
      const service = new SemanticTopicClusteringService(runtime as never);
      await service.cluster([
        { id: 'first', projectId: 'project-1', text: 'first event', normalizedText: 'first event' },
        { id: 'second', projectId: 'project-1', text: 'second event', normalizedText: 'second event' },
      ]);
      expect(runtime.embed).toHaveBeenCalledTimes(2);
      expect(service.lastExecutionMetrics()).toMatchObject({ embeddingBatchSize: 1, plannedEmbeddingBatches: 2, embeddingProviderRequests: 2 });
    } finally {
      if (previous === undefined) delete process.env.SEMANTIC_EMBEDDING_BATCH_SIZE;
      else process.env.SEMANTIC_EMBEDDING_BATCH_SIZE = previous;
    }
  });

  it('reuses persisted same-model vectors without a second provider call', async () => {
    const entries = new Map<string, number[]>();
    const cache = {
      findMany: jest.fn(async (_identity: unknown, hashes: string[]) => new Map(hashes.flatMap((hash) => {
        const vector = entries.get(hash);
        return vector ? [[hash, vector] as const] : [];
      }))),
      upsertMany: jest.fn(async (values: Array<{ candidateHash: string; vector: number[] }>) => values.forEach((value) => entries.set(value.candidateHash, value.vector))),
    };
    const runtime = { route: jest.fn(() => ({ provider: 'local-qwen-embedding', model: 'Qwen3-Embedding-0.6B' })), embed: jest.fn(async ({ texts }) => ({ embeddings: texts.map(() => [1, 0]), dimensions: 2, usage: {} })), rerank: jest.fn() };
    const inputs = [{ id: 'first', projectId: 'project-1', text: 'FCAS programme', normalizedText: 'fcas programme' }];
    await new SemanticTopicClusteringService(runtime as never, cache as never).plan(inputs);
    await new SemanticTopicClusteringService(runtime as never, cache as never).plan(inputs);
    expect(runtime.embed).toHaveBeenCalledTimes(1);
    expect(cache.upsertMany).toHaveBeenCalledTimes(1);
  });

  it('misses the persistent cache when the embedding model version changes', async () => {
    const cache = embeddingCache();
    const runtime = { route: jest.fn(() => ({ provider: 'local-qwen-embedding', model: 'Qwen3-Embedding-0.6B' })), embed: jest.fn(async ({ texts }) => ({ embeddings: texts.map(() => [1, 0]), dimensions: 2, usage: {} })), rerank: jest.fn() };
    const previous = process.env.AI_LOCAL_EMBEDDING_MODEL_VERSION;
    try {
      process.env.AI_LOCAL_EMBEDDING_MODEL_VERSION = 'v1';
      await new SemanticTopicClusteringService(runtime as never, cache as never).plan([{ id: 'first', projectId: 'project-1', text: 'FCAS programme', normalizedText: 'fcas programme' }]);
      process.env.AI_LOCAL_EMBEDDING_MODEL_VERSION = 'v2';
      await new SemanticTopicClusteringService(runtime as never, cache as never).plan([{ id: 'first', projectId: 'project-1', text: 'FCAS programme', normalizedText: 'fcas programme' }]);
      expect(cache.findMany.mock.calls[0]?.[0]).toMatchObject({ modelVersion: 'v1' });
      expect(cache.findMany.mock.calls[1]?.[0]).toMatchObject({ modelVersion: 'v2' });
      expect(runtime.embed).toHaveBeenCalledTimes(2);
    } finally {
      if (previous === undefined) delete process.env.AI_LOCAL_EMBEDDING_MODEL_VERSION;
      else process.env.AI_LOCAL_EMBEDDING_MODEL_VERSION = previous;
    }
  });

  it('enforces the BGE request budget and leaves unscheduled neighborhoods separate', async () => {
    const entries = Array.from({ length: 320 }, (_, index) => {
      const group = Math.floor(index / 2);
      const vector = Array.from({ length: 160 }, (_, dimension) => dimension === group ? 1 : 0);
      return { id: `candidate-${index.toString().padStart(3, '0')}`, projectId: 'project-1', text: `Event group${group} report ${index % 2}`, normalizedText: `event group${group} report ${index % 2}`, embedding: vector };
    });
    const runtime = {
      embed: jest.fn(async ({ texts }) => ({ embeddings: texts.map((text: string) => entries.find((entry) => entry.text === text)?.embedding ?? []), dimensions: 160, usage: {} })),
      rerank: jest.fn(async ({ documents }) => ({ results: documents.map((_: string, index: number) => ({ index, relevanceScore: 0.5 })), usage: {} })),
    };
    const service = new SemanticTopicClusteringService(runtime as never);
    const clusters = await service.cluster(entries.map(({ embedding: _, ...entry }) => entry));
    expect(runtime.rerank).toHaveBeenCalledTimes(48);
    expect(service.lastExecutionMetrics()).toMatchObject({ provisionalNeighborhoods: 160, projectedBgeRequests: 48, budgetExhaustedRequests: 112 });
    expect(clusters.filter((cluster) => cluster.candidateIds.length === 1)).toHaveLength(224);
  });

  it('skips deterministic conflict pairs before BGE', async () => {
    const runtime = {
      embed: jest.fn(async ({ texts }) => ({ embeddings: texts.map(() => [1, 0]), dimensions: 2, usage: {} })),
      rerank: jest.fn(),
    };
    const service = new SemanticTopicClusteringService(runtime as never);
    await service.cluster([
      { id: 'fcas', projectId: 'project-1', text: 'India France FCAS programme', normalizedText: 'india france fcas programme' },
      { id: 'rafale', projectId: 'project-1', text: 'India Rafale procurement', normalizedText: 'india rafale procurement' },
    ]);
    expect(service.lastExecutionMetrics()).toMatchObject({ preRerankGuardRejections: 2, rerankProviderRequests: 0 });
    expect(runtime.rerank).not.toHaveBeenCalled();
  });

  it('finds the best Javelin topic from multiple semantically related existing topics', async () => {
    const vectors: Record<string, number[]> = {
      'India places order for US Javelin missiles': [1, 0],
      'Why is India buying US Javelin Missiles': [0.98, 0.02],
      'India signs Javelin missile deal with US': [0.96, 0.04],
      'India joins GCAP programme': [0.2, 0.98],
      'What is Rafale F4.3?': [0.1, 0.99],
    };

    const runtime = {
      route: jest.fn(() => ({
        provider: 'local-qwen-embedding',
        model: 'Qwen3-Embedding-0.6B',
      })),
      embed: jest.fn(async ({ texts }) => ({
        embeddings: texts.map((text: string) => vectors[text] ?? [0, 1]),
        dimensions: 2,
        usage: {},
      })),
      rerank: jest.fn(async ({ documents }) => ({
        results: documents.map((document: string, index: number) => ({
          index,
          relevanceScore:
            document === 'India signs Javelin missile deal with US'
              ? 0.91
              : document === 'Why is India buying US Javelin Missiles'
                ? 0.82
                : 0.05,
        })),
        usage: {},
      })),
    };

    const service = new SemanticTopicClusteringService(
      runtime as never,
      embeddingCache() as never,
    );

    const result = await service.findBestMatch(
      {
        id: 'incoming',
        projectId: 'project-1',
        text: 'India places order for US Javelin missiles',
        normalizedText: 'india places order for us javelin missiles',
      },
      [
        {
          id: 'javelin-buy',
          projectId: 'project-1',
          text: 'Why is India buying US Javelin Missiles',
          normalizedText: 'why is india buying us javelin missiles',
        },
        {
          id: 'javelin-deal',
          projectId: 'project-1',
          text: 'India signs Javelin missile deal with US',
          normalizedText: 'india signs javelin missile deal with us',
        },
        {
          id: 'gcap',
          projectId: 'project-1',
          text: 'India joins GCAP programme',
          normalizedText: 'india joins gcap programme',
        },
        {
          id: 'rafale',
          projectId: 'project-1',
          text: 'What is Rafale F4.3?',
          normalizedText: 'what is rafale f4 3',
        },
      ],
    );

    expect(result).toMatchObject({
      candidateId: 'javelin-deal',
      rerankScore: 0.91,
    });

    expect(runtime.rerank).toHaveBeenCalledTimes(1);
    expect(runtime.rerank).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'India places order for US Javelin missiles',
      }),
    );
  });

  it('does not reject a match merely because multiple semantic candidates are valid', async () => {
    const runtime = {
      route: jest.fn(() => ({
        provider: 'local-qwen-embedding',
        model: 'Qwen3-Embedding-0.6B',
      })),
      embed: jest.fn(async ({ texts }) => ({
        embeddings: texts.map(() => [1, 0]),
        dimensions: 2,
        usage: {},
      })),
      rerank: jest.fn(async () => ({
        results: [
          { index: 0, relevanceScore: 0.72 },
          { index: 1, relevanceScore: 0.88 },
        ],
        usage: {},
      })),
    };

    const service = new SemanticTopicClusteringService(
      runtime as never,
      embeddingCache() as never,
    );

    const result = await service.findBestMatch(
      {
        id: 'incoming',
        projectId: 'project-1',
        text: 'India places new Javelin missile order',
        normalizedText: 'india places new javelin missile order',
      },
      [
        {
          id: 'topic-1',
          projectId: 'project-1',
          text: 'India buys US Javelin missiles',
          normalizedText: 'india buys us javelin missiles',
        },
        {
          id: 'topic-2',
          projectId: 'project-1',
          text: 'US India Javelin missile deal signed',
          normalizedText: 'us india javelin missile deal signed',
        },
      ],
    );

    expect(result?.candidateId).toBe('topic-2');
    expect(result?.rerankScore).toBe(0.88);
  });

  it('does not send candidates below retrieval similarity threshold to BGE', async () => {
    const runtime = {
      route: jest.fn(() => ({
        provider: 'local-qwen-embedding',
        model: 'Qwen3-Embedding-0.6B',
      })),
      embed: jest.fn(async ({ texts }) => ({
        embeddings: texts.map((text: string) =>
          text === 'India Javelin missile deal'
            ? [1, 0]
            : [0, 1],
        ),
        dimensions: 2,
        usage: {},
      })),
      rerank: jest.fn(),
    };

    const service = new SemanticTopicClusteringService(
      runtime as never,
      embeddingCache() as never,
    );

    const result = await service.findBestMatch(
      {
        id: 'incoming',
        projectId: 'project-1',
        text: 'India Javelin missile deal',
        normalizedText: 'india javelin missile deal',
      },
      [
        {
          id: 'earthquake',
          projectId: 'project-1',
          text: 'Japan earthquake response',
          normalizedText: 'japan earthquake response',
        },
      ],
    );

    expect(result).toBeUndefined();
    expect(runtime.rerank).not.toHaveBeenCalled();
  });

  it('returns no incremental match when BGE confirmation is below admission score', async () => {
    const runtime = {
      route: jest.fn(() => ({
        provider: 'local-qwen-embedding',
        model: 'Qwen3-Embedding-0.6B',
      })),
      embed: jest.fn(async ({ texts }) => ({
        embeddings: texts.map(() => [1, 0]),
        dimensions: 2,
        usage: {},
      })),
      rerank: jest.fn(async () => ({
        results: [{ index: 0, relevanceScore: -70 }],
        usage: {},
      })),
    };

    const service = new SemanticTopicClusteringService(
      runtime as never,
      embeddingCache() as never,
    );

    const result = await service.findBestMatch(
      {
        id: 'incoming',
        projectId: 'project-1',
        text: 'India Javelin missile order',
        normalizedText: 'india javelin missile order',
      },
      [
        {
          id: 'topic-1',
          projectId: 'project-1',
          text: 'India buys US Javelin missiles',
          normalizedText: 'india buys us javelin missiles',
        },
      ],
    );

    expect(result).toBeUndefined();
    expect(runtime.rerank).toHaveBeenCalledTimes(1);
  });
});

