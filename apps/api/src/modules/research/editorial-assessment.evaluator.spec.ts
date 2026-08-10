import { Logger } from '@nestjs/common';
import { EDITORIAL_ASSESSMENT_TIMEOUT_MS, OpenAiEditorialAssessmentEvaluator } from './editorial-assessment.evaluator';

describe('OpenAiEditorialAssessmentEvaluator', () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;
  const originalBaseUrl = process.env.OPENAI_BASE_URL;
  const fetchMock = jest.fn();
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  const info = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  const secret = 'super-secret-api-key';

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
    info.mockRestore();
  });

  it.each([
    [401, { error: { code: 'invalid_api_key', type: 'authentication_error', message: `Invalid key ${secret}` } }, 'invalid_api_key'],
    [429, { error: { code: 'rate_limit_exceeded', type: 'rate_limit_error', message: 'Quota exceeded' } }, 'rate_limit_exceeded'],
    [400, { error: { code: 'unsupported_model', type: 'invalid_request_error', message: 'Model does not support JSON mode' } }, 'unsupported_model'],
  ])('logs sanitized provider details for HTTP %i', async (status, body, code) => {
    fetchMock.mockResolvedValueOnce({ ok: false, status, json: async () => body });
    const evaluator = new OpenAiEditorialAssessmentEvaluator();

    await expect(evaluator.assess({ project: 'not logged' })).rejects.toEqual(expect.objectContaining({ message: 'Editorial evaluator request failed' }));

    const log = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(log).toContain(`"status":${status}`);
    expect(log).toContain(code);
    expect(log).toContain('provider.example');
    expect(log).toContain('test-model');
    expect(log).not.toContain(secret);
    expect(log).not.toContain('not logged');
  });

  it('sends an explicit JSON output contract with the distinct longevity and recommendation enums', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ relevance: 'high', newsworthiness: 'high', contentPotential: 'high', longevity: 'evergreen', duplicationRisk: 'low', recommendation: 'strong_candidate', rationale: 'Clear fit.', citedFactIds: [], citedSignalIds: [] }) } }] }),
    });
    const evaluator = new OpenAiEditorialAssessmentEvaluator();

    await expect(evaluator.assess({})).resolves.toMatchObject({ longevity: 'evergreen' });

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const prompt = String(request.messages[0]?.content);
    expect(prompt).toContain('longevity: breaking, timely, evergreen');
    expect(prompt).toContain('Do not use low/medium/high for longevity.');
    expect(prompt).not.toContain('"longevity": "low | medium | high"');
    expect(prompt).toContain('recommendation: reject, hold, consider, strong_candidate');
    expect(info).not.toHaveBeenCalled();
  });

  it('aborts only after the configured timeout and keeps timeout diagnostics sanitized', async () => {
    jest.useFakeTimers();
    let aborted = false;
    fetchMock.mockImplementationOnce((_url, options) => new Promise((_, reject) => {
      options?.signal?.addEventListener('abort', () => {
        aborted = true;
        const error = new Error('request aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }));
    const evaluator = new OpenAiEditorialAssessmentEvaluator();
    const assessment = evaluator.assess({ privatePrompt: 'private-prompt-content' });

    jest.advanceTimersByTime(EDITORIAL_ASSESSMENT_TIMEOUT_MS - 1);
    expect(aborted).toBe(false);
    jest.advanceTimersByTime(1);
    await expect(assessment).rejects.toMatchObject({ message: 'Editorial evaluator request failed' });

    const log = warn.mock.calls.map((call) => String(call[0])).join('\n');
    const allLogs = [...warn.mock.calls, ...info.mock.calls].map((call) => String(call[0])).join('\n');
    expect(log).toContain('"category":"timeout"');
    expect(log).toContain(`${EDITORIAL_ASSESSMENT_TIMEOUT_MS}ms`);
    expect(allLogs).not.toContain(secret);
    expect(allLogs).not.toContain('private-prompt-content');
    jest.useRealTimers();
  });
});
