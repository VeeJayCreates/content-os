import { AiBatchItemStatus, AiBatchStatus, AiCapability, AiExecutionMode, AiExecutionStatus, AiTask } from './enums.js';

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

export interface AiBatchItem {
  id: string;
  batchId: string;
  customId: string;
  projectId: string | null;
  entityType: string;
  entityId: string;
  requestIndex: number;
  promptHash: string;
  status: AiBatchItemStatus;
  errorCategory: string | null;
  errorCode: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostMicrounits: number | null;
  costCurrency: string | null;
  pricingVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiBatch {
  id: string;
  provider: string;
  providerBatchId: string | null;
  task: AiTask;
  model: string | null;
  executionMode: AiExecutionMode;
  status: AiBatchStatus;
  requestCount: number;
  submittedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: AiBatchItem[];
}
