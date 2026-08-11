import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { AiCostCalculator } from './ai-cost-calculator';
import { AI_PROVIDER, AiRuntime } from './ai-runtime.service';
import { ModelRouter } from './model-router';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { LocalEmbeddingProvider } from './local-embedding.provider';
import { LocalRerankingProvider } from './local-reranking.provider';

@Module({
  imports: [StorageModule],
  providers: [
    ModelRouter,
    AiCostCalculator,
    OpenAiCompatibleProvider,
    LocalEmbeddingProvider,
    LocalRerankingProvider,
    { provide: AI_PROVIDER, useFactory: (cloud: OpenAiCompatibleProvider, embedding: LocalEmbeddingProvider, reranking: LocalRerankingProvider) => [cloud, embedding, reranking], inject: [OpenAiCompatibleProvider, LocalEmbeddingProvider, LocalRerankingProvider] },
    AiRuntime,
  ],
  exports: [AiRuntime, ModelRouter],
})
export class AiRuntimeModule {}
