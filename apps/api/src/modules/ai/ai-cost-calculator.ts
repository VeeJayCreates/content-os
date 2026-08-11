import { Injectable } from '@nestjs/common';
import type { AiPricing, AiUsage } from './ai-runtime.types.js';

@Injectable()
export class AiCostCalculator {
  pricing(): AiPricing {
    return {
      version: process.env.AI_PRICING_VERSION ?? 'unpriced-v1',
      currency: process.env.AI_COST_CURRENCY ?? 'USD',
      inputMicrounitsPerMillionTokens: this.nonNegativeInteger(process.env.AI_OPENAI_INPUT_MICROUNITS_PER_MILLION_TOKENS),
      outputMicrounitsPerMillionTokens: this.nonNegativeInteger(process.env.AI_OPENAI_OUTPUT_MICROUNITS_PER_MILLION_TOKENS),
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
