import type { VideoRenderJob } from "@content-os/contracts";

export type VideoRenderAction = "start" | "retry" | null;

export type VideoRenderStatusPhase = "loading" | "available" | "absent" | "error";

export function videoRenderPhaseAfterRefreshFailure(
  currentPhase: VideoRenderStatusPhase,
  quiet: boolean,
): VideoRenderStatusPhase {
  return quiet && currentPhase === "available" ? currentPhase : "error";
}

export class VideoRenderRequestCoordinator {
  private generation = 0;
  private refreshPending = false;
  private actionPending = false;

  beginRefresh() { if (this.refreshPending) return null; this.refreshPending = true; return this.generation; }
  endRefresh(token: number) { if (this.isCurrent(token)) this.refreshPending = false; }
  beginAction() {
    if (this.actionPending) return null;
    this.refreshPending = false;
    this.actionPending = true;
    return ++this.generation;
  }
  endAction(token: number) { if (this.isCurrent(token)) this.actionPending = false; }
  invalidate() { this.refreshPending = false; this.actionPending = false; return ++this.generation; }
  isCurrent(token: number) { return token === this.generation; }
}

export function videoRenderPresentation(
  job: VideoRenderJob | undefined,
  statusPhase: VideoRenderStatusPhase = job ? "available" : "absent",
) {
  if (statusPhase !== "available")
    return statusPhase === "absent"
      ? { label: "Not started", progress: null, action: "start" as const }
      : { label: statusPhase === "loading" ? "Checking status…" : "Status unavailable", progress: null, action: null };
  if (!job) return { label: "Not started", progress: null, action: "start" as const };
  const completed = Math.max(0, job.progress?.completedUnits ?? 0);
  const total = Math.max(0, job.progress?.totalUnits ?? 0);
  const suppliedPercent = job.progress?.percent;
  const progress =
    suppliedPercent === undefined || suppliedPercent === null
      ? null
      : Math.min(100, Math.max(0, suppliedPercent));
  return {
    label: job.status.replace(/^./, (letter) => letter.toUpperCase()),
    progress,
    progressLabel:
      progress === null
        ? null
        : `${progress}%${total > 0 ? ` (${Math.min(completed, total)}/${total})` : ""}`,
    action: (job.status === "failed" ? "retry" : null) as VideoRenderAction,
    failure: job.status === "failed" ? job.failureMessage || "The render failed." : null,
    completed: job.status === "completed",
    active: job.status === "queued" || job.status === "running",
  };
}

export async function runVideoRenderSequence<T>(
  contentScriptId: string,
  api: {
    prepareComposition(id: string): Promise<unknown>;
    bindAssets(id: string): Promise<unknown>;
    prepareMotionPlan(id: string): Promise<unknown>;
    prepareInput(id: string): Promise<unknown>;
    enqueue(id: string): Promise<T>;
  },
) {
  await api.prepareComposition(contentScriptId);
  await api.bindAssets(contentScriptId);
  await api.prepareMotionPlan(contentScriptId);
  await api.prepareInput(contentScriptId);
  return api.enqueue(contentScriptId);
}
