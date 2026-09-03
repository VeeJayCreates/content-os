import assert from "node:assert/strict";
import test from "node:test";
import {
  productionQueuePresentation,
  sceneDisplayNumber,
} from "./production-queue-state.ts";

test("shows a fillable empty state after a successful empty production-queue response", () => {
  const projectsLoaded = true;
  const selectedProjectQueue: unknown[] = [];
  assert.equal(projectsLoaded, true);
  assert.deepEqual(selectedProjectQueue, []);
  assert.deepEqual(productionQueuePresentation(false, selectedProjectQueue.length, null), {
    kind: "empty",
    message: "Production queue is empty",
    showFillQueue: true,
  });
});

test("uses the persisted Scene Plan index when the API record has no public index field", () => {
  assert.equal(sceneDisplayNumber({ sceneIndex: 0 }, 0), 1);
  assert.equal(sceneDisplayNumber({ index: 2, sceneIndex: 0 }, 0), 3);
  assert.equal(sceneDisplayNumber({}, 4), 5);
});
