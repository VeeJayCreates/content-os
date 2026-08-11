jest.mock('@content-os/contracts', () => ({
  AiTask: { CONTENT_ANGLE: 'content_angle', SEMANTIC_EMBEDDING: 'semantic_embedding', SEMANTIC_RERANKING: 'semantic_reranking' },
  AiCapability: { STRUCTURED_GENERATION: 'structured_generation', EMBEDDING: 'embedding', RERANKING: 'reranking' },
  AiExecutionStatus: { SUCCEEDED: 'succeeded', FAILED: 'failed' },
}));
jest.mock('@content-os/storage', () => ({ AiExecutionRepository: class AiExecutionRepository {} }));

import { AiCapability, AiExecutionStatus, AiTask } from '@content-os/contracts';
import { AiCostCalculator } from './ai-cost-calculator';
import { AiRuntime } from './ai-runtime.service';
import { AiRuntimeProviderError } from './ai-runtime.types';
import { ModelRouter } from './model-router';

describe('AiRuntime', () => {
  const route = { task: AiTask.CONTENT_ANGLE, provider: 'openai-cloud', model: 'test-model', capability: AiCapability.STRUCTURED_GENERATION, timeoutMs: 60_000, costMode: 'configured' as const, fallback: null };
  const router = { route: jest.fn(() => route) };
  const executions = { create: jest.fn().mockResolvedValue(undefined) };
  const costs = { pricing: jest.fn(() => ({ version: 'test-pricing-v1', currency: 'USD', inputMicrounitsPerMillionTokens: 1_000_000, outputMicrounitsPerMillionTokens: 2_000_000 })), estimate: jest.fn(() => 7) };
  const provider = { name: 'openai-cloud', structuredGeneration: jest.fn() };
  const runtime = () => new AiRuntime(router as never, [provider] as never, executions as never, costs as never);

  beforeEach(() => jest.clearAllMocks());

  it('routes content_angle without business-service model selection and persists token usage', async () => {
    provider.structuredGeneration.mockResolvedValueOnce({ output: { recommendation: 'hold' }, usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5, providerRequestId: 'request-1' } });
    await expect(runtime().structuredGeneration({ task: AiTask.CONTENT_ANGLE, projectId: 'project-1', systemPrompt: 'prompt', input: { safe: true } })).resolves.toEqual({ recommendation: 'hold' });
    expect(provider.structuredGeneration).toHaveBeenCalledWith(expect.objectContaining({ route }));
    expect(executions.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1', status: AiExecutionStatus.SUCCEEDED, inputTokens: 3, outputTokens: 2, totalTokens: 5, estimatedCostMicrounits: 7, providerCallMade: true, cacheHit: false }));
    expect(JSON.stringify(executions.create.mock.calls)).not.toContain('prompt');
  });

  it('records sanitized failure metadata for one failed provider attempt', async () => {
    provider.structuredGeneration.mockRejectedValueOnce(new AiRuntimeProviderError('provider failed', 'timeout'));
    await expect(runtime().structuredGeneration({ task: AiTask.CONTENT_ANGLE, projectId: 'project-1', systemPrompt: 'private prompt', input: {} })).rejects.toMatchObject({ category: 'timeout' });
    expect(executions.create).toHaveBeenCalledWith(expect.objectContaining({ status: AiExecutionStatus.FAILED, failureCategory: 'timeout', providerCallMade: true, estimatedCostMicrounits: null }));
    expect(JSON.stringify(executions.create.mock.calls)).not.toContain('private prompt');
  });

  it('keeps unknown pricing and missing token usage nullable', () => {
    const calculator = new AiCostCalculator();
    expect(calculator.estimate({ inputTokens: null, outputTokens: null, totalTokens: null, providerRequestId: null }, { version: 'unpriced-v1', currency: 'USD', inputMicrounitsPerMillionTokens: null, outputMicrounitsPerMillionTokens: null })).toBeNull();
  });

  it('uses task-aware configuration without a business-service model dependency', () => {
    const originalTaskModel = process.env.AI_CONTENT_ANGLE_MODEL;
    const originalDefaultModel = process.env.OPENAI_MODEL;
    process.env.AI_CONTENT_ANGLE_MODEL = 'task-model';
    process.env.OPENAI_MODEL = 'default-model';
    expect(new ModelRouter().route(AiTask.CONTENT_ANGLE).model).toBe('task-model');
    process.env.AI_CONTENT_ANGLE_MODEL = originalTaskModel;
    process.env.OPENAI_MODEL = originalDefaultModel;
  });

  it('rejects an unknown task without selecting a provider', () => {
    expect(() => new ModelRouter().route('unknown_task' as AiTask)).toThrow('Unsupported AI task');
  });

  it('routes semantic capabilities to their local named providers', () => {
    const router = new ModelRouter();
    expect(router.route(AiTask.CONTENT_ANGLE)).toMatchObject({ provider: 'openai-cloud', capability: AiCapability.STRUCTURED_GENERATION });
    expect(router.route(AiTask.SEMANTIC_EMBEDDING)).toMatchObject({ provider: 'local-qwen-embedding', capability: AiCapability.EMBEDDING, costMode: 'zero' });
    expect(router.route(AiTask.SEMANTIC_RERANKING)).toMatchObject({ provider: 'local-bge-reranker', capability: AiCapability.RERANKING, costMode: 'zero' });
  });

  it('records one zero-cost local embedding execution and never calls the cloud provider', async () => {
    const embeddingRoute = { task: AiTask.SEMANTIC_EMBEDDING, provider: 'local-qwen-embedding', model: 'Qwen3-Embedding-0.6B', capability: AiCapability.EMBEDDING, timeoutMs: 30_000, costMode: 'zero' as const, fallback: null };
    const local = { name: 'local-qwen-embedding', embed: jest.fn().mockResolvedValue({ embeddings: [[0.1, 0.2]], dimensions: 2, usage: { inputTokens: null, outputTokens: null, totalTokens: null, providerRequestId: null } }) };
    const cloud = { name: 'openai-cloud', structuredGeneration: jest.fn() };
    const localRuntime = new AiRuntime({ route: jest.fn(() => embeddingRoute) } as never, [local, cloud] as never, executions as never, costs as never);
    await expect(localRuntime.embed({ task: AiTask.SEMANTIC_EMBEDDING, projectId: 'project-1', texts: ['source content'] })).resolves.toMatchObject({ dimensions: 2 });
    expect(cloud.structuredGeneration).not.toHaveBeenCalled();
    expect(executions.create).toHaveBeenCalledWith(expect.objectContaining({ provider: 'local-qwen-embedding', capability: AiCapability.EMBEDDING, estimatedCostMicrounits: 0, pricingVersion: 'local-zero-v1' }));
  });

  it('rejects oversized local capability inputs before a provider call', async () => {
    await expect(runtime().embed({ task: AiTask.SEMANTIC_EMBEDDING, projectId: null, texts: Array.from({ length: 65 }, () => 'text') })).rejects.toThrow('between 1 and 64');
    await expect(runtime().rerank({ task: AiTask.SEMANTIC_RERANKING, projectId: null, query: 'query', documents: Array.from({ length: 13 }, () => 'document') })).rejects.toThrow('between 1 and 12');
    expect(provider.structuredGeneration).not.toHaveBeenCalled();
  });

  it('records one sanitized failed local reranking execution', async () => {
    const rerankingRoute = { task: AiTask.SEMANTIC_RERANKING, provider: 'local-bge-reranker', model: 'bge-reranker-v2-m3', capability: AiCapability.RERANKING, timeoutMs: 30_000, costMode: 'zero' as const, fallback: null };
    const reranker = { name: 'local-bge-reranker', rerank: jest.fn().mockRejectedValue(new AiRuntimeProviderError('unavailable', 'network')) };
    const localRuntime = new AiRuntime({ route: jest.fn(() => rerankingRoute) } as never, [reranker] as never, executions as never, costs as never);
    await expect(localRuntime.rerank({ task: AiTask.SEMANTIC_RERANKING, projectId: 'project-1', query: 'private query', documents: ['private document'] })).rejects.toMatchObject({ category: 'network' });
    expect(executions.create).toHaveBeenCalledTimes(1);
    expect(executions.create).toHaveBeenCalledWith(expect.objectContaining({ status: AiExecutionStatus.FAILED, provider: 'local-bge-reranker', failureCategory: 'network', estimatedCostMicrounits: null }));
    expect(JSON.stringify(executions.create.mock.calls)).not.toContain('private query');
    expect(JSON.stringify(executions.create.mock.calls)).not.toContain('private document');
  });
});
