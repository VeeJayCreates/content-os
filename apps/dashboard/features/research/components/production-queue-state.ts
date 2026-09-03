export function productionQueuePresentation(loading: boolean, itemCount: number, error: string | null) {
  if (loading) return { kind: "loading" as const };
  if (error) return { kind: "error" as const };
  if (itemCount === 0) return { kind: "empty" as const, message: "Production queue is empty", showFillQueue: true };
  return { kind: "items" as const };
}

/**
 * Scene Plan records persisted by storage use `sceneIndex`; the public contract
 * uses `index`. Prefer the contract field, while retaining a safe display
 * fallback for records returned by the current API shape.
 */
export function sceneDisplayNumber(
  scene: { index?: unknown; sceneIndex?: unknown },
  fallbackIndex: number,
) {
  const value = Number.isInteger(scene.index)
    ? Number(scene.index)
    : Number.isInteger(scene.sceneIndex)
      ? Number(scene.sceneIndex)
      : fallbackIndex;
  return value + 1;
}
