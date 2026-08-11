import { AiCapability, AiExecutionStatus, AiTask } from './enums.js';

export interface AiExecution {
  id: string;
  projectId: string | null;
  task: AiTask;
  provider: string;
  model: string | null;
  capability: AiCapability;
  status: AiExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostMicrounits: number | null;
  costCurrency: string | null;
  pricingVersion: string | null;
  cacheHit: boolean;
  providerCallMade: boolean;
  failureCategory: string | null;
  failureCode: string | null;
  providerRequestId: string | null;
  createdAt: string;
}
