import type { AgentActivityType, AgentRunStatus } from './enums.js';

export type AgentState = Record<string, unknown>;

export interface AgentRun {
  id: string;
  agentKey: string;
  projectId: string | null;
  subjectType: string | null;
  subjectId: string | null;
  status: AgentRunStatus;
  currentActivity: string | null;
  state: AgentState;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentActivity {
  id: string;
  runId: string;
  sequence: number;
  type: AgentActivityType;
  message: string;
  state: AgentState | null;
  createdAt: string;
}

export interface AgentRunDetail extends AgentRun {
  activities: AgentActivity[];
}
