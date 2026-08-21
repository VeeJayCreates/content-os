import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AgentActivityType,
  AgentPipelineEventType,
  AgentPipelineStage,
  AgentRunStatus,
  AgentTaskStatus,
  type AgentPipeline,
  type AgentRun,
  type AgentRunDetail,
} from "@content-os/contracts";
import { DigitalOffice, runtimeContext } from "./agent-run-view";

const at = "2026-08-21T10:00:00.000Z";
const run = (
  id: string,
  agentKey: string,
  status: AgentRunStatus,
  itemId: string,
  state: Record<string, unknown> = {},
): AgentRun => ({
  id,
  agentKey,
  projectId: "project",
  subjectType: "production_queue_item",
  subjectId: itemId,
  status,
  currentActivity: `${agentKey} current task`,
  state,
  startedAt: at,
  completedAt: status === AgentRunStatus.COMPLETED ? at : null,
  createdAt: at,
  updatedAt: at,
});

const pipeline = (
  itemId: string,
  taskId: string,
  sourceStatus: string,
  updatedAt = at,
): AgentPipeline => ({
  productionQueueItemId: itemId,
  tasks: [{
    id: taskId,
    projectId: "project",
    stage: AgentPipelineStage.RESEARCH,
    agentKey: "research_agent",
    sourceType: "research_package",
    sourceId: `${itemId}-source`,
    status: AgentTaskStatus.RUNNING,
    sourceStatus,
    createdAt: updatedAt,
    updatedAt,
  }],
  events: [{
    id: `${taskId}-event`,
    taskId,
    type: AgentPipelineEventType.SOURCE_STATUS_CHANGED,
    sourceType: "research_package",
    sourceId: `${itemId}-source`,
    sourceStatus,
    occurredAt: updatedAt,
  }],
  handoffs: [{
    id: `${taskId}-handoff`,
    fromTaskId: taskId,
    toTaskId: `${taskId}-next`,
    sourceType: "research_package",
    sourceId: `${itemId}-source`,
    createdAt: updatedAt,
  }],
});

function findElement(
  value: React.ReactNode,
  predicate: (element: React.ReactElement) => boolean,
): React.ReactElement | undefined {
  if (!React.isValidElement(value)) return undefined;
  if (predicate(value)) return value;
  const props = value.props as { children?: React.ReactNode };
  for (const child of React.Children.toArray(props.children)) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return undefined;
}

const propsOf = (element: React.ReactElement) =>
  element.props as Record<string, unknown>;

test("renders the approved compact idle Digital Office without stale operational chrome", () => {
  const markup = renderToStaticMarkup(DigitalOffice({
    runs: [],
    pipelines: [],
    expanded: null,
  }));

  assert.match(markup, /JARVIS/);
  assert.match(markup, /data-watcher-visual="true"/);
  assert.match(markup, /data-jarvis-microphone="true"/);
  for (const pod of ["research", "content", "production", "publishing", "engagement", "analytics"]) {
    assert.match(markup, new RegExp(`workforce-module--${pod}`));
  }
  assert.doesNotMatch(markup, /ContentOS Core/);
  assert.doesNotMatch(markup, /Approvals &amp; alerts/);
  assert.doesNotMatch(markup, /Production Flow/);
  assert.doesNotMatch(markup, /Production Queue/);
  assert.doesNotMatch(markup, /Waiting for operational data/);
  assert.doesNotMatch(markup, /No assigned task/);
  assert.doesNotMatch(markup, /Not reported/);
  assert.doesNotMatch(markup, /WAITING.*STANDBY|STANDBY.*WAITING/);
  assert.doesNotMatch(markup, /How can I help you\?/);
  assert.doesNotMatch(markup, /Contextual operations/);
});

test("keeps Jarvis centered when an agent is selected and expands only that HUD module", () => {
  const markup = renderToStaticMarkup(DigitalOffice({
    runs: [run("research", "research_agent", AgentRunStatus.RUNNING, "item")],
    expanded: "research_agent",
  }));

  assert.match(markup, /data-office-layout="agent-selected"/);
  assert.match(markup, /data-jarvis-context="false"/);
  assert.match(markup, /data-jarvis-stage="true"/);
  assert.match(markup, /workforce-module--research[^>]*data-state="working"[^>]*data-selected="true"/);
  assert.doesNotMatch(markup, /Contextual operations|Selected agent operational data is expanded below/);
  assert.doesNotMatch(markup, /Live production flow/);
});

