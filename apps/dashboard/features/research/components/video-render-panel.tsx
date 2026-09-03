"use client";

import * as React from "react";
import type { VideoRenderJob } from "@content-os/contracts";
import { Button } from "@/components/ui/button";
import {
  bindVideoCompositionAssets,
  executeVideoRenderLocally,
  enqueueVideoRender,
  getVideoRenderStatus,
  prepareVideoComposition,
  prepareVideoRenderInput,
  prepareVideoMotionPlan,
  ResearchApiError,
  retryVideoRender,
  videoRenderOutputUrl,
} from "@/features/research/api/client";
import {
  runVideoRenderSequence,
  VideoRenderRequestCoordinator,
  type VideoRenderStatusPhase,
  videoRenderPhaseAfterRefreshFailure,
  videoRenderPresentation,
} from "./video-render-state";

export function VideoRenderPanel({ contentScriptId }: { contentScriptId: string }) {
  const [job, setJob] = React.useState<VideoRenderJob>();
  const [statusPhase, setStatusPhase] = React.useState<VideoRenderStatusPhase>("loading");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshError, setRefreshError] = React.useState<string | null>(null);
  const requests = React.useRef(new VideoRenderRequestCoordinator());
  const mounted = React.useRef(true);
  const view = videoRenderPresentation(job, statusPhase);

  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = React.useCallback(async (quiet = false) => {
    const requestId = requests.current.beginRefresh();
    if (requestId === null) return;
    try {
      const value = await getVideoRenderStatus(contentScriptId);
      if (mounted.current && requests.current.isCurrent(requestId)) {
        setJob(value);
        setStatusPhase("available");
        setRefreshError(null);
        if (!quiet) setError(null);
      }
    } catch (reason) {
      if (reason instanceof ResearchApiError && reason.status === 404) {
        if (mounted.current && requests.current.isCurrent(requestId)) {
          setJob(undefined);
          setStatusPhase("absent");
          setRefreshError(null);
          if (!quiet) setError(null);
        }
      } else if (mounted.current && requests.current.isCurrent(requestId)) {
        const message = reason instanceof ResearchApiError ? reason.message : "Unable to read render status. Try again before starting a render.";
        setStatusPhase((current) => videoRenderPhaseAfterRefreshFailure(current, quiet));
        if (quiet) setRefreshError(message);
        else setError(message);
      }
    } finally {
      requests.current.endRefresh(requestId);
    }
  }, [contentScriptId]);

  React.useEffect(() => {
    requests.current.invalidate();
    setJob(undefined);
    setStatusPhase("loading");
    setPending(false);
    setError(null);
    setRefreshError(null);
    void refresh();
  }, [refresh]);
  React.useEffect(() => {
    if (!view.active) return;
    const timer = window.setInterval(() => void refresh(true), 3000);
    return () => window.clearInterval(timer);
  }, [refresh, view.active]);

  async function act(action: "start" | "retry") {
    const requestId = requests.current.beginAction();
    if (requestId === null) return;
    setPending(true);
    setError(null);
    try {
      const value = action === "retry"
        ? await retryVideoRender(contentScriptId)
        : await runVideoRenderSequence(contentScriptId, {
            prepareComposition: prepareVideoComposition,
            bindAssets: bindVideoCompositionAssets,
            prepareMotionPlan: prepareVideoMotionPlan,
            prepareInput: prepareVideoRenderInput,
            enqueue: enqueueVideoRender,
          });
      if (mounted.current && requests.current.isCurrent(requestId)) {
        setJob(value);
        setStatusPhase("available");
      }
      if (value.status === "queued") {
        const completed = await executeVideoRenderLocally(contentScriptId);
        if (mounted.current && requests.current.isCurrent(requestId)) setJob(completed);
      }
    } catch (reason) {
      if (mounted.current && requests.current.isCurrent(requestId))
        setError(reason instanceof ResearchApiError ? reason.message : "Unable to start the render. Check the scene plan, audio, and finalized visual assets.");
    } finally {
      requests.current.endAction(requestId);
      if (mounted.current && requests.current.isCurrent(requestId)) setPending(false);
    }
  }

  return (
    <div className="space-y-2 rounded border p-3" aria-label="Video render">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">Video render · {view.label}</p>
        {view.action ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => void act(view.action!)}>
            {pending ? (view.action === "retry" ? "Retrying…" : "Preparing render…") : (view.action === "retry" ? "Retry render" : "Render video")}
          </Button>
        ) : null}
      </div>
      {view.progress !== null ? (
        <div className="space-y-1">
          <progress className="h-2 w-full accent-primary" max={100} value={view.progress} aria-label="Render progress" />
          <p>{view.progressLabel}</p>
        </div>
      ) : null}
      {view.failure ? <p className="text-red-400">{view.failure}</p> : null}
      {refreshError ? <p role="status" className="text-amber-300">Status refresh failed: {refreshError} Retrying automatically.</p> : null}
      {error ? <p role="alert" className="text-red-400">{error}</p> : null}
      {view.completed ? (
        <div className="space-y-2">
          <video
            className="w-full max-w-xl rounded bg-black"
            controls
            preload="metadata"
            src={videoRenderOutputUrl(contentScriptId)}
            onError={() => setError("The completed output could not be loaded. It may be stale, missing from storage, or temporarily unavailable. Refresh status and try again.")}
          >Your browser cannot play this video.</video>
          <Button size="sm" variant="outline" asChild><a href={videoRenderOutputUrl(contentScriptId)} target="_blank" rel="noreferrer">Open or download output</a></Button>
        </div>
      ) : null}
    </div>
  );
}
