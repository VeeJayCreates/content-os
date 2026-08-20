import assert from "node:assert/strict";
import test from "node:test";
import {
  VisualAssetAcquisitionRunStatus,
  VisualAssetManifestStatus,
  type VisualAssetAcquisitionRun,
} from "@content-os/contracts";
import {
  acquisitionActions,
  acquisitionPresentation,
  refreshAcquisitionResults,
} from "./visual-asset-acquisition-state.ts";

const run = (
  status: VisualAssetAcquisitionRun["status"],
  failureCode: string | null = null,
) =>
  ({
    status,
    failureCode,
    preparedQueryCount: 4,
    providerRequestCount: 3,
    candidatesDiscovered: 9,
    candidatesAccepted: 5,
    candidatesRejected: 4,
  }) as VisualAssetAcquisitionRun;

test("presents persisted status, bounded counters, and deterministic failure", () => {
  const view = acquisitionPresentation(
    run(VisualAssetAcquisitionRunStatus.FAILED, "provider_network_failure"),
  );
  assert.equal(view.status, "Failed");
  assert.deepEqual(view.counters, {
    queries: 4,
    requests: 3,
    discovered: 9,
    accepted: 5,
    rejected: 4,
  });
  assert.equal(view.failure, "Acquisition failed: Provider Network Failure");
});

test("only exposes actions allowed by persisted run state", () => {
  assert.deepEqual(
    acquisitionActions(
      VisualAssetManifestStatus.NEEDS_REVIEW,
      null,
      false,
    ),
    { prepare: false, execute: false },
  );
  assert.deepEqual(
    acquisitionActions(VisualAssetManifestStatus.NEEDS_REVIEW, null),
    { prepare: true, execute: false },
  );
  assert.deepEqual(
    acquisitionActions(
      VisualAssetManifestStatus.NEEDS_REVIEW,
      run(VisualAssetAcquisitionRunStatus.PREPARED),
    ),
    { prepare: false, execute: true },
  );
  assert.deepEqual(
    acquisitionActions(
      VisualAssetManifestStatus.NEEDS_REVIEW,
      run(VisualAssetAcquisitionRunStatus.FAILED, "provider_unavailable"),
    ),
    { prepare: false, execute: true },
  );
  assert.deepEqual(
    acquisitionActions(
      VisualAssetManifestStatus.STALE,
      run(VisualAssetAcquisitionRunStatus.PREPARED),
    ),
    { prepare: false, execute: false },
  );
  assert.deepEqual(
    acquisitionActions(
      VisualAssetManifestStatus.NEEDS_REVIEW,
      run(VisualAssetAcquisitionRunStatus.EXECUTING),
    ),
    { prepare: false, execute: false },
  );
});

test("successful execution refreshes the manifest and requirement-scoped candidates", async () => {
  const calls: string[] = [];
  await refreshAcquisitionResults(
    ["requirement-a", "requirement-b"],
    async () => void calls.push("manifest"),
    async (id) => void calls.push(id),
  );
  assert.equal(calls[0], "manifest");
  assert.deepEqual(
    new Set(calls.slice(1)),
    new Set(["requirement-a", "requirement-b"]),
  );
});