test("uses a separate Jarvis context mode for movement and contextual content", () => {
  const markup = renderToStaticMarkup(DigitalOffice({
    runs: [],
    expanded: null,
    jarvisContextMode: true,
    jarvisContext: <p>Grounded Jarvis response</p>,
  }));

  assert.match(markup, /data-office-layout="idle"/);
  assert.match(markup, /data-jarvis-context="true"/);
  assert.match(markup, /data-jarvis-context-panel="true"[^>]*aria-hidden="false"/);
  assert.match(markup, /Grounded Jarvis response/);
});

test("gives every HUD module a stable workforce identity", () => {
  const office = DigitalOffice({ runs: [], expanded: null });
  for (const agentKey of ["research_agent", "content_agent", "production_agent", "publishing_agent", "engagement_agent", "analytics_agent"]) {
    const room = findElement(office, (element) => propsOf(element)["data-agent-room"] === agentKey);
    assert.ok(room, `${agentKey} room should render`);
    const workforceCard = findElement(room, (element) => typeof propsOf(element).className === "string" && String(propsOf(element).className).includes("workforce-module"));
    assert.ok(workforceCard, `${agentKey} HUD module should render`);
  }
});

test("keeps persisted agent rooms visible when pipeline discovery is partial", () => {
  const markup = renderToStaticMarkup(DigitalOffice({
    runs: [run("research", "research_agent", AgentRunStatus.RUNNING, "persisted-item")],
    pipelines: [],
    pipelineError: "Some project queues could not be loaded.",
    expanded: null,
  }));

  assert.match(markup, /data-agent-room="research_agent"/);
  assert.match(markup, /Signal Intelligence/);
  assert.doesNotMatch(markup, /Waiting for operational data/);
});

test("renders a persisted cancelled run as cancelled instead of waiting", () => {
  const markup = renderToStaticMarkup(DigitalOffice({
    runs: [run("cancelled", "research_agent", AgentRunStatus.CANCELLED, "cancelled-item")],
    pipelines: [],
    expanded: "research_agent",
  }));

  assert.match(markup, /data-agent-room="research_agent"[^>]*data-state="cancelled"/);
  assert.match(markup, />cancelled</);
});

test("renders all persisted room states and drills into real operational detail", () => {
  const runs = [
    run("research", "research_agent", AgentRunStatus.RUNNING, "item-a"),
    run("content", "content_agent", AgentRunStatus.WAITING, "item-b"),
    run("production", "production_agent", AgentRunStatus.WAITING, "item-c", { blocker: "asset missing" }),
    run("publishing", "publishing_agent", AgentRunStatus.FAILED, "item-d", { failure: "provider timeout", retryCount: 2 }),
    run("engagement", "engagement_agent", AgentRunStatus.COMPLETED, "item-e"),
    run("analytics", "analytics_agent", AgentRunStatus.WAITING, "item-f"),
  ];
  const approvalPipeline: AgentPipeline = {
    ...pipeline("item-f", "analytics-task", "needs_review"),
    tasks: [{ ...pipeline("item-f", "analytics-task", "needs_review").tasks[0]!, agentKey: "analytics_agent" }],
  };
  const inspected: string[] = [];
  const closed = DigitalOffice({ runs, pipelines: [approvalPipeline], expanded: null, onInspect: (_agentKey, id) => id && inspected.push(id) });
  const markup = renderToStaticMarkup(closed);
  for (const state of ["working", "waiting", "blocked", "failed", "completed", "approval_required"]) {
    assert.match(markup, new RegExp(`data-state="${state}"`));
  }

  const researchRoom = findElement(closed, (element) => propsOf(element)["data-agent-room"] === "research_agent");
  const roomButton = findElement(researchRoom, (element) => element.type === "button");
  assert.ok(roomButton);
  (roomButton.props as { onClick: () => void }).onClick();
  assert.deepEqual(inspected, ["research"]);

  const detail: AgentRunDetail = {
    ...runs[0]!,
    state: { decision: "use cited source", artifacts: ["brief.md"], failure: "first attempt failed", retryCount: 1 },
    activities: [{ id: "activity", runId: "research", sequence: 1, type: AgentActivityType.PROGRESS, message: "Evidence accepted", state: null, createdAt: at }],
  };
  const matching = pipeline("item-a", "research-task", "ready");
  const openMarkup = renderToStaticMarkup(DigitalOffice({ runs, details: { research: detail }, pipelines: [matching], expanded: "research_agent" }));
  assert.match(openMarkup, /Evidence accepted/);
  assert.match(openMarkup, /use cited source/);
  assert.match(openMarkup, /brief.md/);
  assert.match(openMarkup, /first attempt failed/);
  assert.match(openMarkup, /retryCount/);
  assert.match(openMarkup, /Pipeline event:/);
  assert.match(openMarkup, /Handoff/);
});

