jest.mock('@content-os/contracts', () => ({
  AiTask: { CONTENT_ANGLE: 'content_angle' },
  AiCapability: { STRUCTURED_GENERATION: 'structured_generation' },
  AiExecutionStatus: { SUCCEEDED: 'succeeded', FAILED: 'failed' },
}));
jest.mock('@content-os/storage', () => ({ AiExecutionRepository: class AiExecutionRepository {} }));

import { AiCapability, AiExecutionStatus, AiTask } from '@content-os/contracts';
import { AiCostCalculator } from './ai-cost-calculator';
import { AiRuntime } from './ai-runtime.service';
import { AiRuntimeProviderError } from './ai-runtime.types';
import { ModelRouter } from './model-router';

describe('AiRuntime', () => {
  const route = { task: AiTask.CONTENT_ANGLE, provider: 'openai', model: 'test-model', capability: AiCapability.STRUCTURED_GENERATION, timeoutMs: 60_000, fallback: null };
  const router = { route: jest.fn(() => route) };
  const executions = { create: jest.fn().mockResolvedValue(undefined) };
  const costs = { pricing: jest.fn(() => ({ version: 'test-pricing-v1', currency: 'USD', inputMicrounitsPerMillionTokens: 1_000_000, outputMicrounitsPerMillionTokens: 2_000_000 })), estimate: jest.fn(() => 7) };
  const provider = { name: 'openai', structuredGeneration: jest.fn() };
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
});
