import { Injectable } from '@nestjs/common';
import { AiTask } from '@content-os/contracts';
import { SemanticEmbeddingCacheRepository } from '@content-os/storage';
import { createHash } from 'node:crypto';

import { AiRuntime } from '../ai/ai-runtime.service';
import { DEFAULT_SEMANTIC_EMBEDDING_BATCH_SIZE, formClusters, hasSemanticConflict, retrieveNeighbors, RERANK_ADMISSION_SCORE, RERANK_REQUEST_BUDGET, selectRepresentative, type CandidateCluster, type SemanticCandidate, type SemanticExecutionMetrics } from './semantic-topic-clustering';

const RERANK_CONCURRENCY = 2;

type RerankRequest = {
  projectId: string;
  queryId: string;
  documentIds: string[];
};

type ProjectPlan = {
  embedded: SemanticCandidate[];
  requests: RerankRequest[];
};

export type SemanticPlanOptions = {
  onEmbeddingBatch?: (progress: { batch: number; totalBatches: number; itemCount: number; elapsedMs: number; cumulativeCandidates: number }) => void;
};

@Injectable()
export class SemanticTopicClusteringService {
  private metrics: SemanticExecutionMetrics | null = null;

  constructor(private readonly runtime: AiRuntime, private readonly embeddingCache?: SemanticEmbeddingCacheRepository) {}

  lastExecutionMetrics(): SemanticExecutionMetrics | null { return this.metrics ? { ...this.metrics } : null; }

  /** Runs only embedding retrieval and deterministic BGE scheduling; it never calls BGE. */
  async plan(candidates: Array<Omit<SemanticCandidate, 'embedding'>>, options: SemanticPlanOptions = {}): Promise<SemanticExecutionMetrics> {
    const started = Date.now();
    const metrics = initialMetrics(candidates.length);
    try {
      await this.planProjects(candidates, metrics, options);
    } finally {
      metrics.totalDurationMs = Date.now() - started;
      this.metrics = metrics;
    }
    return { ...metrics };
  }

  async cluster(candidates: Array<Omit<SemanticCandidate, 'embedding'>>): Promise<CandidateCluster[]> {
    const started = Date.now();
    const metrics = initialMetrics(candidates.length);
    try {
      const plans = await this.planProjects(candidates, metrics);
      const scheduled = plans.flatMap((plan) => plan.requests).slice(0, RERANK_REQUEST_BUDGET);
      metrics.projectedBgeRequests = scheduled.length;
      metrics.budgetExhaustedRequests = Math.max(0, plans.reduce((total, plan) => total + plan.requests.length, 0) - scheduled.length);
      metrics.distinctQueryCandidates = scheduled.length;
      metrics.averageDocumentsPerRequest = scheduled.length ? scheduled.reduce((total, request) => total + request.documentIds.length, 0) / scheduled.length : 0;
      metrics.maxDocumentsPerRequest = scheduled.reduce((maximum, request) => Math.max(maximum, request.documentIds.length), 0);
      const acceptedByProject = await this.confirm(scheduled, plans, metrics);
      const clusters: CandidateCluster[] = [];
      for (const plan of plans) clusters.push(...formClusters(plan.embedded, acceptedByProject.get(plan.embedded[0]?.projectId ?? '') ?? []));
      return clusters;
    } finally {
      metrics.totalDurationMs = Date.now() - started;
      this.metrics = metrics;
    }
  }

  private async planProjects(candidates: Array<Omit<SemanticCandidate, 'embedding'>>, metrics: SemanticExecutionMetrics, options: SemanticPlanOptions = {}): Promise<ProjectPlan[]> {
    const byProject = new Map<string, Array<Omit<SemanticCandidate, 'embedding'>>>();
    for (const candidate of candidates) byProject.set(candidate.projectId, [...(byProject.get(candidate.projectId) ?? []), candidate]);
    const plans: ProjectPlan[] = [];
    for (const items of byProject.values()) plans.push(await this.planProject(items, metrics, options));
    return plans;
  }

