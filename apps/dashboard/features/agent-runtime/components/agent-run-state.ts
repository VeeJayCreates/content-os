import { AgentRunStatus, type AgentRun } from "@content-os/contracts";

export type AgentRunPresentation = {
  label: string;
  description: string;
  tone: "default" | "success" | "warning" | "muted";
  terminal: boolean;
};

const presentations: Record<AgentRunStatus, AgentRunPresentation> = {
  [AgentRunStatus.QUEUED]: { label: "Queued", description: "Waiting to start", tone: "muted", terminal: false },
  [AgentRunStatus.RUNNING]: { label: "Active", description: "Work is in progress", tone: "default", terminal: false },
  [AgentRunStatus.WAITING]: { label: "Waiting", description: "Paused for an input or dependency", tone: "warning", terminal: false },
  [AgentRunStatus.COMPLETED]: { label: "Completed", description: "Finished successfully", tone: "success", terminal: true },
  [AgentRunStatus.FAILED]: { label: "Failed", description: "Stopped because of a failure", tone: "warning", terminal: true },
  [AgentRunStatus.CANCELLED]: { label: "Cancelled", description: "Stopped before completion", tone: "muted", terminal: true },
};

export function agentRunPresentation(status: AgentRunStatus) {
  return presentations[status];
}

export function orderedActivities<T extends { sequence: number }>(run: Pick<AgentRun, "id"> & { activities: T[] }) {
  return [...run.activities].sort((left, right) => left.sequence - right.sequence);
}

export function subjectLabel(run: Pick<AgentRun, "subjectType" | "subjectId">) {
  if (!run.subjectType && !run.subjectId) return "No subject context";
  if (!run.subjectType) return run.subjectId!;
  if (!run.subjectId) return run.subjectType;
  return `${run.subjectType}: ${run.subjectId}`;
}

export function setDetailLoading(current: Record<string, boolean | undefined>, id: string, loading: boolean) {
  return { ...current, [id]: loading };
}
