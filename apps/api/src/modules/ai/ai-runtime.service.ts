import { Inject, Injectable } from '@nestjs/common';
import { AiExecutionStatus, AiTask } from '@content-os/contracts';
import { AiExecutionRepository } from '@content-os/storage';
import { AiCostCalculator } from './ai-cost-calculator';
import { ModelRouter } from './model-router';
import { AiRuntimeConfigurationError, AiRuntimeProviderError, type AiProvider, type AiStructuredGenerationRequest } from './ai-runtime.types';

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
    const provider = this.providers.find((candidate) => candidate.name === route.provider);
    if (!provider) throw new AiRuntimeConfigurationError(`AI provider is not configured for task ${request.task}`);
    const startedAt = new Date();
    try {
      const result = await provider.structuredGeneration({ ...request, route });
      await this.record({ request, route, status: AiExecutionStatus.SUCCEEDED, startedAt, completedAt: new Date(), usage: result.usage });
      return result.output;
    } catch (error) {
      const completedAt = new Date();
      await this.record({ request, route, status: AiExecutionStatus.FAILED, startedAt, completedAt, usage: { inputTokens: null, outputTokens: null, totalTokens: null, providerRequestId: null }, failure: error });
      throw error;
    }
  }

  private async record(args: {
    request: AiStructuredGenerationRequest;
    route: ReturnType<ModelRouter['route']>;
    status: AiExecutionStatus;
    startedAt: Date;
    completedAt: Date;
    usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; providerRequestId: string | null };
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
      estimatedCostMicrounits: args.status === AiExecutionStatus.SUCCEEDED ? this.costs.estimate(args.usage, pricing) : null,
      costCurrency: args.status === AiExecutionStatus.SUCCEEDED ? pricing.currency : null,
      pricingVersion: args.status === AiExecutionStatus.SUCCEEDED ? pricing.version : null,
      cacheHit: false,
      providerCallMade: true,
      failureCategory: failure?.category ?? (args.failure instanceof AiRuntimeConfigurationError ? 'configuration' : null),
      failureCode: failure?.code ?? null,
      providerRequestId: args.usage.providerRequestId,
    });
  }
}