  private async planProject(candidates: Array<Omit<SemanticCandidate, 'embedding'>>, metrics: SemanticExecutionMetrics, options: SemanticPlanOptions): Promise<ProjectPlan> {
    const embeddingByKey = new Map<string, readonly number[]>();
    const inputs = uniqueEmbeddingInputs(candidates);
    metrics.uniqueEmbeddingInputs += inputs.length;
    metrics.duplicateEmbeddingInputs += candidates.length - inputs.length;
    metrics.embeddingCacheHits += candidates.length - inputs.length;
    const route = this.runtime.route?.(AiTask.SEMANTIC_EMBEDDING) ?? { provider: 'local-qwen-embedding', model: 'Qwen3-Embedding-0.6B' };
    const model = route.model;
    if (!model) throw new Error('Semantic embedding route must provide a model');
    const cacheIdentity = { provider: route.provider, model, modelVersion: process.env.AI_LOCAL_EMBEDDING_MODEL_VERSION ?? model };
    const cached = this.embeddingCache
      ? await this.embeddingCache.findMany({ projectId: candidates[0]?.projectId ?? '', ...cacheIdentity }, inputs.map((candidate) => candidateHash(candidate)))
      : new Map<string, number[]>();
    for (const input of inputs) {
      const vector = cached.get(candidateHash(input));
      if (vector) embeddingByKey.set(embeddingKey(input), vector);
    }
    const missing = inputs.filter((input) => !embeddingByKey.has(embeddingKey(input)));
    metrics.persistentEmbeddingCacheHits += cached.size;
    metrics.persistentEmbeddingCacheMisses += missing.length;
    const batchSize = semanticEmbeddingBatchSize();
    metrics.embeddingBatchSize = batchSize;
    metrics.plannedEmbeddingBatches += Math.ceil(missing.length / batchSize);
    let completedBatches = 0;
    let embeddedInputs = 0;
    for (let index = 0; index < missing.length; index += batchSize) {
      const batch = missing.slice(index, index + batchSize); const projectId = batch[0]?.projectId;
      if (!projectId) continue;
      metrics.embeddingBatches += 1;
      metrics.embeddingProviderRequests += 1;
      const started = Date.now();
      const response = await this.runtime.embed({ task: AiTask.SEMANTIC_EMBEDDING, projectId, texts: batch.map((candidate) => candidate.text) });
      const elapsedMs = Date.now() - started;
      metrics.embeddingDurationMs += elapsedMs;
      const created: Array<{ projectId: string; candidateHash: string; provider: string; model: string; modelVersion: string; dimensions: number; vector: readonly number[] }> = [];
      batch.forEach((candidate, position) => { const embedding = response.embeddings[position]; if (!embedding || embedding.length !== response.dimensions || !embedding.every(Number.isFinite)) throw new Error('Embedding response omitted candidate'); embeddingByKey.set(embeddingKey(candidate), embedding); created.push({ projectId: candidate.projectId, candidateHash: candidateHash(candidate), ...cacheIdentity, dimensions: response.dimensions, vector: embedding }); });
      await this.embeddingCache?.upsertMany(created);
      completedBatches += 1; embeddedInputs += batch.length;
      options.onEmbeddingBatch?.({ batch: completedBatches, totalBatches: Math.ceil(missing.length / batchSize), itemCount: batch.length, elapsedMs, cumulativeCandidates: embeddedInputs });
    }
    const embedded = candidates.map((candidate) => {
      const embedding = embeddingByKey.get(embeddingKey(candidate));
      if (!embedding) throw new Error('Embedding cache omitted candidate');
      return { ...candidate, embedding };
    });
    const byId = new Map(embedded.map((candidate) => [candidate.id, candidate]));
    const neighbors = retrieveNeighbors(embedded);
    const reciprocalPairs = new Map<string, [string, string]>();
    for (const candidate of embedded) {
      for (const neighbor of neighbors.get(candidate.id) ?? []) {
        metrics.retrievedNeighborPairs += 1;
        const other = byId.get(neighbor.id);
        if (!other || hasSemanticConflict(candidate, other)) { metrics.preRerankGuardRejections += 1; continue; }
        const [queryId, documentId] = candidate.id < other.id ? [candidate.id, other.id] : [other.id, candidate.id];
        const key = `${queryId}:${documentId}`;
        if (reciprocalPairs.has(key)) { metrics.pairCacheHits += 1; continue; }
        const reverse = (neighbors.get(other.id) ?? []).some((entry) => entry.id === candidate.id);
        if (!reverse) continue;
        reciprocalPairs.set(key, [queryId, documentId]);
      }
    }
    metrics.reciprocalNeighborPairs += reciprocalPairs.size;
    metrics.uniquePairsSentToBge += reciprocalPairs.size;
    const neighborhoods = connectedNeighborhoods(embedded.map((candidate) => candidate.id), [...reciprocalPairs.values()]);
    const reciprocalNeighbors = adjacencyForPairs(embedded.map((candidate) => candidate.id), [...reciprocalPairs.values()]);
    const requests: RerankRequest[] = [];
    for (const neighborhood of neighborhoods) {
      if (neighborhood.length === 1) { metrics.singletonCandidates += 1; continue; }
      const members = neighborhood.map((id) => byId.get(id)).filter(isCandidate);
      const representative = selectRepresentative(members);
      // Confirmation is deliberately limited to the representative's direct,
      // reciprocal neighbors. Other component members remain unresolved unless
      // directly confirmed; we never turn embedding connectivity into a merge.
      const documentIds = [...(reciprocalNeighbors.get(representative.id) ?? [])].sort();
      if (documentIds.length > 0) requests.push({ projectId: representative.projectId, queryId: representative.id, documentIds });
    }
    metrics.provisionalNeighborhoods += requests.length;
    return { embedded, requests };
  }

