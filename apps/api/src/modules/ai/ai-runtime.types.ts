import type { AiCapability, AiTask } from '@content-os/contracts';

export type AiRoute = {
  task: AiTask;
  provider: string;
  model: string | null;
  capability: AiCapability;
  timeoutMs: number;
  fallback: null;
};

export type AiUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  providerRequestId: string | null;
};

export type AiStructuredGenerationRequest = {
  task: AiTask;
  projectId: string | null;
  systemPrompt: string;
  input: object;
};

export type AiProviderRequest = AiStructuredGenerationRequest & { route: AiRoute };
export type AiProviderResponse = { output: unknown; usage: AiUsage };

export interface AiProvider {
  readonly name: string;
  structuredGeneration(request: AiProviderRequest): Promise<AiProviderResponse>;
}

export type AiPricing = {
  version: string;
  currency: string;
  inputMicrounitsPerMillionTokens: number | null;
  outputMicrounitsPerMillionTokens: number | null;
};

export class AiRuntimeConfigurationError extends Error {}
export class AiRuntimeProviderError extends Error {
  constructor(
    message: string,
    readonly category: 'provider_http' | 'timeout' | 'network' | 'malformed_response',
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}
