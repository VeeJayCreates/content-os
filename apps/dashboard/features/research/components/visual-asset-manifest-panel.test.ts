import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { VisualAssetAcquisitionRun } from "@content-os/contracts";
import {
  VisualAssetAcquisitionRunStatus,
  VisualAssetManifestStatus,
} from "@content-os/contracts";
import { VisualAssetAcquisitionView } from "./visual-asset-acquisition-view.ts";
import {
  candidateEntryAllowed,
  internallyResolvedRequirement,
} from "./visual-asset-manifest-panel.tsx";
import {
  acquisitionActions,
  performAcquisitionAction,
} from "./visual-asset-acquisition-state.ts";

const run = (
  status: VisualAssetAcquisitionRun["status"],
  failureCode: string | null = null,
) =>
  ({
    id: "run-1",
    status,
    failureCode,
    preparedQueryCount: 4,
    providerRequestCount: 3,
    candidatesDiscovered: 9,
    candidatesAccepted: 5,
    candidatesRejected: 4,
  }) as VisualAssetAcquisitionRun;

const render = (
  acquisition: VisualAssetAcquisitionRun | null,
  action: string | null = null,
  manifestStatus = VisualAssetManifestStatus.NEEDS_REVIEW,
  statusAvailable = true,
) => {
  const allowed = acquisitionActions(
    manifestStatus,
    acquisition,
    statusAvailable,
  );
  return renderToStaticMarkup(
    VisualAssetAcquisitionView({
      acquisition,
      action,
      statusAvailable,
      canPrepare: allowed.prepare,
      canExecute: allowed.execute,
      onPrepare() {},
      onExecute() {},
    }),
  );
};

test("keeps actions unavailable when latest status cannot be read", () => {
  const html = render(
    null,
    null,
    VisualAssetManifestStatus.NEEDS_REVIEW,
    false,
  );
  assert.match(html, /Acquisition · Status unavailable/);
  assert.doesNotMatch(html, /<button/);
});

test("renders persisted status, bounded counters, and only allowed actions", () => {
  const prepared = render(run(VisualAssetAcquisitionRunStatus.PREPARED));
  assert.match(prepared, /Acquisition · Prepared/);
  assert.match(prepared, /Queries 4 · provider requests 3/);
  assert.match(prepared, /Discovered 9 · accepted 5 · rejected 4/);
  assert.match(prepared, /Execute acquisition/);
  assert.doesNotMatch(prepared, /Prepare acquisition/);

  const stale = render(
    run(VisualAssetAcquisitionRunStatus.PREPARED),
    null,
    VisualAssetManifestStatus.STALE,
  );
  assert.doesNotMatch(stale, /<button/);
});

test("disables acquisition controls while a request is active", () => {
  const html = render(
    run(VisualAssetAcquisitionRunStatus.PREPARED),
    "execute-acquisition",
  );
  assert.match(html, /<button disabled="">Executing…<\/button>/);
});

test("successful execution calls the API once and refreshes manifest and candidates", async () => {
  const calls: string[] = [];
  const completed = run(VisualAssetAcquisitionRunStatus.COMPLETED);
  const result = await performAcquisitionAction(
    "execute",
    "script-1",
    "run-1",
    ["requirement-a", "requirement-b"],
    {
      prepare: async () => {
        throw new Error("unexpected prepare");
      },
      execute: async (scriptId, runId) => {
        calls.push(`execute:${scriptId}:${runId}`);
        return completed;
      },
    },
    async () => void calls.push("manifest"),
    async (id) => void calls.push(`candidate:${id}`),
  );
  assert.equal(result, completed);
  assert.equal(calls.filter((call) => call.startsWith("execute:")).length, 1);
  assert.deepEqual(calls, [
    "execute:script-1:run-1",
    "manifest",
    "candidate:requirement-a",
    "candidate:requirement-b",
  ]);
});

test("renders deterministic provider failure and permits backend-approved retry", async () => {
  const failure = run(
    VisualAssetAcquisitionRunStatus.FAILED,
    "provider_network_failure",
  );
  const html = render(failure);
  assert.match(html, /Acquisition failed: Provider Network Failure/);
  assert.match(html, /Retry acquisition/);

  await assert.rejects(
    performAcquisitionAction(
      "execute",
      "script-1",
      "run-1",
      [],
      {
        prepare: async () => failure,
        execute: async () => {
          throw new Error("Provider request rejected deterministically");
        },
      },
      async () => {},
      async () => {},
    ),
    /Provider request rejected deterministically/,
  );
});

test("limits manual candidate entry to candidate-backed acquisition strategies", () => {
  assert.equal(candidateEntryAllowed("provider_search"), true);
  assert.equal(candidateEntryAllowed("source_reference"), true);
  assert.equal(candidateEntryAllowed("manual"), true);
  assert.equal(candidateEntryAllowed("reusable_template"), false);
  assert.equal(candidateEntryAllowed("programmatic_specification"), false);
  assert.equal(candidateEntryAllowed("none_required"), false);
});

test("counts no-file programmatic requirements as resolved only without review", () => {
  for (const acquisitionStrategy of [
    "none_required",
    "reusable_template",
    "programmatic_specification",
  ]) {
    assert.equal(
      internallyResolvedRequirement({ acquisitionStrategy, manualReviewRequired: false }),
      true,
    );
    assert.equal(
      internallyResolvedRequirement({ acquisitionStrategy, manualReviewRequired: true }),
      false,
    );
  }
  assert.equal(
    internallyResolvedRequirement({
      acquisitionStrategy: "provider_search",
      manualReviewRequired: false,
    }),
    false,
  );
});
