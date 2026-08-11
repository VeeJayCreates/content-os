import { Injectable } from '@nestjs/common';
import { AiCapability, AiTask } from '@content-os/contracts';
import type { AiRoute } from './ai-runtime.types';
import { AiRuntimeConfigurationError } from './ai-runtime.types';

const CONTENT_ANGLE_TIMEOUT_MS = 60_000;

@Injectable()
export class ModelRouter {
  route(task: AiTask): AiRoute {
    if (task !== AiTask.CONTENT_ANGLE) {
      throw new AiRuntimeConfigurationError('Unsupported AI task');
    }

    return {
      task,
      provider: process.env.AI_DEFAULT_PROVIDER ?? 'openai',
      model: process.env.AI_CONTENT_ANGLE_MODEL ?? process.env.OPENAI_MODEL ?? null,
      capability: AiCapability.STRUCTURED_GENERATION,
      timeoutMs: CONTENT_ANGLE_TIMEOUT_MS,
      fallback: null,
    };
  }
}

export { CONTENT_ANGLE_TIMEOUT_MS };
