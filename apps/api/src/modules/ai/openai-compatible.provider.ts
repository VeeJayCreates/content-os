import { Injectable, Logger } from '@nestjs/common';
import type { AiBatchProviderResult, AiBatchProviderStatus, AiBatchSubmitRequest, AiProviderRequest, AiProviderResponse, AiStructuredGenerationProvider, AiUsage } from './ai-runtime.types';
import { AiRuntimeConfigurationError, AiRuntimeProviderError } from './ai-runtime.types';
import { AiBatchStatus } from '@content-os/contracts';

@Injectable()
export class OpenAiCompatibleProvider implements AiStructuredGenerationProvider {
  readonly name = 'openai-cloud';
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);

  async structuredGeneration(request: AiProviderRequest): Promise<AiProviderResponse> {
    const key = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    const baseUrlHost = this.baseUrlHost(baseUrl);
    if (!key || !request.route.model) {
      this.logFailure({ category: 'configuration', message: !key && !request.route.model ? 'OPENAI_API_KEY and model are missing' : !key ? 'OPENAI_API_KEY is missing' : 'model is missing' }, request, baseUrlHost, key);
      throw new AiRuntimeConfigurationError('AI provider is not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.route.timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.route.model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: JSON.stringify(request.input) },
          ],
        }),
      });
      if (!response.ok) {
        const failure = await this.httpFailure(response);
        this.logFailure(failure, request, baseUrlHost, key);
        throw new AiRuntimeProviderError('AI provider request failed', 'provider_http', failure.status, failure.code);
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        this.logFailure({ category: 'malformed_response', message: 'Provider returned malformed JSON' }, request, baseUrlHost, key);
        throw new AiRuntimeProviderError('AI provider returned invalid JSON', 'malformed_response');
      }
      const content = this.content(body);
      if (!content) {
        this.logFailure({ category: 'malformed_response', message: 'Provider returned no structured content' }, request, baseUrlHost, key);
        throw new AiRuntimeProviderError('AI provider returned no structured content', 'malformed_response');
      }
      try {
        return { output: JSON.parse(content) as unknown, usage: this.usage(body, response) };
      } catch {
        this.logFailure({ category: 'malformed_response', message: 'Provider returned invalid structured JSON' }, request, baseUrlHost, key);
        throw new AiRuntimeProviderError('AI provider returned invalid JSON', 'malformed_response');
      }
    } catch (error) {
      if (error instanceof AiRuntimeConfigurationError || error instanceof AiRuntimeProviderError) throw error;
      const category = this.isAbort(error) ? 'timeout' : 'network';
      this.logFailure({ category, message: this.isAbort(error) ? `Provider request timed out after ${request.route.timeoutMs}ms` : 'Provider network request failed' }, request, baseUrlHost, key);
      throw new AiRuntimeProviderError('AI provider request failed', category);
    } finally {
      clearTimeout(timeout);
    }
  }

  async submitBatch(request: AiBatchSubmitRequest): Promise<{ providerBatchId: string }> {
    const { key, baseUrl } = this.configuration();
    const lines = request.items.map((item) => JSON.stringify({ custom_id: item.customId, method: 'POST', url: '/v1/chat/completions', body: { model: request.model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: item.systemPrompt }, { role: 'user', content: JSON.stringify(item.input) }] } })).join('\n');
    const form = new FormData(); form.set('purpose', 'batch'); form.set('file', new Blob([lines], { type: 'application/jsonl' }), 'content-os-batch.jsonl');
    const file = await this.fetchJson(`${baseUrl}/files`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
    const fileId = this.stringField(file, 'id'); if (!fileId) throw new AiRuntimeProviderError('Batch input file was not accepted', 'malformed_response');
    const batch = await this.fetchJson(`${baseUrl}/batches`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ input_file_id: fileId, endpoint: '/v1/chat/completions', completion_window: request.completionWindow }) });
    const batchId = this.stringField(batch, 'id'); if (!batchId) throw new AiRuntimeProviderError('Batch submission returned no ID', 'malformed_response'); return { providerBatchId: batchId };
  }

  async getBatchStatus(providerBatchId: string): Promise<AiBatchProviderStatus> {
    const { key, baseUrl } = this.configuration(); const body = await this.fetchJson(`${baseUrl}/batches/${encodeURIComponent(providerBatchId)}`, { headers: { Authorization: `Bearer ${key}` } });
    return { providerBatchId, status: this.batchStatus(this.stringField(body, 'status')), outputFileId: this.stringField(body, 'output_file_id') ?? null, errorCategory: null, errorCode: null };
  }

  async getBatchResults(providerBatchId: string): Promise<AiBatchProviderResult[]> {
    const status = await this.getBatchStatus(providerBatchId); if (status.status !== 'completed' || !status.outputFileId) return [];
    const { key, baseUrl } = this.configuration(); const response = await fetch(`${baseUrl}/files/${encodeURIComponent(status.outputFileId)}/content`, { headers: { Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new AiRuntimeProviderError('Batch results could not be retrieved', 'provider_http', response.status);
    const text = await response.text(); return text.split(/\r?\n/).filter(Boolean).map((line) => this.batchResult(line));
  }

  async cancelBatch(providerBatchId: string): Promise<AiBatchProviderStatus> { const { key, baseUrl } = this.configuration(); await this.fetchJson(`${baseUrl}/batches/${encodeURIComponent(providerBatchId)}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${key}` } }); return this.getBatchStatus(providerBatchId); }

  private usage(body: unknown, response: Response): AiUsage {
    const usage = body && typeof body === 'object' ? Reflect.get(body, 'usage') : undefined;
    return {
      inputTokens: this.integerField(usage, 'prompt_tokens'),
      outputTokens: this.integerField(usage, 'completion_tokens'),
      totalTokens: this.integerField(usage, 'total_tokens'),
      providerRequestId: response.headers.get('x-request-id'),
    };
  }
  private configuration() { const key = process.env.OPENAI_API_KEY; const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'; if (!key) throw new AiRuntimeConfigurationError('AI provider is not configured'); return { key, baseUrl }; }
  private async fetchJson(url: string, init: RequestInit): Promise<unknown> { const response = await fetch(url, init); if (!response.ok) throw new AiRuntimeProviderError('AI provider batch request failed', 'provider_http', response.status); try { return await response.json(); } catch { throw new AiRuntimeProviderError('AI provider returned invalid JSON', 'malformed_response'); } }
  private batchStatus(value: string | undefined): AiBatchProviderStatus['status'] { if (value === 'in_progress' || value === 'finalizing') return AiBatchStatus.PROCESSING; if (value === 'validating') return AiBatchStatus.SUBMITTED; if (value === 'completed') return AiBatchStatus.COMPLETED; if (value === 'failed') return AiBatchStatus.FAILED; if (value === 'cancelled') return AiBatchStatus.CANCELLED; if (value === 'expired') return AiBatchStatus.EXPIRED; return AiBatchStatus.QUEUED; }
  private batchResult(line: string): AiBatchProviderResult { try { const row = JSON.parse(line) as { custom_id?: unknown; response?: { body?: unknown }; error?: { code?: unknown } }; const customId = typeof row.custom_id === 'string' ? row.custom_id : ''; const body = row.response?.body; const content = this.content(body); const usage = body && typeof body === 'object' ? { inputTokens: this.integerField(Reflect.get(body, 'usage'), 'prompt_tokens'), outputTokens: this.integerField(Reflect.get(body, 'usage'), 'completion_tokens'), totalTokens: this.integerField(Reflect.get(body, 'usage'), 'total_tokens'), providerRequestId: null } : { inputTokens: null, outputTokens: null, totalTokens: null, providerRequestId: null }; if (!customId || !content) return { customId, status: 'failed', errorCategory: 'malformed_response', errorCode: typeof row.error?.code === 'string' ? row.error.code : null, usage }; return { customId, status: 'completed', output: JSON.parse(content), usage }; } catch { return { customId: '', status: 'failed', errorCategory: 'malformed_response', errorCode: null, usage: { inputTokens: null, outputTokens: null, totalTokens: null, providerRequestId: null } }; } }

  private async httpFailure(response: Response) {
    let body: unknown;
    try { body = await response.json(); } catch { body = undefined; }
    const error = body && typeof body === 'object' ? Reflect.get(body, 'error') : undefined;
    const details = error && typeof error === 'object' ? error : body;
    return { category: 'provider_http', status: response.status, code: this.stringField(details, 'code'), type: this.stringField(details, 'type'), message: this.stringField(details, 'message') ?? this.httpCategory(response.status) };
  }

  private logFailure(failure: { category: string; status?: number; code?: string; type?: string; message?: string }, request: AiProviderRequest, baseUrlHost: string, key: string | undefined) {
    this.logger.warn(JSON.stringify({ event: 'ai_provider_failure', task: request.task, category: failure.category, status: failure.status, providerCode: this.sanitize(failure.code, key), providerType: this.sanitize(failure.type, key), providerMessage: this.sanitize(failure.message, key), model: this.sanitize(request.route.model, key), baseUrlHost: this.sanitize(baseUrlHost, key) }));
  }

  private content(value: unknown): string | undefined { if (!value || typeof value !== 'object') return; const choices = Reflect.get(value, 'choices'); if (!Array.isArray(choices) || choices.length === 0) return; const message = choices[0] && typeof choices[0] === 'object' ? Reflect.get(choices[0], 'message') : undefined; const content = message && typeof message === 'object' ? Reflect.get(message, 'content') : undefined; return typeof content === 'string' ? content : undefined; }
  private integerField(value: unknown, key: string): number | null { if (!value || typeof value !== 'object') return null; const field = Reflect.get(value, key); return typeof field === 'number' && Number.isSafeInteger(field) && field >= 0 ? field : null; }
  private stringField(value: unknown, key: string): string | undefined { if (!value || typeof value !== 'object') return undefined; const field = Reflect.get(value, key); return typeof field === 'string' ? field : undefined; }
  private baseUrlHost(baseUrl: string) { try { return new URL(baseUrl).host; } catch { return 'invalid-base-url'; } }
  private sanitize(value: string | null | undefined, secret: string | undefined) { if (!value) return undefined; const redacted = secret ? value.split(secret).join('[REDACTED]') : value; return redacted.replace(/[\r\n\t]/g, ' ').slice(0, 300); }
  private isAbort(error: unknown) { return error instanceof Error && error.name === 'AbortError'; }
  private httpCategory(status: number) { if (status === 400) return 'Invalid provider request or model configuration'; if (status === 401) return 'Provider authentication failed'; if (status === 403) return 'Provider permission denied'; if (status === 404) return 'Provider endpoint or model was not found'; if (status === 429) return 'Provider rate limit, quota, or billing limit reached'; if (status >= 500) return 'Provider server failure'; return 'Provider request failed'; }
}