test("renders operational evidence persisted only on an activity", () => {
  const selectedRun = run("activity-state-run", "research_agent", AgentRunStatus.RUNNING, "activity-state-item");
  const detail: AgentRunDetail = {
    ...selectedRun,
    state: {},
    activities: [{
      id: "activity-state-only",
      runId: selectedRun.id,
      sequence: 1,
      type: AgentActivityType.PROGRESS,
      message: "Attempt recorded",
      state: {
        progress: 65,
        decision: "Prefer primary source",
        artifacts: ["source-audit.json"],
        blocker: "Citation unavailable",
        retryCount: 2,
        failure: "Initial extraction failed",
        outputs: { brief: "research-brief.md" },
      },
      createdAt: at,
    }],
  };

  const markup = renderToStaticMarkup(DigitalOffice({
    runs: [selectedRun],
    details: { [selectedRun.id]: detail },
    expanded: "research_agent",
  }));

  assert.match(markup, /data-activity-state="activity-state-only"/);
  assert.match(markup, />65</);
  assert.match(markup, /Prefer primary source/);
  assert.match(markup, /source-audit.json/);
  assert.match(markup, /Citation unavailable/);
  assert.match(markup, />2</);
  assert.match(markup, /Initial extraction failed/);
  assert.match(markup, /research-brief.md/);
});

test("correlates room task, events, and handoffs only to the selected run pipeline", () => {
  const selectedRun = run("selected", "research_agent", AgentRunStatus.RUNNING, "item-selected");
  const selected = pipeline("item-selected", "selected-task", "selected-status", "2026-08-20T00:00:00.000Z");
  const newerOther = pipeline("item-other", "other-task", "foreign-status", "2026-08-19T00:00:00.000Z");
  const context = runtimeContext(selectedRun, "research_agent", [newerOther, selected]);
  assert.equal(context.pipeline?.productionQueueItemId, "item-selected");
  assert.equal(context.task?.id, "selected-task");

  const detail: AgentRunDetail = { ...selectedRun, activities: [] };
  const office = DigitalOffice({
    runs: [selectedRun],
    details: { selected: detail },
    pipelines: [newerOther, selected],
    expanded: "research_agent",
  });
  const room = findElement(office, (element) => propsOf(element)["data-agent-room"] === "research_agent");
  assert.ok(room);
  const markup = renderToStaticMarkup(room);
  assert.match(markup, /selected-status/);
  assert.match(markup, /item-selected-source/);
  assert.doesNotMatch(markup, /foreign-status/);
  assert.doesNotMatch(markup, /item-other-source/);
});

test("newer pipeline-only work supersedes an older terminal run for the room and alerts", () => {
  const olderRun = run("old-complete", "research_agent", AgentRunStatus.COMPLETED, "old-item");
  olderRun.updatedAt = "2026-08-20T00:00:00.000Z";
  const failed = pipeline("new-failure", "failed-task", "failed", "2026-08-22T00:00:00.000Z");
  failed.tasks[0]!.status = AgentTaskStatus.FAILED;

  const context = runtimeContext(olderRun, "research_agent", [failed]);
  assert.equal(context.run, undefined);
  assert.equal(context.pipeline?.productionQueueItemId, "new-failure");
  assert.equal(context.task?.id, "failed-task");

  const markup = renderToStaticMarkup(DigitalOffice({
    runs: [olderRun],
    pipelines: [failed],
    expanded: "research_agent",
  }));
  assert.match(markup, /data-agent-room="research_agent"[^>]*data-state="failed"/);
  assert.match(markup, /Approvals &amp; alerts/);
  assert.match(markup, /Approvals &amp; alerts/);
  assert.match(markup, /Research Agent/);
  assert.match(markup, /Pipeline event:/);
  assert.match(markup, /new-failure-source/);
});

test("pipeline-only completed work remains visible in room detail", () => {
  const completed = pipeline("terminal-output", "complete-task", "ready");
  completed.tasks[0]!.status = AgentTaskStatus.COMPLETED;
  const markup = renderToStaticMarkup(DigitalOffice({ runs: [], pipelines: [completed], expanded: "research_agent" }));
  assert.match(markup, /data-agent-room="research_agent"[^>]*data-state="completed"/);
  assert.match(markup, /terminal-output-source/);
  assert.match(markup, /Pipeline event:/);
});

