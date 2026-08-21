import assert from "node:assert/strict";
import test from "node:test";
import { AgentPipelineStage, AgentRunStatus, AgentTaskStatus, type AgentPipeline } from "@content-os/contracts";
import { agentRunPresentation, officeState, orderedActivities, pipelinePlacement, productionFlowStates, setDetailLoading, stateEntries, subjectLabel } from "./agent-run-state.ts";

test("maps every lifecycle status to an honest terminal presentation", () => {
  const expected = [
    [AgentRunStatus.QUEUED, "Queued", false], [AgentRunStatus.RUNNING, "Active", false],
    [AgentRunStatus.WAITING, "Waiting", false], [AgentRunStatus.COMPLETED, "Completed", true],
    [AgentRunStatus.FAILED, "Failed", true], [AgentRunStatus.CANCELLED, "Cancelled", true],
  ] as const;
  for (const [status, label, terminal] of expected) assert.deepEqual({ label: agentRunPresentation(status).label, terminal: agentRunPresentation(status).terminal }, { label, terminal });
});

test("orders activity without mutating API data and formats subject context", () => {
  const activities = [{ sequence: 3 }, { sequence: 1 }, { sequence: 2 }];
  assert.deepEqual(orderedActivities({ id: "run", activities }).map((item) => item.sequence), [1, 2, 3]);
  assert.deepEqual(activities.map((item) => item.sequence), [3, 1, 2]);
  assert.equal(subjectLabel({ subjectType: "topic", subjectId: "alpha" }), "topic: alpha");
  assert.equal(subjectLabel({ subjectType: null, subjectId: null }), "No subject context");
});

test("tracks overlapping detail requests independently", () => {
  let loading: Record<string, boolean | undefined> = {};
  loading = setDetailLoading(loading, "run-a", true);
  loading = setDetailLoading(loading, "run-b", true);
  loading = setDetailLoading(loading, "run-a", false);

  assert.equal(loading["run-a"], false);
  assert.equal(loading["run-b"], true);
});

test("renders every Digital Office operational state from persisted data", () => {
  const run = (status: AgentRunStatus, state: Record<string, unknown> = {}) => ({ status, state });
  assert.equal(officeState(run(AgentRunStatus.RUNNING)), "working");
  assert.equal(officeState(run(AgentRunStatus.WAITING)), "waiting");
  assert.equal(officeState(run(AgentRunStatus.WAITING, { blocker: "source unavailable" })), "blocked");
  assert.equal(officeState(run(AgentRunStatus.FAILED)), "failed");
  assert.equal(officeState(run(AgentRunStatus.CANCELLED)), "cancelled");
  assert.equal(officeState(run(AgentRunStatus.COMPLETED)), "completed");
  assert.equal(officeState(run(AgentRunStatus.WAITING), undefined, "needs_review"), "approval_required");
});

test("failed and blocked evidence takes precedence over approval-like source text", () => {
  const waiting = { status: AgentRunStatus.WAITING, state: {} };
  assert.equal(officeState(waiting, AgentTaskStatus.FAILED, "approval_failed"), "failed");
  assert.equal(officeState(waiting, AgentTaskStatus.FAILED, "review_failed"), "failed");
  assert.equal(
    officeState({ status: AgentRunStatus.FAILED, state: { approvalRequired: true } }, undefined, "pending_approval"),
    "failed",
  );
  assert.equal(
    officeState({ status: AgentRunStatus.WAITING, state: { blocker: "legal review" } }, undefined, "pending_review"),
    "blocked",
  );
  assert.equal(officeState(waiting, undefined, "approval_complete"), "waiting");
});

test("room drill-down exposes persisted decisions, artifacts, blockers, retries, and failures", () => {
  const entries = stateEntries({ decision: "use cited source", artifacts: ["script-1"], blocker: "approval", retryCount: 2, failure: "provider timeout", ignored: "private" }, ["decision", "artifacts", "blocker", "retryCount", "failure"]);
  assert.deepEqual(entries.map((entry) => entry.key), ["decision", "artifacts", "blocker", "retryCount", "failure"]);
  assert.equal(entries.find((entry) => entry.key === "artifacts")?.value, '["script-1"]');
  assert.equal(entries.some((entry) => entry.key === "ignored"), false);
});

test("production flow derives queued, running, completed, failed, and absent stages from persisted tasks", () => {
  const pipeline = (status: AgentTaskStatus, stage = AgentPipelineStage.RESEARCH): AgentPipeline => ({
    productionQueueItemId: `item-${status}`,
    tasks: [{ id: `task-${status}`, projectId: "project", stage, agentKey: "research_agent", sourceType: "research_package", sourceId: "source", status, sourceStatus: status, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
    events: [], handoffs: [],
  });
  assert.equal(productionFlowStates([pipeline(AgentTaskStatus.QUEUED)]).Research, "queued");
  assert.equal(productionFlowStates([pipeline(AgentTaskStatus.RUNNING)]).Research, "running");
  assert.equal(productionFlowStates([pipeline(AgentTaskStatus.COMPLETED)]).Research, "completed");
  assert.equal(productionFlowStates([pipeline(AgentTaskStatus.FAILED)]).Research, "failed");
  const absent = productionFlowStates([]);
  assert.equal(absent.Sources, "neutral");
  assert.equal(absent.Research, "neutral");
  assert.equal(absent.Content, "neutral");
});

test("production sub-stages require persisted event evidence", () => {
  const pipeline: AgentPipeline = {
    productionQueueItemId: "item",
    tasks: [{ id: "production", projectId: "project", stage: AgentPipelineStage.PRODUCTION, agentKey: "production_agent", sourceType: "content_script", sourceId: "script", status: AgentTaskStatus.RUNNING, sourceStatus: "ready", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
    events: [{ id: "render-event", taskId: "production", type: "source_status_changed" as never, sourceType: "video_render_job", sourceId: "render", sourceStatus: "failed", occurredAt: "2026-01-01T00:00:00Z" }],
    handoffs: [],
  };
  const states = productionFlowStates([pipeline]);
  assert.equal(states.Visuals, "neutral");
  assert.equal(states.Render, "failed");
  assert.equal(states.Audio, "neutral");
  assert.equal(states.Approval, "neutral");
  assert.equal(states.Publish, "neutral");
});

test("render-only production tasks never imply visual activity", () => {
  const renderOnly: AgentPipeline = {
    productionQueueItemId: "render-only",
    tasks: [{ id: "render", projectId: "project", stage: AgentPipelineStage.PRODUCTION, agentKey: "production_agent", sourceType: "video_render_job", sourceId: "render", status: AgentTaskStatus.FAILED, sourceStatus: "failed", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
    events: [], handoffs: [],
  };
  const states = productionFlowStates([renderOnly]);
  assert.equal(states.Visuals, "neutral");
  assert.equal(states.Render, "failed");
  assert.deepEqual(pipelinePlacement(renderOnly), { stage: "Render", state: "failed" });
});
