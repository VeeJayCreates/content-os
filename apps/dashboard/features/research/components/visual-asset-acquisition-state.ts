import type {
  VisualAssetAcquisitionRun,
  VisualAssetManifest,
} from "@content-os/contracts";

const retryableFailureCodes = new Set([
  "provider_unavailable",
  "provider_network_failure",
  "provider_http_rejected",
  "provider_response_malformed",
  "execution_failed",
]);

export const acquisitionActions = (
  manifestStatus: VisualAssetManifest["status"],
  run: VisualAssetAcquisitionRun | null,
  statusAvailable = true,
) => {
  if (!statusAvailable) return { prepare: false, execute: false };
  if (manifestStatus === "stale") return { prepare: false, execute: false };
  if (!run) return { prepare: true, execute: false };
  const retryable =
    run.status === "failed" &&
    run.failureCode !== null &&
    retryableFailureCodes.has(run.failureCode);
  return {
    prepare: ["completed", "failed", "stale"].includes(run.status) && !retryable,
    execute: run.status === "prepared" || retryable,
  };
};

export const acquisitionPresentation = (run: VisualAssetAcquisitionRun) => ({
  status: run.status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()),
  counters: {
    queries: run.preparedQueryCount,
    requests: run.providerRequestCount,
    discovered: run.candidatesDiscovered,
    accepted: run.candidatesAccepted,
    rejected: run.candidatesRejected,
  },
  failure: run.failureCode
    ? `Acquisition failed: ${run.failureCode
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())}`
    : null,
});

export const refreshAcquisitionResults = async (
  requirementIds: string[],
  refreshManifest: () => Promise<void>,
  refreshCandidates: (requirementId: string) => Promise<void>,
) => {
  await refreshManifest();
  await Promise.all(requirementIds.map(refreshCandidates));
};

export const performAcquisitionAction = async (
  mode: "prepare" | "execute",
  contentScriptId: string,
  runId: string | null,
  requirementIds: string[],
  api: {
    prepare: (contentScriptId: string) => Promise<VisualAssetAcquisitionRun>;
    execute: (
      contentScriptId: string,
      runId: string,
    ) => Promise<VisualAssetAcquisitionRun>;
  },
  refreshManifest: () => Promise<void>,
  refreshCandidates: (requirementId: string) => Promise<void>,
) => {
  const result =
    mode === "prepare"
      ? await api.prepare(contentScriptId)
      : await api.execute(contentScriptId, runId!);
  if (mode === "execute")
    await refreshAcquisitionResults(
      requirementIds,
      refreshManifest,
      refreshCandidates,
    );
  return result;
};
