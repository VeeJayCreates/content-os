import type { AiBatchStatus, AiCapability, AiExecutionMode, AiTask } from '@content-os/contracts';

export type AiRoute = {
  task: AiTask;
  provider: string;
  model: string | null;
  capability: AiCapability;
  timeoutMs: number;
  costMode: 'configured' | 'zero';
  fallback: null;
};

export type AiUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  providerRequestId: string | null;
};

export type AiStructuredGenerationRequest = {
  task: AiTask;
  projectId: string | null;
  systemPrompt: string;
  input: object;
};
export type AiBatchItemRequest = AiStructuredGenerationRequest & { customId: string; entityType: string; entityId: string; promptHash: string };
export type AiBatchSubmitRequest = { task: AiTask; model: string; items: readonly AiBatchItemRequest[]; completionWindow: '24h' };
export type AiBatchProviderStatus = { providerBatchId: string; status: AiBatchStatus; outputFileId?: string | null; errorCategory?: string | null; errorCode?: string | null };
export type AiBatchProviderResult = { customId: string; output?: unknown; status: 'completed' | 'failed'; errorCategory?: string | null; errorCode?: string | null; usage: AiUsage };

export type AiProviderRequest = AiStructuredGenerationRequest & { route: AiRoute };
export type AiProviderResponse = { output: unknown; usage: AiUsage };

export type AiEmbeddingRequest = {
  task: AiTask;
  projectId: string | null;
  texts: readonly string[];
};

export type AiEmbeddingResponse = {
  embeddings: number[][];
  dimensions: number;
  usage: AiUsage;
};

export type AiRerankingRequest = {
  task: AiTask;
  projectId: string | null;
  query: string;
  documents: readonly string[];
};

export type AiRerankingResult = { index: number; relevanceScore: number };
export type AiRerankingResponse = { results: AiRerankingResult[]; usage: AiUsage };

export interface AiProviderBase {
  readonly name: string;
}

export interface AiStructuredGenerationProvider extends AiProviderBase {
  structuredGeneration(request: AiProviderRequest): Promise<AiProviderResponse>;
}
export interface AiBatchProvider extends AiProviderBase {
  submitBatch(request: AiBatchSubmitRequest): Promise<{ providerBatchId: string }>;
  getBatchStatus(providerBatchId: string): Promise<AiBatchProviderStatus>;
  getBatchResults(providerBatchId: string): Promise<AiBatchProviderResult[]>;
  cancelBatch?(providerBatchId: string): Promise<AiBatchProviderStatus>;
}

export interface AiEmbeddingProvider extends AiProviderBase {
  embed(request: AiEmbeddingRequest & { route: AiRoute }): Promise<AiEmbeddingResponse>;
}

export interface AiRerankingProvider extends AiProviderBase {
  rerank(request: AiRerankingRequest & { route: AiRoute }): Promise<AiRerankingResponse>;
}

export type AiProvider = AiStructuredGenerationProvider | AiEmbeddingProvider | AiRerankingProvider | AiBatchProvider;

export type AiPricing = {
  version: string;
  currency: string;
  inputMicrounitsPerMillionTokens: number | null;
  outputMicrounitsPerMillionTokens: number | null;
};

export class AiRuntimeConfigurationError extends Error {}
export class AiRuntimeRequestError extends Error {}
export class AiRuntimeProviderError extends Error {
  constructor(
    message: string,
    readonly category: 'provider_http' | 'timeout' | 'network' | 'malformed_response',
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}
