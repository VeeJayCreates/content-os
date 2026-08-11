jest.mock('@content-os/contracts', () => ({
  AiTask: { CONTENT_ANGLE: 'content_angle' },
  AiCapability: { STRUCTURED_GENERATION: 'structured_generation' },
}));
jest.mock('@content-os/storage', () => ({ AiExecutionRepository: class AiExecutionRepository {} }));

import { Logger } from '@nestjs/common';
import { AiCapability, AiTask } from '@content-os/contracts';
import { AiRuntime } from '../ai/ai-runtime.service';
import { OpenAiCompatibleProvider } from '../ai/openai-compatible.provider';
import { EDITORIAL_ASSESSMENT_SYSTEM_PROMPT, OpenAiEditorialAssessmentEvaluator } from './editorial-assessment.evaluator';

describe('OpenAI-compatible AI Runtime provider', () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;
  const originalBaseUrl = process.env.OPENAI_BASE_URL;
  const fetchMock = jest.fn();
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  const secret = 'super-secret-api-key';
  const request = { task: AiTask.CONTENT_ANGLE, projectId: 'project-1', systemPrompt: EDITORIAL_ASSESSMENT_SYSTEM_PROMPT, input: { privatePrompt: 'private-prompt-content' }, route: { task: AiTask.CONTENT_ANGLE, provider: 'openai', model: 'test-model', capability: AiCapability.STRUCTURED_GENERATION, timeoutMs: 60_000, fallback: null } };

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.OPENAI_API_KEY = secret;
    process.env.OPENAI_MODEL = 'test-model';
    process.env.OPENAI_BASE_URL = 'https://provider.example/v1';
    global.fetch = fetchMock;
  });

  afterAll(() => {
    process.env.OPENAI_API_KEY = originalKey;
    process.env.OPENAI_MODEL = originalModel;
    process.env.OPENAI_BASE_URL = originalBaseUrl;
    warn.mockRestore();
  });

  it('sends the existing Content Angle contract through the shared provider and records reported token metadata', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers({ 'x-request-id': 'request-1' }), json: async () => ({ choices: [{ message: { content: JSON.stringify({ longevity: 'evergreen' }) } }], usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } }) });
    const result = await new OpenAiCompatibleProvider().structuredGeneration(request);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.messages[0].content).toContain('longevity: breaking, timely, evergreen');
    expect(body.messages[0].content).toContain('Do not use low/medium/high for longevity.');
    expect(result).toEqual({ output: { longevity: 'evergreen' }, usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20, providerRequestId: 'request-1' } });
  });

  it.each([[401, 'invalid_api_key'], [429, 'rate_limit_exceeded'], [400, 'unsupported_model']])('logs sanitized HTTP %i diagnostics', async (status, code) => {
    fetchMock.mockResolvedValueOnce({ ok: false, status, json: async () => ({ error: { code, type: 'provider_error', message: `failure ${secret}` } }) });
    await expect(new OpenAiCompatibleProvider().structuredGeneration(request)).rejects.toMatchObject({ category: 'provider_http', status, code });
    const logs = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logs).toContain(code);
    expect(logs).toContain('provider.example');
    expect(logs).not.toContain(secret);
    expect(logs).not.toContain('private-prompt-content');
  });

  it('uses the routed 60-second timeout and keeps timeout diagnostics sanitized', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementationOnce((_url, options) => new Promise((_, reject) => {
      options?.signal?.addEventListener('abort', () => {
        const error = new Error('request aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }));
    const pending = new OpenAiCompatibleProvider().structuredGeneration(request);
    jest.advanceTimersByTime(59_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await expect(pending).rejects.toMatchObject({ category: 'timeout' });
    const logs = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logs).toContain('60000ms');
    expect(logs).not.toContain(secret);
    expect(logs).not.toContain('private-prompt-content');
    jest.useRealTimers();
  });
});

describe('Editorial Assessment runtime migration', () => {
  it('delegates Content Angle execution to AI Runtime without owning a provider request', async () => {
    const runtime = { route: jest.fn(() => ({ provider: 'openai', model: 'model-1' })), structuredGeneration: jest.fn().mockResolvedValue({ recommendation: 'hold' }) };
    const evaluator = new OpenAiEditorialAssessmentEvaluator(runtime as unknown as AiRuntime);
    await expect(evaluator.assess({ opportunity: { id: 'opportunity-1' } }, 'project-1')).resolves.toEqual({ recommendation: 'hold' });
    expect(runtime.structuredGeneration).toHaveBeenCalledWith(expect.objectContaining({ task: AiTask.CONTENT_ANGLE, projectId: 'project-1', systemPrompt: EDITORIAL_ASSESSMENT_SYSTEM_PROMPT }));
  });
});
