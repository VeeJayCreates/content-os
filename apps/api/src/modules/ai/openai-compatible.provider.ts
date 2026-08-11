import { Injectable, Logger } from '@nestjs/common';
import type { AiProvider, AiProviderRequest, AiProviderResponse, AiUsage } from './ai-runtime.types';
import { AiRuntimeConfigurationError, AiRuntimeProviderError } from './ai-runtime.types';

@Injectable()
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = 'openai';
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

  private usage(body: unknown, response: Response): AiUsage {
    const usage = body && typeof body === 'object' ? Reflect.get(body, 'usage') : undefined;
    return {
      inputTokens: this.integerField(usage, 'prompt_tokens'),
      outputTokens: this.integerField(usage, 'completion_tokens'),
      totalTokens: this.integerField(usage, 'total_tokens'),
      providerRequestId: response.headers.get('x-request-id'),
    };
  }

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
