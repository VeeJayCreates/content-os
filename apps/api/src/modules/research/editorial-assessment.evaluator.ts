import { Injectable, Logger } from '@nestjs/common';

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
export interface EditorialAssessmentEvaluator { assess(input: object): Promise<unknown>; provider: string; model: string | null; }

type ProviderFailure = {
  category: 'http' | 'timeout' | 'network' | 'malformed_json' | 'configuration';
  status?: number;
  code?: string;
  type?: string;
  message?: string;
};

@Injectable()
export class OpenAiEditorialAssessmentEvaluator implements EditorialAssessmentEvaluator {
  private readonly logger = new Logger(OpenAiEditorialAssessmentEvaluator.name);
  readonly provider = 'openai';
  readonly model = process.env.OPENAI_MODEL ?? null;

  async assess(input: object): Promise<unknown> {
    const key = process.env.OPENAI_API_KEY;
    const model = this.model;
    const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    const baseUrlHost = this.baseUrlHost(baseUrl);
    const opportunityId = this.opportunityId(input);
    if (!key || !model) {
      this.logFailure({ category: 'configuration', message: !key && !model ? 'OPENAI_API_KEY and OPENAI_MODEL are missing' : !key ? 'OPENAI_API_KEY is missing' : 'OPENAI_MODEL is missing' }, model, baseUrlHost, key);
      throw new EditorialEvaluatorNotConfiguredError('Editorial evaluator is not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EDITORIAL_ASSESSMENT_TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: EDITORIAL_ASSESSMENT_SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(input) },
          ],
        }),
      });
      if (!response.ok) {
        this.logFailure(await this.httpFailure(response), model, baseUrlHost, key);
        throw new EditorialEvaluatorProviderError('Editorial evaluator request failed');
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        this.logFailure({ category: 'malformed_json', message: 'Provider returned malformed JSON' }, model, baseUrlHost, key);
        throw new EditorialEvaluatorProviderError('Editorial evaluator returned invalid JSON');
      }
      const content = this.content(body);
      if (!content) {
        this.logFailure({ category: 'malformed_json', message: 'Provider returned no structured content' }, model, baseUrlHost, key);
        throw new EditorialEvaluatorProviderError('Editorial evaluator returned no structured content');
      }
      try {
        return JSON.parse(content) as unknown;
      } catch {
        this.logFailure({ category: 'malformed_json', message: 'Provider returned invalid structured JSON' }, model, baseUrlHost, key);
        throw new EditorialEvaluatorProviderError('Editorial evaluator returned invalid JSON');
      }
    } catch (error) {
      const category = error instanceof EditorialEvaluatorNotConfiguredError ? 'not_configured' : error instanceof EditorialEvaluatorProviderError ? 'provider_or_output_validation' : this.isAbort(error) ? 'timeout' : 'network';
      this.logger.warn(JSON.stringify({ stage: 'editorial_assessment.evaluator_catch', opportunityId, model: this.sanitize(model, key), baseUrlHost: this.sanitize(baseUrlHost, key), category }));
      if (error instanceof EditorialEvaluatorNotConfiguredError || error instanceof EditorialEvaluatorProviderError) throw error;
      this.logFailure({ category: this.isAbort(error) ? 'timeout' : 'network', message: this.isAbort(error) ? `Provider request timed out after ${EDITORIAL_ASSESSMENT_TIMEOUT_MS}ms` : 'Provider network request failed' }, model, baseUrlHost, key);
      throw new EditorialEvaluatorProviderError('Editorial evaluator request failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async httpFailure(response: Response): Promise<ProviderFailure> {
    let body: unknown;
    try { body = await response.json(); } catch { body = undefined; }
    const error = body && typeof body === 'object' ? Reflect.get(body, 'error') : undefined;
    const details = error && typeof error === 'object' ? error : body;
    return {
      category: 'http',
      status: response.status,
      code: this.stringField(details, 'code'),
      type: this.stringField(details, 'type'),
      message: this.stringField(details, 'message') ?? this.httpCategory(response.status),
    };
  }

  private logFailure(failure: ProviderFailure, model: string | null, baseUrlHost: string, key: string | undefined) {
    this.logger.warn(JSON.stringify({
      event: 'editorial_assessment_provider_failure',
      category: failure.category,
      status: failure.status,
      providerCode: this.sanitize(failure.code, key),
      providerType: this.sanitize(failure.type, key),
      providerMessage: this.sanitize(failure.message, key),
      model: this.sanitize(model, key),
      baseUrlHost: this.sanitize(baseUrlHost, key),
    }));
  }

  private baseUrlHost(baseUrl: string) {
    try { return new URL(baseUrl).host; } catch { return 'invalid-base-url'; }
  }
  private opportunityId(input: object) {
    const opportunity = Reflect.get(input, 'opportunity');
    const id = opportunity && typeof opportunity === 'object' ? Reflect.get(opportunity, 'id') : undefined;
    return typeof id === 'string' ? id : undefined;
  }
  private stringField(value: unknown, key: string) {
    if (!value || typeof value !== 'object') return undefined;
    const field = Reflect.get(value, key);
    return typeof field === 'string' ? field : undefined;
  }
  private sanitize(value: string | null | undefined, secret: string | undefined) {
    if (!value) return undefined;
    const redacted = secret ? value.split(secret).join('[REDACTED]') : value;
    return redacted.replace(/[\r\n\t]/g, ' ').slice(0, 300);
  }
  private isAbort(error: unknown) { return error instanceof Error && error.name === 'AbortError'; }
  private httpCategory(status: number) {
    if (status === 400) return 'Invalid provider request or model configuration';
    if (status === 401) return 'Provider authentication failed';
    if (status === 403) return 'Provider permission denied';
    if (status === 404) return 'Provider endpoint or model was not found';
    if (status === 429) return 'Provider rate limit, quota, or billing limit reached';
    if (status >= 500) return 'Provider server failure';
    return 'Provider request failed';
  }
  private content(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') return;
    const choices = Reflect.get(value, 'choices');
    if (!Array.isArray(choices) || choices.length === 0) return;
    const message = choices[0] && typeof choices[0] === 'object' ? Reflect.get(choices[0], 'message') : undefined;
    const content = message && typeof message === 'object' ? Reflect.get(message, 'content') : undefined;
    return typeof content === 'string' ? content : undefined;
  }
}
