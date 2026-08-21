import assert from "node:assert/strict";
import test from "node:test";
import {
  bindVideoCompositionAssets,
  enqueueVideoRender,
  getVideoRenderStatus,
  prepareVideoComposition,
  prepareVideoRenderInput,
  retryVideoRender,
  videoRenderOutputUrl,
} from "../api/client.ts";

test("render client encodes identifiers and uses the existing paths and methods", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? "GET" });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const id = "script/one two";
    await prepareVideoComposition(id);
    await bindVideoCompositionAssets(id);
    await prepareVideoRenderInput(id);
    await enqueueVideoRender(id);
    await retryVideoRender(id);
    await getVideoRenderStatus(id);

    const base = "/api/content-scripts/script%2Fone%20two";
    assert.deepEqual(calls, [
      { url: `${base}/video-composition-plan`, method: "POST" },
      { url: `${base}/video-composition-plan/assets`, method: "POST" },
      { url: `${base}/video-render-input-manifest`, method: "POST" },
      { url: `${base}/video-render-jobs`, method: "POST" },
      { url: `${base}/video-render-jobs/retry`, method: "POST" },
      { url: `${base}/video-render-job`, method: "GET" },
    ]);
    assert.equal(videoRenderOutputUrl(id), `${base}/video-render-job/output`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