test("derives a room from the newest applicable pipeline task when no run matches", () => {
  const older = pipeline("older", "older-task", "failed", "2026-08-20T00:00:00.000Z");
  const newer = pipeline("newer", "newer-task", "running", "2026-08-22T00:00:00.000Z");
  const context = runtimeContext(undefined, "research_agent", [older, newer]);
  assert.equal(context.pipeline?.productionQueueItemId, "newer");
  assert.equal(context.task?.id, "newer-task");

  const office = DigitalOffice({ runs: [], pipelines: [older, newer], expanded: "research_agent" });
  const room = findElement(office, (element) => propsOf(element)["data-agent-room"] === "research_agent");
  assert.equal(propsOf(room!)["data-state"], "working");
  assert.match(renderToStaticMarkup(room), /working/);
});

test("uses normalized task lifecycle when source status describes domain state", () => {
  const completedReady = pipeline("ready-item", "ready-task", "ready");
  completedReady.tasks[0]!.status = AgentTaskStatus.COMPLETED;
  const runningDraft: AgentPipeline = {
    ...pipeline("draft-item", "draft-task", "draft"),
    tasks: [{
      ...pipeline("draft-item", "draft-task", "draft").tasks[0]!,
      stage: AgentPipelineStage.CONTENT,
      agentKey: "content_agent",
      sourceType: "content_script",
      status: AgentTaskStatus.RUNNING,
    }],
  };

  const office = DigitalOffice({
    runs: [],
    pipelines: [completedReady, runningDraft],
    expanded: null,
  });
  const researchRoom = findElement(office, (element) => propsOf(element)["data-agent-room"] === "research_agent");
  const contentRoom = findElement(office, (element) => propsOf(element)["data-agent-room"] === "content_agent");

  assert.equal(propsOf(researchRoom!)["data-state"], "completed");
  assert.equal(propsOf(contentRoom!)["data-state"], "working");
  const markup = renderToStaticMarkup(office);
  assert.doesNotMatch(markup, /ContentOS Core/);
  assert.doesNotMatch(markup, /No persisted alerts or approvals/);
});

test("opens pipeline-only and unimplemented waiting rooms with available or explicit empty detail", () => {
  const pipelineOnly = pipeline("pipeline-item", "pipeline-task", "running");
  const inspected: Array<[string, string | undefined]> = [];
  const closed = DigitalOffice({
    runs: [],
    pipelines: [pipelineOnly],
    expanded: null,
    onInspect: (agentKey, runId) => inspected.push([agentKey, runId]),
  });

  for (const agentKey of ["research_agent", "publishing_agent"]) {
    const room = findElement(closed, (element) => propsOf(element)["data-agent-room"] === agentKey);
    const button = findElement(room, (element) => element.type === "button");
    assert.ok(button);
    (button.props as { onClick: () => void }).onClick();
  }
  assert.deepEqual(inspected, [["research_agent", undefined], ["publishing_agent", undefined]]);

  const pipelineMarkup = renderToStaticMarkup(DigitalOffice({ runs: [], pipelines: [pipelineOnly], expanded: "research_agent" }));
  assert.match(pipelineMarkup, /Pipeline event:/);
  assert.match(pipelineMarkup, /Handoff/);

  const waitingMarkup = renderToStaticMarkup(DigitalOffice({ runs: [], pipelines: [pipelineOnly], expanded: "publishing_agent" }));
  assert.match(waitingMarkup, /Publishing Agent operational detail/);
  assert.match(waitingMarkup, /No runtime or pipeline events recorded/);
  assert.match(waitingMarkup, /No outputs, blockers, retries, or failures reported/);
});

test("renders detail loading and failure retry behavior", () => {
  const selectedRun = run("selected", "research_agent", AgentRunStatus.RUNNING, "item-selected");
  assert.match(renderToStaticMarkup(DigitalOffice({ runs: [selectedRun], expanded: "research_agent", detailLoading: { selected: true } })), /Loading operational detail/);
  let retried = "";
  const failed = DigitalOffice({ runs: [selectedRun], expanded: "research_agent", detailErrors: { selected: "Detail request failed" }, onRetryDetail: (id) => { retried = id; } });
  assert.match(renderToStaticMarkup(failed), /Detail request failed/);
  const roomDetails = findElement(failed, (element) => propsOf(element).error === "Detail request failed");
  if (!roomDetails) assert.fail("Room details were not rendered");
  const detailTree = (roomDetails.type as (props: unknown) => React.ReactNode)(roomDetails.props);
  const retry = findElement(detailTree, (element) => propsOf(element).children === "Retry details");
  assert.ok(retry);
  (retry.props as { onClick: () => void }).onClick();
  assert.equal(retried, "selected");
});

