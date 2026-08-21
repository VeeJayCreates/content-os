import assert from "node:assert/strict";
import test from "node:test";
import { AgentRunStatus } from "@content-os/contracts";
import { getAgentPipeline, getAgentRun, listAgentPipelines, listAgentRuns, listAgentRunsByAgent } from "../api/client.ts";

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

test("loads authoritative unpaged office runs so a noisy agent cannot displace another room", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);
    const body = [
      ...Array.from({ length: 51 }, (_, index) => ({ id: `research-${index}`, agentKey: "research_agent" })),
      { id: "content-current", agentKey: "content_agent" },
    ];
    return Response.json(body);
  }) as typeof fetch;
  try {
    const runs = await listAgentRunsByAgent(["research_agent", "content_agent"]);
    assert.equal(runs.length, 52);
    assert.ok(runs.some((run) => run.id === "content-current"));
    assert.deepEqual(calls, ["/api/agent-runs/office?agentKeys=research_agent%2Ccontent_agent"]);
  } finally { globalThis.fetch = originalFetch; }
});

test("pipeline synchronization posts to the encoded production queue route", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ productionQueueItemId: "item/a", tasks: [], events: [], handoffs: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    await getAgentPipeline("item/a b?version=1");
    assert.equal(calls[0]?.input, "/api/agent-pipelines/production-queue/item%2Fa%20b%3Fversion%3D1/synchronize");
    assert.equal(calls[0]?.init?.method, "POST");
  } finally { globalThis.fetch = originalFetch; }
});

test("pipeline discovery synchronizes active work plus recent failed and completed work", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);
    const body = url === "/api/projects"
      ? [{ id: "project/a" }]
      : url.includes("/api/agent-pipelines/")
        ? {
            productionQueueItemId: decodeURIComponent(url.split("/").at(-2)!),
            tasks: [], events: [], handoffs: [],
          }
        : [
            { id: "item-running", status: "processing", updatedAt: "2026-08-21T04:00:00.000Z" },
            { id: "item-complete", status: "completed", updatedAt: "2026-08-21T03:00:00.000Z" },
            { id: "item-failed", status: "failed", updatedAt: "2026-08-21T02:00:00.000Z" },
            { id: "item-queued", status: "queued", updatedAt: "2026-08-21T01:00:00.000Z" },
          ];
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await listAgentPipelines(["referenced-complete"]);
    assert.deepEqual(result.pipelines.map((pipeline) => pipeline.productionQueueItemId).sort(), ["item-complete", "item-failed", "item-queued", "item-running", "referenced-complete"]);
    assert.ok(calls.includes("/api/projects/project%2Fa/production-queue"));
    assert.equal(calls.some((url) => url.includes("item-complete/synchronize")), true);
    assert.equal(calls.some((url) => url.includes("item-failed/synchronize")), true);
  } finally { globalThis.fetch = originalFetch; }
});

test("pipeline discovery retains run-associated work when one project queue fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url === "/api/projects") {
      return Response.json([{ id: "available" }, { id: "inaccessible" }]);
    }
    if (url === "/api/projects/inaccessible/production-queue") {
      return Response.json({ message: "Queue is inaccessible" }, { status: 503 });
    }
    if (url === "/api/projects/available/production-queue") {
      return Response.json([{ id: "queue-item", status: "processing", updatedAt: "2026-08-21T01:00:00.000Z" }]);
    }
    const productionQueueItemId = url.includes("persisted-run-item")
      ? "persisted-run-item"
      : "queue-item";
    return Response.json({ productionQueueItemId, tasks: [], events: [], handoffs: [] });
  }) as typeof fetch;

  try {
    const result = await listAgentPipelines(["persisted-run-item"]);
    assert.deepEqual(
      result.pipelines.map((pipeline) => pipeline.productionQueueItemId).sort(),
      ["persisted-run-item", "queue-item"],
    );
    assert.equal(result.partial, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
