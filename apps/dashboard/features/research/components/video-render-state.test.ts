import assert from "node:assert/strict";
import test from "node:test";
import type { VideoRenderJob } from "@content-os/contracts";
import { VideoRenderJobStatus } from "@content-os/contracts";
import {
  runVideoRenderSequence,
  VideoRenderRequestCoordinator,
  videoRenderPhaseAfterRefreshFailure,
  videoRenderPresentation,
} from "./video-render-state.ts";

const job = (status: VideoRenderJob["status"], percent = 50) => ({
  status,
  progress: { completedUnits: 12, totalUnits: 10, percent },
  failureMessage: status === "failed" ? "Renderer unavailable" : null,
}) as VideoRenderJob;

test("derives actions only from the current persisted job state", () => {
  assert.equal(videoRenderPresentation(undefined).action, "start");
  assert.equal(videoRenderPresentation(undefined, "loading").action, null);
  assert.equal(videoRenderPresentation(undefined, "error").action, null);
  assert.equal(videoRenderPresentation(undefined, "absent").action, "start");
  for (const status of [VideoRenderJobStatus.QUEUED, VideoRenderJobStatus.RUNNING, VideoRenderJobStatus.COMPLETED, VideoRenderJobStatus.STALE])
    assert.equal(videoRenderPresentation(job(status)).action, null);
  assert.equal(videoRenderPresentation(job(VideoRenderJobStatus.FAILED)).action, "retry");
});

test("serializes refreshes, guards duplicate actions, and rejects stale responses", () => {
  const requests = new VideoRenderRequestCoordinator();
  const firstRefresh = requests.beginRefresh();
  assert.equal(typeof firstRefresh, "number");
  assert.equal(requests.beginRefresh(), null);
  requests.endRefresh(firstRefresh!);
  assert.equal(typeof requests.beginRefresh(), "number");
  requests.endRefresh(firstRefresh!);
  const action = requests.beginAction();
  assert.equal(typeof action, "number");
  assert.equal(requests.beginAction(), null);
  assert.equal(requests.isCurrent(action!), true);
  requests.invalidate();
  assert.equal(requests.isCurrent(action!), false);
  assert.equal(typeof requests.beginRefresh(), "number");
});

test("bounds persisted progress and presents failed and stale states", () => {
  assert.equal(videoRenderPresentation(job(VideoRenderJobStatus.RUNNING, 140)).progress, 100);
  assert.equal(videoRenderPresentation(job(VideoRenderJobStatus.RUNNING, -2)).progress, 0);
  assert.equal(videoRenderPresentation(job(VideoRenderJobStatus.FAILED)).failure, "Renderer unavailable");
  assert.equal(videoRenderPresentation(job(VideoRenderJobStatus.STALE)).label, "Stale");
});

test("keeps an active persisted render polling through a quiet failure and recovery", () => {
  const runningJob = job(VideoRenderJobStatus.RUNNING);
  const failedRefreshPhase = videoRenderPhaseAfterRefreshFailure("available", true);

  assert.equal(failedRefreshPhase, "available");
  assert.equal(videoRenderPresentation(runningJob, failedRefreshPhase).active, true);

  const recoveredPhase = "available";
  assert.equal(videoRenderPresentation(runningJob, recoveredPhase).label, "Running");
  assert.equal(videoRenderPresentation(runningJob, recoveredPhase).active, true);
  assert.equal(videoRenderPhaseAfterRefreshFailure("loading", false), "error");
});

test("runs prerequisites in order and stops at the first failure", async () => {
  const calls: string[] = [];
  await assert.rejects(runVideoRenderSequence("script-1", {
    prepareComposition: async () => void calls.push("composition"),
    bindAssets: async () => { calls.push("assets"); throw new Error("binding failed"); },
    prepareMotionPlan: async () => void calls.push("motion"),
    prepareInput: async () => void calls.push("input"),
    enqueue: async () => { calls.push("enqueue"); return job(VideoRenderJobStatus.QUEUED); },
  }), /binding failed/);
  assert.deepEqual(calls, ["composition", "assets"]);
});

test("enqueues once after every prerequisite succeeds", async () => {
  const calls: string[] = [];
  await runVideoRenderSequence("script-1", {
    prepareComposition: async () => void calls.push("composition"),
    bindAssets: async () => void calls.push("assets"),
    prepareMotionPlan: async () => void calls.push("motion"),
    prepareInput: async () => void calls.push("input"),
    enqueue: async () => { calls.push("enqueue"); return job(VideoRenderJobStatus.QUEUED); },
  });
  assert.deepEqual(calls, ["composition", "assets", "motion", "input", "enqueue"]);
});
