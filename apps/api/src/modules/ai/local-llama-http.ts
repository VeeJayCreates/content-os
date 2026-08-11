import { Logger } from '@nestjs/common';
import { AiRuntimeConfigurationError, AiRuntimeProviderError, type AiRoute, type AiUsage } from './ai-runtime.types';

type LocalEndpoint = { provider: string; baseUrl: string; apiKey: string | undefined };

export abstract class LocalLlamaHttpProvider {
  protected readonly logger = new Logger(this.constructor.name);

  protected async postJson(endpoint: LocalEndpoint, path: string, body: object, task: string, route: AiRoute): Promise<{ body: unknown; usage: AiUsage }> {
    if (!route.model) throw new AiRuntimeConfigurationError('Local AI provider is not configured');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), route.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl(endpoint.baseUrl)}${path}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : {}) },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const failure = await this.httpFailure(response);
        this.logFailure(failure, endpoint, task, route);
        throw new AiRuntimeProviderError('Local AI provider request failed', 'provider_http', failure.status, failure.code);
      }
      try {
        const parsed = await response.json();
        return { body: parsed, usage: this.usage(parsed, response) };
      } catch {
        this.logFailure({ category: 'malformed_response', message: 'Local AI provider returned malformed JSON' }, endpoint, task, route);
        throw new AiRuntimeProviderError('Local AI provider returned invalid JSON', 'malformed_response');
      }
    } catch (error) {
      if (error instanceof AiRuntimeConfigurationError || error instanceof AiRuntimeProviderError) throw error;
      const category = this.isAbort(error) ? 'timeout' : 'network';
      this.logFailure({ category, message: this.isAbort(error) ? `Local AI provider request timed out after ${route.timeoutMs}ms` : 'Local AI provider network request failed' }, endpoint, task, route);
      throw new AiRuntimeProviderError('Local AI provider request failed', category);
    } finally {
      clearTimeout(timeout);
    }
  }

  protected usage(body: unknown, response: Response): AiUsage {
    const usage = body && typeof body === 'object' ? Reflect.get(body, 'usage') : undefined;
    return { inputTokens: this.integerField(usage, 'prompt_tokens'), outputTokens: this.integerField(usage, 'completion_tokens'), totalTokens: this.integerField(usage, 'total_tokens'), providerRequestId: response.headers.get('x-request-id') };
  }

  private async httpFailure(response: Response) {
    let body: unknown;
    try { body = await response.json(); } catch { body = undefined; }
    const error = body && typeof body === 'object' ? Reflect.get(body, 'error') : undefined;
    const details = error && typeof error === 'object' ? error : body;
    return { category: 'provider_http', status: response.status, code: this.stringField(details, 'code'), message: this.stringField(details, 'message') ?? 'Local AI provider request failed' };
  }

  private logFailure(failure: { category: string; status?: number; code?: string; message?: string }, endpoint: LocalEndpoint, task: string, route: AiRoute) {
    this.logger.warn(JSON.stringify({ event: 'local_ai_provider_failure', task, provider: endpoint.provider, category: failure.category, status: failure.status, providerCode: this.short(failure.code), providerMessage: this.short(failure.message), model: this.short(route.model), baseUrlHost: this.host(endpoint.baseUrl) }));
  }

  private baseUrl(value: string) { return value.replace(/\/+$/, ''); }
  private host(value: string) { try { return new URL(value).host; } catch { return 'invalid-base-url'; } }
  private integerField(value: unknown, key: string): number | null { if (!value || typeof value !== 'object') return null; const field = Reflect.get(value, key); return typeof field === 'number' && Number.isSafeInteger(field) && field >= 0 ? field : null; }
  private stringField(value: unknown, key: string): string | undefined { if (!value || typeof value !== 'object') return undefined; const field = Reflect.get(value, key); return typeof field === 'string' ? field : undefined; }
  private short(value: string | null | undefined) { return value?.replace(/[\r\n\t]/g, ' ').slice(0, 300); }
  private isAbort(error: unknown) { return error instanceof Error && error.name === 'AbortError'; }
}
