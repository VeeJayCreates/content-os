import assert from "node:assert/strict";
import test from "node:test";
import { transcriptStatusLabel } from "./signals-screen.tsx";

test("renders every persisted transcript review status without loading caption content", () => {
  assert.equal(transcriptStatusLabel("available"), "AVAILABLE");
  assert.equal(transcriptStatusLabel("failed"), "FAILED");
  assert.equal(transcriptStatusLabel("no_captions"), "NO CAPTIONS");
  assert.equal(transcriptStatusLabel("not_checked"), "NOT CHECKED");
  assert.equal(transcriptStatusLabel("pending"), "PENDING");
  assert.equal(transcriptStatusLabel("processing"), "PROCESSING");
  assert.equal(transcriptStatusLabel("retry_scheduled"), "RETRY SCHEDULED");
  assert.equal(transcriptStatusLabel("permanent_failure"), "FAILED");
});
