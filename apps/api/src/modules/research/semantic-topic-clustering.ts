import { createHash } from 'node:crypto';

export const RETRIEVAL_TOP_K = 8;

/**
 * Batch semantic clustering keeps its existing conservative retrieval threshold.
 */
export const RETRIEVAL_MIN_SIMILARITY = 0.7;

/**
 * Incremental Topic assignment needs broader multilingual recall.
 * Real Qwen3 calibration:
 * Hindi ↔ English Javelin titles measured around 0.48–0.51.
 */
export const INCREMENTAL_RETRIEVAL_MIN_SIMILARITY = 0.45;

/**
 * Existing batch-clustering admission threshold.
 * Do not change this as part of incremental Topic assignment.
 */
export const RERANK_ADMISSION_SCORE = 0.15;

/**
 * Incremental BGE admission calibrated against the local
 * bge-reranker-v2-m3 runtime.
 *
 * Relevant cross-language Javelin candidates: roughly -5 to -6.
 * Clearly unrelated Rafale / earthquake candidates: roughly -10 to -11.
 */
export const INCREMENTAL_RERANK_ADMISSION_SCORE = -6.5;
/** Safety bound for local BGE confirmation work in one detection run. */
export const RERANK_REQUEST_BUDGET = 48;
export const DEFAULT_SEMANTIC_EMBEDDING_BATCH_SIZE = 64;

export type SemanticCandidate = { id: string; projectId: string; text: string; normalizedText: string; embedding: readonly number[] };
export type CandidateCluster = { candidateIds: string[]; titleCandidateId: string; clusterKey: string };
export type SemanticExecutionMetrics = {
  candidateCount: number;
  uniqueEmbeddingInputs: number;
  duplicateEmbeddingInputs: number;
  embeddingCacheHits: number;
  persistentEmbeddingCacheHits: number;
  persistentEmbeddingCacheMisses: number;
  embeddingBatchSize: number;
  plannedEmbeddingBatches: number;
  embeddingBatches: number;
  embeddingProviderRequests: number;
  embeddingDurationMs: number;
  retrievedNeighborPairs: number;
  uniquePairsSentToBge: number;
  preRerankGuardRejections: number;
  reciprocalNeighborPairs: number;
  provisionalNeighborhoods: number;
  singletonCandidates: number;
  distinctQueryCandidates: number;
  projectedBgeRequests: number;
  rerankProviderRequests: number;
  averageDocumentsPerRequest: number;
  maxDocumentsPerRequest: number;
  pairCacheHits: number;
  budgetExhaustedRequests: number;
  rerankDurationMs: number;
  totalDurationMs: number;
};

const GENERIC = new Set(['india', 'pakistan', 'china', 'france', 'iran', 'news', 'update', 'war', 'defence', 'defense', 'fighter', 'missile', 'government']);

export function retrieveNeighbors(candidates: readonly SemanticCandidate[]): Map<string, Array<{ id: string; similarity: number }>> {
  const result = new Map<string, Array<{ id: string; similarity: number }>>();
  for (const candidate of candidates) {
    const neighbors = candidates.filter((other) => other.id !== candidate.id && other.projectId === candidate.projectId)
      .map((other) => ({ id: other.id, similarity: cosine(candidate.embedding, other.embedding) }))
      .filter((entry) => entry.similarity >= RETRIEVAL_MIN_SIMILARITY)
      .sort((left, right) => right.similarity - left.similarity || left.id.localeCompare(right.id))
      .slice(0, RETRIEVAL_TOP_K);
    result.set(candidate.id, neighbors);
  }
  return result;
}

export function formClusters(candidates: readonly SemanticCandidate[], acceptedPairs: readonly [string, string][]): CandidateCluster[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const groups = new Map(candidates.map((candidate) => [candidate.id, [candidate.id]]));
  for (const [leftId, rightId] of acceptedPairs) {
    const left = byId.get(leftId); const right = byId.get(rightId);
    if (!left || !right || left.projectId !== right.projectId || hasSemanticConflict(left, right)) continue;
    const leftGroupId = groupFor(groups, leftId); const rightGroupId = groupFor(groups, rightId);
    if (!leftGroupId || !rightGroupId || leftGroupId === rightGroupId) continue;
    const leftGroup = groups.get(leftGroupId) ?? []; const rightGroup = groups.get(rightGroupId) ?? [];
    const leftRepresentative = representative(leftGroup.map((id) => byId.get(id)).filter(isCandidate));
    const rightRepresentative = representative(rightGroup.map((id) => byId.get(id)).filter(isCandidate));
    // Require compatibility with cluster representatives: no transitive bridges.
    if (hasSemanticConflict(leftRepresentative, rightRepresentative)) continue;
    groups.set(leftGroupId, [...leftGroup, ...rightGroup]); groups.delete(rightGroupId);
  }
  return [...groups.values()].map((ids) => {
    const members = ids.map((id) => byId.get(id)).filter(isCandidate);
    const title = representative(members);
    const clusterKey = `semantic-v2:${createHash('sha256').update([...members].map((candidate) => candidate.id).sort().join(':')).digest('hex')}`;
    return { candidateIds: ids, titleCandidateId: title.id, clusterKey };
  });
}

export function cosine(left: readonly number[], right: readonly number[]): number {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0, leftSum = 0, rightSum = 0;
  for (let index = 0; index < left.length; index += 1) { const a = left[index] ?? 0; const b = right[index] ?? 0; dot += a * b; leftSum += a * a; rightSum += b * b; }
  return leftSum && rightSum ? dot / Math.sqrt(leftSum * rightSum) : 0;
}

function groupFor(groups: Map<string, string[]>, candidateId: string): string | undefined { return [...groups.entries()].find(([, ids]) => ids.includes(candidateId))?.[0]; }
function isCandidate(value: SemanticCandidate | undefined): value is SemanticCandidate { return value !== undefined; }
export function selectRepresentative(candidates: readonly SemanticCandidate[]): SemanticCandidate {
  const representative = [...candidates].sort((a, b) => specificity(b) - specificity(a) || a.text.length - b.text.length || a.id.localeCompare(b.id))[0];
  if (!representative) throw new Error('A semantic neighborhood requires a candidate');
  return representative;
}
function representative(candidates: SemanticCandidate[]): SemanticCandidate { return selectRepresentative(candidates); }
function specificity(candidate: SemanticCandidate): number { return candidate.normalizedText.split(' ').filter((word) => word.length >= 4 && !GENERIC.has(word)).length; }
export function hasSemanticConflict(left: SemanticCandidate, right: SemanticCandidate): boolean { const a = identifiers(left.normalizedText); const b = identifiers(right.normalizedText); return a.size > 0 && b.size > 0 && [...a].every((id) => !b.has(id)); }
function identifiers(value: string): Set<string> { return new Set(value.split(' ').filter((word) => (word.length >= 4 || /\d/.test(word)) && !GENERIC.has(word))); }
