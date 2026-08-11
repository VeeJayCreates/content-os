import { Injectable } from '@nestjs/common';
import { AiTask } from '@content-os/contracts';
import { AiRuntime } from '../ai/ai-runtime.service';
import { AiRuntimeConfigurationError, AiRuntimeProviderError } from '../ai/ai-runtime.types';

export const EDITORIAL_ASSESSMENT_EVALUATOR = Symbol('EDITORIAL_ASSESSMENT_EVALUATOR');
export const EDITORIAL_ASSESSMENT_PROMPT_VERSION = 'content-angle-v1';
export const EDITORIAL_ASSESSMENT_TIMEOUT_MS = 60_000;
export const EDITORIAL_ASSESSMENT_SYSTEM_PROMPT = `You create one defensible video idea and assess its editorial suitability. You assess editorial suitability, not factual truth. A misleading or unverified claim can still warrant a fact_check, explainer, analysis, or update angle; do not amplify unsupported claims as fact. Use only supplied structured context. Do not invent facts or citations. Research Confidence is fixed.

Return JSON only. Use this exact shape:
{
  "relevance": "low | medium | high",
  "newsworthiness": "low | medium | high",
  "contentPotential": "low | medium | high",
  "angleType": "breaking | explainer | fact_check | analysis | update",
  "videoIdeaTitle": "concise working title",
  "videoIdeaSummary": "1-3 concise sentences",
  "hook": "short opening premise",
  "whyNow": "why this angle matters now",
  "longevity": "breaking | timely | evergreen",
  "duplicationRisk": "low | medium | high",
  "recommendation": "reject | hold | consider | strong_candidate",
  "rationale": "concise explanation",
  "citedFactIds": ["fact-id"],
  "citedSignalIds": ["signal-id"]
}

Allowed values:
- relevance: low, medium, high
- newsworthiness: low, medium, high
- contentPotential: low, medium, high
- angleType: breaking, explainer, fact_check, analysis, update
- longevity: breaking, timely, evergreen
- duplicationRisk: low, medium, high
- recommendation: reject, hold, consider, strong_candidate

Do not use low/medium/high for longevity.`;

export class EditorialEvaluatorNotConfiguredError extends Error {}
export class EditorialEvaluatorProviderError extends Error {}
export interface EditorialAssessmentEvaluator { assess(input: object, projectId?: string): Promise<unknown>; provider: string; model: string | null; }

@Injectable()
export class OpenAiEditorialAssessmentEvaluator implements EditorialAssessmentEvaluator {
  constructor(private readonly runtime: AiRuntime) {}

  get provider() { return this.runtime.route(AiTask.CONTENT_ANGLE).provider; }
  get model() { return this.runtime.route(AiTask.CONTENT_ANGLE).model; }

  async assess(input: object, projectId?: string): Promise<unknown> {
    try {
      return await this.runtime.structuredGeneration({
        task: AiTask.CONTENT_ANGLE,
        projectId: projectId ?? null,
        systemPrompt: EDITORIAL_ASSESSMENT_SYSTEM_PROMPT,
        input,
      });
    } catch (error) {
      if (error instanceof AiRuntimeConfigurationError) throw new EditorialEvaluatorNotConfiguredError('Editorial evaluator is not configured');
      if (error instanceof AiRuntimeProviderError) throw new EditorialEvaluatorProviderError('Editorial evaluator request failed');
      throw error;
    }
  }
}
