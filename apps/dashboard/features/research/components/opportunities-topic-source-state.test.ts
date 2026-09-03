import assert from "node:assert/strict";
import test from "node:test";

import { topicTranscriptStatusLabel } from "./opportunities-screen.tsx";

test("labels topic-linked source videos by their current transcript state", () => {
  assert.equal(topicTranscriptStatusLabel("available"), "AVAILABLE");
  assert.equal(topicTranscriptStatusLabel("pending"), "PENDING");
  assert.equal(topicTranscriptStatusLabel("retry_scheduled"), "RETRY SCHEDULED");
  assert.equal(topicTranscriptStatusLabel("no_captions"), "NO CAPTIONS");
});
