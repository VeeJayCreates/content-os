import {
  AgentPipelineStage,
  AgentRunStatus,
  AgentTaskStatus,
  type AgentPipeline,
  type AgentRun,
} from "@content-os/contracts";

export type OfficeState =
  | "working"
  | "waiting"
  | "blocked"
  | "failed"
  | "cancelled"
  | "completed"
  | "approval_required";
export type FlowState =
  | "neutral"
  | "queued"
  | "running"
  | "completed"
  | "failed";
export type FlowStage =
  | "Sources"
  | "Research"
  | "Content"
  | "Visuals"
  | "Audio"
  | "Render"
  | "QA"
  | "Approval"
  | "Publish";

export const FLOW_STAGES: FlowStage[] = [
  "Sources",
  "Research",
  "Content",
  "Visuals",
  "Audio",
  "Render",
  "QA",
  "Approval",
  "Publish",
];

function mergeFlowState(current: FlowState, next: FlowState): FlowState {
  const priority: Record<FlowState, number> = {
    neutral: 0,
    queued: 1,
    completed: 2,
    running: 3,
    failed: 4,
  };
  return priority[next] > priority[current] ? next : current;
}

function taskFlowState(status: AgentTaskStatus): FlowState {
  if (status === AgentTaskStatus.FAILED || status === AgentTaskStatus.STALE)
    return "failed";
  if (status === AgentTaskStatus.RUNNING) return "running";
  if (status === AgentTaskStatus.COMPLETED) return "completed";
  return "queued";
}

function evidencedStage(sourceType: string): FlowStage | undefined {
  const source = sourceType.toLowerCase();
  if (source.includes("audio")) return "Audio";
  if (source.includes("render")) return "Render";
  if (source.includes("visual") || source.includes("image")) return "Visuals";
  if (source.includes("approval") || source.includes("review")) return "Approval";
  if (source.includes("publish")) return "Publish";
  if (source.includes("source") || source.includes("feed")) return "Sources";
  if (source.includes("qa") || source.includes("quality")) return "QA";
  return undefined;
}

/** Only persisted tasks/events contribute; stages with no evidence remain neutral. */
export function productionFlowStates(
  pipelines: AgentPipeline[],
): Record<FlowStage, FlowState> {
  const result = Object.fromEntries(
    FLOW_STAGES.map((stage) => [stage, "neutral"]),
  ) as Record<FlowStage, FlowState>;
  const set = (stage: FlowStage, state: FlowState) => {
    result[stage] = mergeFlowState(result[stage], state);
  };
  for (const pipeline of pipelines) {
    for (const task of pipeline.tasks) {
      const state = taskFlowState(task.status);
      if (task.stage === AgentPipelineStage.RESEARCH) set("Research", state);
      if (task.stage === AgentPipelineStage.CONTENT) set("Content", state);
      const taskSubStage = evidencedStage(task.sourceType);
      if (taskSubStage) set(taskSubStage, state);
      for (const event of pipeline.events.filter(
        (candidate) => candidate.taskId === task.id,
      )) {
        const source = event.sourceType.toLowerCase();
        const status = event.sourceStatus.toLowerCase();
        const eventState: FlowState =
          status.includes("fail") || status === "stale"
            ? "failed"
            : status.includes("complete") ||
                status === "ready" ||
                status === "approved"
              ? "completed"
              : status.includes("run") ||
                  status.includes("process") ||
                  status.includes("prepar")
                ? "running"
                : "queued";
        const eventStage = evidencedStage(source);
        if (eventStage) set(eventStage, eventState);
        if (
          source.includes("approval") ||
          status.includes("review") ||
          status.includes("approval")
        )
          set("Approval", eventState);
      }
    }
  }
  return result;
}

export type PipelinePlacement = { stage: FlowStage; state: Exclude<FlowState, "neutral"> };