test("places multiple active items at their evidenced running and failed stages", () => {
  const runningResearch = pipeline("item-research", "research-running", "running");
  const failedRender: AgentPipeline = {
    productionQueueItemId: "item-render",
    tasks: [{ ...runningResearch.tasks[0]!, id: "render-failed", stage: AgentPipelineStage.PRODUCTION, agentKey: "production_agent", sourceType: "video_render_job", status: AgentTaskStatus.FAILED, sourceStatus: "failed" }],
    events: [], handoffs: [],
  };
  const office = DigitalOffice({ runs: [], pipelines: [runningResearch, failedRender], expanded: "research_agent" });
  const researchStage = findElement(office, (element) => propsOf(element)["data-flow-stage-items"] === "Research");
  const renderStage = findElement(office, (element) => propsOf(element)["data-flow-stage-items"] === "Render");
  assert.ok(findElement(researchStage, (element) => propsOf(element)["data-pipeline-item"] === "item-research" && propsOf(element)["data-item-state"] === "running"));
  assert.ok(findElement(renderStage, (element) => propsOf(element)["data-pipeline-item"] === "item-render" && propsOf(element)["data-item-state"] === "failed"));
  assert.equal(findElement(researchStage, (element) => propsOf(element)["data-pipeline-item"] === "item-render"), undefined);
});

test("keeps older actionable work visible when the same agent has a newer normal run", () => {
  const newer = run("new-running", "research_agent", AgentRunStatus.RUNNING, "new-item");
  newer.updatedAt = "2026-08-22T00:00:00.000Z";
  const olderApproval = run("old-approval", "research_agent", AgentRunStatus.WAITING, "approval-item", { approvalRequired: true });
  olderApproval.updatedAt = "2026-08-20T00:00:00.000Z";
  olderApproval.currentActivity = "Editorial approval required";
  const failedPipeline = pipeline("failed-item", "failed-item-task", "failed", "2026-08-19T00:00:00.000Z");
  failedPipeline.tasks[0]!.status = AgentTaskStatus.FAILED;

  const markup = renderToStaticMarkup(DigitalOffice({ runs: [newer, olderApproval], pipelines: [failedPipeline], expanded: "research_agent" }));
  assert.match(markup, /Editorial approval required/);
  assert.match(markup, /data-alert-state="failed"[^>]*>[\s\S]*?<p class="text-slate-400">failed<\/p>/);
  assert.match(markup, /data-alert-state="approval_required"/);
  assert.match(markup, /data-alert-state="failed"/);
});

test("does not let more than fifty newer runs for one room hide another room's failed state", () => {
  const noisy = Array.from({ length: 51 }, (_, index) => {
    const current = run(`research-${index}`, "research_agent", AgentRunStatus.COMPLETED, `research-item-${index}`);
    current.updatedAt = `2026-08-22T00:${String(index).padStart(2, "0")}:00.000Z`;
    return current;
  });
  const contentFailure = run("content-failure", "content_agent", AgentRunStatus.FAILED, "content-item", { failure: "persisted failure" });
  contentFailure.updatedAt = "2026-08-20T00:00:00.000Z";
  const markup = renderToStaticMarkup(DigitalOffice({ runs: [...noisy, contentFailure], expanded: null }));
  assert.match(markup, /data-agent-room="content_agent"[^>]*data-state="failed"/);
  assert.match(markup, /Content/);
});

test("anchors persisted handoffs to both corresponding agent rooms", () => {
  const connected = pipeline("connected-item", "research-task", "ready");
  connected.tasks.push({
    ...connected.tasks[0]!,
    id: "content-task",
    stage: AgentPipelineStage.CONTENT,
    agentKey: "content_agent",
    sourceType: "content_script",
  });
  connected.handoffs[0] = { ...connected.handoffs[0]!, toTaskId: "content-task" };
  const office = DigitalOffice({ runs: [], pipelines: [connected], expanded: "research_agent" });
  const connector = findElement(office, (element) => propsOf(element)["data-handoff-connector"] === "research-task-handoff");
  assert.ok(connector);
  assert.equal(propsOf(connector)["data-from-room"], "research_agent");
  assert.equal(propsOf(connector)["data-to-room"], "content_agent");
  assert.equal(propsOf(connector)["aria-describedby"], "agent-room-research_agent agent-room-content_agent");
  assert.ok(findElement(office, (element) => propsOf(element).id === "agent-room-research_agent"));
  assert.ok(findElement(office, (element) => propsOf(element).id === "agent-room-content_agent"));
});
