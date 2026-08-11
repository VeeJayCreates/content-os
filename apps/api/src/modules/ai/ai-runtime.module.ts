import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { AiCostCalculator } from './ai-cost-calculator';
import { AI_PROVIDER, AiRuntime } from './ai-runtime.service';
import { ModelRouter } from './model-router';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

@Module({
  imports: [StorageModule],
  providers: [
    ModelRouter,
    AiCostCalculator,
    OpenAiCompatibleProvider,
    { provide: AI_PROVIDER, useFactory: (provider: OpenAiCompatibleProvider) => [provider], inject: [OpenAiCompatibleProvider] },
    AiRuntime,
  ],
  exports: [AiRuntime, ModelRouter],
})
export class AiRuntimeModule {}
