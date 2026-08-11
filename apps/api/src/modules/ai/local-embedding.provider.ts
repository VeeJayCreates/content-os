import { Injectable } from '@nestjs/common';
import type { AiEmbeddingProvider, AiEmbeddingResponse, AiEmbeddingRequest, AiRoute } from './ai-runtime.types';
import { AiRuntimeProviderError } from './ai-runtime.types';
import { LocalLlamaHttpProvider } from './local-llama-http';

@Injectable()
export class LocalEmbeddingProvider extends LocalLlamaHttpProvider implements AiEmbeddingProvider {
  readonly name = 'local-qwen-embedding';

  async embed(request: AiEmbeddingRequest & { route: AiRoute }): Promise<AiEmbeddingResponse> {
    const response = await this.postJson({ provider: this.name, baseUrl: process.env.AI_LOCAL_EMBEDDING_BASE_URL ?? 'http://127.0.0.1:8082', apiKey: process.env.AI_LOCAL_EMBEDDING_API_KEY }, '/v1/embeddings', { model: request.route.model, input: request.texts }, request.task, request.route);
    const data = response.body && typeof response.body === 'object' ? Reflect.get(response.body, 'data') : undefined;
    if (!Array.isArray(data) || data.length !== request.texts.length) throw new AiRuntimeProviderError('Local embedding provider returned invalid vectors', 'malformed_response');
    const vectors = new Array<number[]>(request.texts.length);
    let dimensions: number | null = null;
    for (const item of data) {
      const index = item && typeof item === 'object' ? Reflect.get(item, 'index') : undefined;
      const vector = item && typeof item === 'object' ? Reflect.get(item, 'embedding') : undefined;
      if (!Number.isInteger(index) || index < 0 || index >= vectors.length || vectors[index] || !Array.isArray(vector) || vector.length === 0 || !vector.every((value) => typeof value === 'number' && Number.isFinite(value))) {
        throw new AiRuntimeProviderError('Local embedding provider returned invalid vectors', 'malformed_response');
      }
      if (dimensions !== null && vector.length !== dimensions) throw new AiRuntimeProviderError('Local embedding provider returned inconsistent vector dimensions', 'malformed_response');
      dimensions ??= vector.length;
      vectors[index] = vector;
    }
    if (dimensions === null || vectors.some((vector) => !vector)) throw new AiRuntimeProviderError('Local embedding provider returned invalid vectors', 'malformed_response');
    return { embeddings: vectors, dimensions, usage: response.usage };
  }
}
