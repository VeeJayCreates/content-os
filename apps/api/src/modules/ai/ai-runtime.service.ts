import { Inject, Injectable } from '@nestjs/common';
import { AiCapability, AiExecutionStatus, AiTask } from '@content-os/contracts';
import { AiExecutionRepository } from '@content-os/storage';
import { AiCostCalculator } from './ai-cost-calculator';
import { ModelRouter } from './model-router';
import { AiRuntimeConfigurationError, AiRuntimeProviderError, AiRuntimeRequestError, type AiEmbeddingProvider, type AiEmbeddingRequest, type AiEmbeddingResponse, type AiProvider, type AiRerankingProvider, type AiRerankingRequest, type AiRerankingResponse, type AiStructuredGenerationProvider, type AiStructuredGenerationRequest, type AiUsage } from './ai-runtime.types';

export const AI_PROVIDER = Symbol('AI_PROVIDER');

@Injectable()
export class AiRuntime {
  constructor(
    private readonly router: ModelRouter,
    @Inject(AI_PROVIDER) private readonly providers: AiProvider[],
    private readonly executions: AiExecutionRepository,
    private readonly costs: AiCostCalculator,
  ) {}

  route(task: AiTask) {
    return this.router.route(task);
  }

  async structuredGeneration(request: AiStructuredGenerationRequest): Promise<unknown> {
    const route = this.router.route(request.task);
    if (route.capability !== AiCapability.STRUCTURED_GENERATION) throw new AiRuntimeRequestError('AI task does not support structured generation');
    const provider = this.structuredProvider(route.provider, request.task);
    return this.execute(request, route, async () => {
      const result = await provider.structuredGeneration({ ...request, route });
      return { value: result.output, usage: result.usage };
    });
  }

  async embed(request: AiEmbeddingRequest): Promise<AiEmbeddingResponse> {
    this.validateEmbeddingRequest(request);
    const route = this.router.route(request.task);
    if (route.capability !== AiCapability.EMBEDDING) throw new AiRuntimeRequestError('AI task does not support embeddings');
    const provider = this.embeddingProvider(route.provider, request.task);
    return this.execute(request, route, async () => {
      const result = await provider.embed({ ...request, route });
      return { value: result, usage: result.usage };
    });
  }

  async rerank(request: AiRerankingRequest): Promise<AiRerankingResponse> {
    this.validateRerankingRequest(request);
    const route = this.router.route(request.task);
    if (route.capability !== AiCapability.RERANKING) throw new AiRuntimeRequestError('AI task does not support reranking');
    const provider = this.rerankingProvider(route.provider, request.task);
    return this.execute(request, route, async () => {
      const result = await provider.rerank({ ...request, route });
      return { value: result, usage: result.usage };
    });
  }

  private async execute<T>(request: { task: AiTask; projectId: string | null }, route: ReturnType<ModelRouter['route']>, invoke: () => Promise<{ value: T; usage: AiUsage }>): Promise<T> {
    const startedAt = new Date();
    try {
      const result = await invoke();
      await this.record({ request, route, status: AiExecutionStatus.SUCCEEDED, startedAt, completedAt: new Date(), usage: result.usage });
      return result.value;
    } catch (error) {
      await this.record({ request, route, status: AiExecutionStatus.FAILED, startedAt, completedAt: new Date(), usage: this.emptyUsage(), failure: error });
      throw error;
    }
  }

  private async record(args: {
    request: { task: AiTask; projectId: string | null };
    route: ReturnType<ModelRouter['route']>;
    status: AiExecutionStatus;
    startedAt: Date;
    completedAt: Date;
    usage: AiUsage;
    failure?: unknown;
  }) {
    const pricing = this.costs.pricing();
    const failure = args.failure instanceof AiRuntimeProviderError ? args.failure : undefined;
    await this.executions.create({
      projectId: args.request.projectId,
      task: args.request.task,
      provider: args.route.provider,
      model: args.route.model,
      capability: args.route.capability,
      status: args.status,
      startedAt: args.startedAt.toISOString(),
      completedAt: args.completedAt.toISOString(),
      latencyMs: args.completedAt.getTime() - args.startedAt.getTime(),
      inputTokens: args.usage.inputTokens,
      outputTokens: args.usage.outputTokens,
      totalTokens: args.usage.totalTokens,
      estimatedCostMicrounits: args.status === AiExecutionStatus.SUCCEEDED ? args.route.costMode === 'zero' ? 0 : this.costs.estimate(args.usage, pricing) : null,
      costCurrency: args.status === AiExecutionStatus.SUCCEEDED ? pricing.currency : null,
      pricingVersion: args.status === AiExecutionStatus.SUCCEEDED ? args.route.costMode === 'zero' ? 'local-zero-v1' : pricing.version : null,
      cacheHit: false,
      providerCallMade: true,
      failureCategory: failure?.category ?? (args.failure instanceof AiRuntimeConfigurationError ? 'configuration' : null),
      failureCode: failure?.code ?? null,
      providerRequestId: args.usage.providerRequestId,
    });
  }

  private namedProvider(name: string): AiProvider | undefined {
    return this.providers.find((candidate) => candidate.name === name);
  }

  private structuredProvider(name: string, task: AiTask): AiStructuredGenerationProvider {
    const provider = this.namedProvider(name);
    if (!provider || !('structuredGeneration' in provider) || typeof provider.structuredGeneration !== 'function') throw new AiRuntimeConfigurationError(`AI provider is not configured for task ${task}`);
    return provider;
  }

  private embeddingProvider(name: string, task: AiTask): AiEmbeddingProvider {
    const provider = this.namedProvider(name);
    if (!provider || !('embed' in provider) || typeof provider.embed !== 'function') throw new AiRuntimeConfigurationError(`AI provider is not configured for task ${task}`);
    return provider;
  }

  private rerankingProvider(name: string, task: AiTask): AiRerankingProvider {
    const provider = this.namedProvider(name);
    if (!provider || !('rerank' in provider) || typeof provider.rerank !== 'function') throw new AiRuntimeConfigurationError(`AI provider is not configured for task ${task}`);
    return provider;
  }

  private validateEmbeddingRequest(request: AiEmbeddingRequest) {
    if (request.texts.length === 0 || request.texts.length > 64 || request.texts.some((text) => !text.trim())) throw new AiRuntimeRequestError('Embedding input must contain between 1 and 64 non-empty texts');
  }

  private validateRerankingRequest(request: AiRerankingRequest) {
    if (!request.query.trim() || request.documents.length === 0 || request.documents.length > 12 || request.documents.some((document) => !document.trim())) throw new AiRuntimeRequestError('Reranking input must contain a query and between 1 and 12 non-empty documents');
  }

  private emptyUsage(): AiUsage { return { inputTokens: null, outputTokens: null, totalTokens: null, providerRequestId: null }; }
}
