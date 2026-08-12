import { Injectable } from '@nestjs/common';
import { AiCapability, AiTask } from '@content-os/contracts';
import type { AiRoute } from './ai-runtime.types';
import { AiRuntimeConfigurationError } from './ai-runtime.types';

const CONTENT_ANGLE_TIMEOUT_MS = 60_000;
const LOCAL_EMBEDDING_TIMEOUT_MS = 30_000;
const LOCAL_RERANK_TIMEOUT_MS = 30_000;

@Injectable()
export class ModelRouter {
  route(task: AiTask): AiRoute {
    switch (task) {
      case AiTask.CONTENT_ANGLE:
        return { task, provider: this.cloudProvider(), model: process.env.AI_CONTENT_ANGLE_MODEL ?? process.env.OPENAI_MODEL ?? null, capability: AiCapability.STRUCTURED_GENERATION, timeoutMs: CONTENT_ANGLE_TIMEOUT_MS, costMode: 'configured', fallback: null };
      case AiTask.SCRIPT_GENERATION:
        return { task, provider: this.cloudProvider(), model: process.env.AI_SCRIPT_GENERATION_MODEL ?? process.env.OPENAI_MODEL ?? null, capability: AiCapability.STRUCTURED_GENERATION, timeoutMs: CONTENT_ANGLE_TIMEOUT_MS, costMode: 'configured', fallback: null };
      case AiTask.SEMANTIC_EMBEDDING:
        return { task, provider: 'local-qwen-embedding', model: process.env.AI_LOCAL_EMBEDDING_MODEL ?? 'Qwen3-Embedding-0.6B', capability: AiCapability.EMBEDDING, timeoutMs: this.timeout('AI_LOCAL_EMBEDDING_TIMEOUT_MS', LOCAL_EMBEDDING_TIMEOUT_MS), costMode: 'zero', fallback: null };
      case AiTask.SEMANTIC_RERANKING:
        return { task, provider: 'local-bge-reranker', model: process.env.AI_LOCAL_RERANK_MODEL ?? 'bge-reranker-v2-m3', capability: AiCapability.RERANKING, timeoutMs: this.timeout('AI_LOCAL_RERANK_TIMEOUT_MS', LOCAL_RERANK_TIMEOUT_MS), costMode: 'zero', fallback: null };
      default:
        throw new AiRuntimeConfigurationError('Unsupported AI task');
    }
  }

  private cloudProvider() { return process.env.AI_DEFAULT_PROVIDER === 'openai' ? 'openai-cloud' : process.env.AI_DEFAULT_PROVIDER ?? 'openai-cloud'; }
  private timeout(variable: string, fallback: number) { const value = Number(process.env[variable]); return Number.isSafeInteger(value) && value > 0 && value <= 120_000 ? value : fallback; }
}

export { CONTENT_ANGLE_TIMEOUT_MS, LOCAL_EMBEDDING_TIMEOUT_MS, LOCAL_RERANK_TIMEOUT_MS };
