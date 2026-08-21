import type { AgentPipeline } from '@content-os/contracts';
import { Logger } from '@nestjs/common';

export const AGENT_PIPELINE_BRIDGE = Symbol('AGENT_PIPELINE_BRIDGE');
export interface AgentPipelineBridge { synchronize(productionQueueItemId: string): Promise<AgentPipeline>; synchronizeContentScript(contentScriptId: string): Promise<AgentPipeline>; }

/** Agent pipeline state observes source-of-truth workflows and must never own their outcome. */
export async function observeAgentPipeline(operation: Promise<unknown> | undefined): Promise<void> {
  await operation?.catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    Logger.error(`Agent pipeline observation failed: ${detail.slice(0, 500)}`, 'AgentPipelineBridge');
  });
}
