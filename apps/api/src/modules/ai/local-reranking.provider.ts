import { Injectable } from '@nestjs/common';
import type { AiRerankingProvider, AiRerankingRequest, AiRerankingResponse, AiRoute } from './ai-runtime.types';
import { AiRuntimeProviderError } from './ai-runtime.types';
import { LocalLlamaHttpProvider } from './local-llama-http';

@Injectable()
export class LocalRerankingProvider extends LocalLlamaHttpProvider implements AiRerankingProvider {
  readonly name = 'local-bge-reranker';

  async rerank(request: AiRerankingRequest & { route: AiRoute }): Promise<AiRerankingResponse> {
    const response = await this.postJson({ provider: this.name, baseUrl: process.env.AI_LOCAL_RERANK_BASE_URL ?? 'http://127.0.0.1:8083', apiKey: process.env.AI_LOCAL_RERANK_API_KEY }, '/v1/rerank', { model: request.route.model, query: request.query, documents: request.documents, top_n: request.documents.length }, request.task, request.route);
    const rawResults = response.body && typeof response.body === 'object' ? Reflect.get(response.body, 'results') : undefined;
    if (!Array.isArray(rawResults) || rawResults.length !== request.documents.length) throw new AiRuntimeProviderError('Local reranking provider returned invalid results', 'malformed_response');
    const seen = new Set<number>();
    const results = rawResults.map((item) => {
      const index = item && typeof item === 'object' ? Reflect.get(item, 'index') : undefined;
      const relevanceScore = item && typeof item === 'object' ? Reflect.get(item, 'relevance_score') : undefined;
      if (!Number.isInteger(index) || index < 0 || index >= request.documents.length || seen.has(index) || typeof relevanceScore !== 'number' || !Number.isFinite(relevanceScore)) throw new AiRuntimeProviderError('Local reranking provider returned invalid results', 'malformed_response');
      seen.add(index);
      return { index, relevanceScore };
    });
    results.sort((left, right) => right.relevanceScore - left.relevanceScore || left.index - right.index);
    return { results, usage: response.usage };
  }
}
