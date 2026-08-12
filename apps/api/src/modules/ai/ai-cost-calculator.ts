import { Injectable } from '@nestjs/common';
import type { AiPricing, AiUsage } from './ai-runtime.types.js';

@Injectable()
export class AiCostCalculator {
  pricing(model?: string, mode: 'synchronous' | 'batch' = 'synchronous'): AiPricing {
    const configured = this.fromEnvironment(mode);
    if (configured.inputMicrounitsPerMillionTokens !== null || configured.outputMicrounitsPerMillionTokens !== null) return configured;
    const rate = model === 'gpt-5.4-mini' ? [750_000, 4_500_000] : model === 'gpt-5.4-nano' ? [200_000, 1_250_000] : undefined;
    const multiplier = mode === 'batch' ? 0.5 : 1;
    return rate ? { version: `openai-gpt-5.4-${mode}-2026-03`, currency: 'USD', inputMicrounitsPerMillionTokens: Math.round(rate[0] * multiplier), outputMicrounitsPerMillionTokens: Math.round(rate[1] * multiplier) } : configured;
  }

  private fromEnvironment(mode: 'synchronous' | 'batch'): AiPricing {
    const prefix = mode === 'batch' ? 'AI_OPENAI_BATCH_' : 'AI_OPENAI_';
    return {
      version: process.env[mode === 'batch' ? 'AI_BATCH_PRICING_VERSION' : 'AI_PRICING_VERSION'] ?? 'unpriced-v1',
      currency: process.env.AI_COST_CURRENCY ?? 'USD',
      inputMicrounitsPerMillionTokens: this.nonNegativeInteger(process.env[`${prefix}INPUT_MICROUNITS_PER_MILLION_TOKENS`]),
      outputMicrounitsPerMillionTokens: this.nonNegativeInteger(process.env[`${prefix}OUTPUT_MICROUNITS_PER_MILLION_TOKENS`]),
    };
  }

  estimate(usage: AiUsage, pricing: AiPricing): number | null {
    if (usage.inputTokens === null || usage.outputTokens === null || pricing.inputMicrounitsPerMillionTokens === null || pricing.outputMicrounitsPerMillionTokens === null) {
      return null;
    }
    return Math.round((usage.inputTokens * pricing.inputMicrounitsPerMillionTokens + usage.outputTokens * pricing.outputMicrounitsPerMillionTokens) / 1_000_000);
  }

  private nonNegativeInteger(value: string | undefined): number | null {
    if (!value || !/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
}
