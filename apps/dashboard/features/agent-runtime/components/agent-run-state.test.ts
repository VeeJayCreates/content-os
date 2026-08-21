import assert from "node:assert/strict";
import test from "node:test";
import { AgentRunStatus } from "@content-os/contracts";
import { agentRunPresentation, orderedActivities, setDetailLoading, subjectLabel } from "./agent-run-state.ts";

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
