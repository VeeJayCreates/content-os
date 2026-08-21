import type { AgentPipelineEventType, AgentPipelineStage, AgentTaskStatus } from './enums.js';

export interface AgentTask {
  id: string; projectId: string; stage: AgentPipelineStage; agentKey: string;
  sourceType: string; sourceId: string; status: AgentTaskStatus;
  sourceStatus: string; createdAt: string; updatedAt: string;
}
export interface AgentTaskEvent {
  id: string; taskId: string; type: AgentPipelineEventType; sourceType: string;
  sourceId: string; sourceStatus: string; occurredAt: string;
}
export interface AgentHandoff {
  id: string; fromTaskId: string; toTaskId: string; sourceType: string;
  sourceId: string; createdAt: string;
}
export interface AgentPipeline {
  productionQueueItemId: string; tasks: AgentTask[]; events: AgentTaskEvent[]; handoffs: AgentHandoff[];
}
