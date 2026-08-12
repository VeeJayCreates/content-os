jest.mock('@content-os/contracts', () => ({ AiBatchStatus: { QUEUED: 'queued', SUBMITTED: 'submitted', PROCESSING: 'processing', COMPLETED: 'completed', FAILED: 'failed', CANCELLED: 'cancelled', EXPIRED: 'expired' } }));

import { OpenAiCompatibleProvider } from './openai-compatible.provider';

describe('OpenAiCompatibleProvider batch result parsing', () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousUrl = process.env.OPENAI_BASE_URL;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_BASE_URL = 'https://api.example.test/v1';
  });

  afterAll(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousUrl === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = previousUrl;
  });

  it('recognizes completed Chat Completions JSONL output by custom_id regardless of output order', async () => {
    const lines = [
      resultLine('script:second:hash', 'Second hook', 'fact-2', 299, 283),
      resultLine('script:first:hash', 'First hook', 'fact-1', 296, 473),
    ].join('\n');
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed', output_file_id: 'file-output' }), { status: 200 })).mockResolvedValueOnce(new Response(lines, { status: 200 }));

    const results = await new OpenAiCompatibleProvider().getBatchResults('batch-existing');

    expect(results).toEqual([
      expect.objectContaining({ customId: 'script:second:hash', status: 'completed', usage: expect.objectContaining({ inputTokens: 299, outputTokens: 283 }) }),
      expect.objectContaining({ customId: 'script:first:hash', status: 'completed', usage: expect.objectContaining({ inputTokens: 296, outputTokens: 473 }) }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });

  it('maps a provider item error as failed without masking successful siblings', async () => {
    const lines = [
      JSON.stringify({ custom_id: 'script:failed:hash', error: { code: 'invalid_request' } }),
      resultLine('script:valid:hash', 'Hook', 'fact', 1, 2),
    ].join('\n');
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed', output_file_id: 'file-output' }), { status: 200 })).mockResolvedValueOnce(new Response(lines, { status: 200 }));

    const results = await new OpenAiCompatibleProvider().getBatchResults('batch-existing');

    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ customId: 'script:failed:hash', status: 'failed', errorCategory: 'malformed_response', errorCode: 'invalid_request' }),
      expect.objectContaining({ customId: 'script:valid:hash', status: 'completed' }),
    ]));
    fetchMock.mockRestore();
  });
});

function resultLine(customId: string, hook: string, factId: string, inputTokens: number, outputTokens: number) {
  return JSON.stringify({
    custom_id: customId,
    response: {
      status_code: 200,
      body: {
        choices: [{ message: { content: JSON.stringify({ hook, body: 'Body', closing: 'Close', fullScript: 'Script', citedFactIds: [factId] }) } }],
        usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
      },
    },
  });
}