  private async confirm(requests: RerankRequest[], plans: ProjectPlan[], metrics: SemanticExecutionMetrics): Promise<Map<string, Array<[string, string]>>> {
    const candidates = new Map(plans.flatMap((plan) => plan.embedded.map((candidate) => [candidate.id, candidate])));
    const acceptedByProject = new Map<string, Array<[string, string]>>();
    const rerankStarted = Date.now();
    const work = requests.map((request) => async () => {
      const query = candidates.get(request.queryId);
      if (!query) return;
      const response = await this.runtime.rerank({ task: AiTask.SEMANTIC_RERANKING, projectId: request.projectId, query: query.text, documents: request.documentIds.map((id) => candidates.get(id)?.text ?? '') });
      metrics.rerankProviderRequests += 1;
      for (const result of response.results) {
        const documentId = request.documentIds[result.index];
        if (documentId && result.relevanceScore >= RERANK_ADMISSION_SCORE) acceptedByProject.set(query.projectId, [...(acceptedByProject.get(query.projectId) ?? []), [query.id, documentId]]);
      }
    });
    await runBounded(work, RERANK_CONCURRENCY);
    metrics.rerankDurationMs += Date.now() - rerankStarted;
    return acceptedByProject;
  }
}

function initialMetrics(candidateCount: number): SemanticExecutionMetrics {
  return { candidateCount, uniqueEmbeddingInputs: 0, duplicateEmbeddingInputs: 0, embeddingCacheHits: 0, persistentEmbeddingCacheHits: 0, persistentEmbeddingCacheMisses: 0, embeddingBatchSize: semanticEmbeddingBatchSize(), plannedEmbeddingBatches: 0, embeddingBatches: 0, embeddingProviderRequests: 0, embeddingDurationMs: 0, retrievedNeighborPairs: 0, uniquePairsSentToBge: 0, preRerankGuardRejections: 0, reciprocalNeighborPairs: 0, provisionalNeighborhoods: 0, singletonCandidates: 0, distinctQueryCandidates: 0, projectedBgeRequests: 0, rerankProviderRequests: 0, averageDocumentsPerRequest: 0, maxDocumentsPerRequest: 0, pairCacheHits: 0, budgetExhaustedRequests: 0, rerankDurationMs: 0, totalDurationMs: 0 };
}

function uniqueEmbeddingInputs(candidates: Array<Omit<SemanticCandidate, 'embedding'>>): Array<Omit<SemanticCandidate, 'embedding'>> {
  const inputs = new Map<string, Omit<SemanticCandidate, 'embedding'>>();
  for (const candidate of candidates) if (!inputs.has(embeddingKey(candidate))) inputs.set(embeddingKey(candidate), candidate);
  return [...inputs.values()];
}

function embeddingKey(candidate: Pick<SemanticCandidate, 'projectId' | 'normalizedText'>): string {
  return `${candidate.projectId}:${candidate.normalizedText}`;
}

function candidateHash(candidate: Pick<SemanticCandidate, 'normalizedText'>): string { return createHash('sha256').update(candidate.normalizedText).digest('hex'); }

function semanticEmbeddingBatchSize(): number {
  const configured = Number.parseInt(process.env.SEMANTIC_EMBEDDING_BATCH_SIZE ?? '', 10);
  return Number.isInteger(configured) && configured >= 1 && configured <= 64 ? configured : DEFAULT_SEMANTIC_EMBEDDING_BATCH_SIZE;
}

function connectedNeighborhoods(ids: string[], edges: Array<[string, string]>): string[][] {
  const adjacency = adjacencyForPairs(ids, edges);
  const visited = new Set<string>();
  return [...ids].sort().map((start) => {
    if (visited.has(start)) return [];
    const members: string[] = []; const pending = [start]; visited.add(start);
    while (pending.length) { const current = pending.shift(); if (!current) continue; members.push(current); for (const neighbor of adjacency.get(current) ?? []) if (!visited.has(neighbor)) { visited.add(neighbor); pending.push(neighbor); } }
    return members.sort();
  }).filter((members) => members.length > 0);
}

function adjacencyForPairs(ids: string[], edges: Array<[string, string]>): Map<string, Set<string>> {
  const adjacency = new Map(ids.map((id) => [id, new Set<string>()]));
  for (const [left, right] of edges) { adjacency.get(left)?.add(right); adjacency.get(right)?.add(left); }
  return adjacency;
}

function isCandidate(value: SemanticCandidate | undefined): value is SemanticCandidate { return value !== undefined; }

async function runBounded(work: Array<() => Promise<void>>, concurrency: number): Promise<void> {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, work.length) }, async () => {
    while (cursor < work.length) { const index = cursor; cursor += 1; const operation = work[index]; if (operation) await operation(); }
  }));
}