export function pipelinePlacement(pipeline: AgentPipeline): PipelinePlacement | undefined {
  const states = productionFlowStates([pipeline]);
  for (const state of ["failed", "running", "queued"] as const) {
    const stage = FLOW_STAGES.findLast((candidate) => states[candidate] === state);
    if (stage) return { stage, state };
  }
  const stage = FLOW_STAGES.findLast((candidate) => states[candidate] === "completed");
  return stage ? { stage, state: "completed" } : undefined;
}

export function officeState(
  run?: Pick<AgentRun, "status" | "state">,
  taskStatus?: AgentTaskStatus,
  sourceStatus?: string,
): OfficeState {
  const source = sourceStatus?.toLowerCase() ?? "";
  const state = run?.state ?? {};
  if (
    run?.status === AgentRunStatus.FAILED ||
    taskStatus === AgentTaskStatus.FAILED ||
    state.failure != null ||
    state.error != null
  )
    return "failed";
  if (
    state.blocker ||
    state.blocked === true ||
    taskStatus === AgentTaskStatus.STALE ||
    /^(blocked|dependency_blocked|awaiting_dependency)$/.test(source)
  )
    return "blocked";
  if (
    state.approvalRequired === true ||
    /^(needs_|pending_|awaiting_)(approval|review)$/.test(source) ||
    /^(approval|review)_(required|pending)$/.test(source)
  )
    return "approval_required";
  if (
    taskStatus === AgentTaskStatus.RUNNING ||
    run?.status === AgentRunStatus.RUNNING
  )
    return "working";
  if (
    taskStatus === AgentTaskStatus.COMPLETED ||
    run?.status === AgentRunStatus.COMPLETED
  )
    return "completed";
  if (run?.status === AgentRunStatus.CANCELLED) return "cancelled";
  return "waiting";
}

export function stateEntries(state: Record<string, unknown>, keys: string[]) {
  return keys.flatMap((key) =>
    state[key] == null
      ? []
      : [
          {
            key,
            value:
              typeof state[key] === "string"
                ? (state[key] as string)
                : JSON.stringify(state[key]),
          },
        ],
  );
}

export type AgentRunPresentation = {
  label: string;
  description: string;
  tone: "default" | "success" | "warning" | "muted";
  terminal: boolean;
};

const presentations: Record<AgentRunStatus, AgentRunPresentation> = {
  [AgentRunStatus.QUEUED]: {
    label: "Queued",
    description: "Waiting to start",
    tone: "muted",
    terminal: false,
  },
  [AgentRunStatus.RUNNING]: {
    label: "Active",
    description: "Work is in progress",
    tone: "default",
    terminal: false,
  },
  [AgentRunStatus.WAITING]: {
    label: "Waiting",
    description: "Paused for an input or dependency",
    tone: "warning",
    terminal: false,
  },
  [AgentRunStatus.COMPLETED]: {
    label: "Completed",
    description: "Finished successfully",
    tone: "success",
    terminal: true,
  },
  [AgentRunStatus.FAILED]: {
    label: "Failed",
    description: "Stopped because of a failure",
    tone: "warning",
    terminal: true,
  },
  [AgentRunStatus.CANCELLED]: {
    label: "Cancelled",
    description: "Stopped before completion",
    tone: "muted",
    terminal: true,
  },
};

export function agentRunPresentation(status: AgentRunStatus) {
  return presentations[status];
}

export function orderedActivities<T extends { sequence: number }>(
  run: Pick<AgentRun, "id"> & { activities: T[] },
) {
  return [...run.activities].sort(
    (left, right) => left.sequence - right.sequence,
  );
}

export function subjectLabel(run: Pick<AgentRun, "subjectType" | "subjectId">) {
  if (!run.subjectType && !run.subjectId) return "No subject context";
  if (!run.subjectType) return run.subjectId!;
  if (!run.subjectId) return run.subjectType;
  return `${run.subjectType}: ${run.subjectId}`;
}

export function setDetailLoading(
  current: Record<string, boolean | undefined>,
  id: string,
  loading: boolean,
) {
  return { ...current, [id]: loading };
}
