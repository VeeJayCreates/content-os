import assert from "node:assert/strict";
import test from "node:test";
import { AgentRunStatus } from "@content-os/contracts";
import { getAgentRun, listAgentRuns } from "../api/client.ts";

test("agent runtime client safely constructs list and detail requests", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => { calls.push(String(input)); return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }); }) as typeof fetch;
  try {
    await listAgentRuns({ projectId: "project/a b", agentKey: "research&agent", status: AgentRunStatus.WAITING, limit: 25 });
    globalThis.fetch = (async (input) => { calls.push(String(input)); return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }); }) as typeof fetch;
    await getAgentRun("run/a b?x=1");
    assert.deepEqual(calls, ["/api/agent-runs?projectId=project%2Fa+b&agentKey=research%26agent&status=waiting&limit=25", "/api/agent-runs/run%2Fa%20b%3Fx%3D1"]);
  } finally { globalThis.fetch = originalFetch; }
});
