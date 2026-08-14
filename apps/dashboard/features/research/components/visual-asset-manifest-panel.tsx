"use client";

import * as React from "react";
import type {
  SceneVisualRequirement,
  VisualAssetCandidate,
  VisualAssetManifest,
} from "@content-os/contracts";
import { Button } from "@/components/ui/button";
import {
  clearVisualAssetCandidateSelection,
  finalizeVisualAssetManifest,
  listVisualAssetCandidates,
  rejectVisualAssetCandidate,
  selectVisualAssetCandidate,
  upsertVisualAssetCandidate,
  type VisualAssetCandidateInput,
} from "@/features/research/api/client";

const readable = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const duration = (milliseconds: number) =>
  `${Math.max(1, Math.round(milliseconds / 1000))} sec`;
const emptyCandidate = (): VisualAssetCandidateInput => ({
  provider: "",
  providerAssetId: "",
  sourceUrl: "",
  mediaType: "image",
  commercialUseAllowed: undefined,
  modificationAllowed: undefined,
});
const optionalText = (value: string | undefined) => value?.trim() || undefined;
const candidateInput = (
  value: VisualAssetCandidateInput,
): VisualAssetCandidateInput => ({
  ...value,
  provider: value.provider.trim(),
  providerAssetId: optionalText(value.providerAssetId),
  sourceUrl: optionalText(value.sourceUrl),
  mimeType: optionalText(value.mimeType),
  licenceType: optionalText(value.licenceType),
  attributionText: optionalText(value.attributionText),
});
const fieldError = (value: VisualAssetCandidateInput) => {
  if (
    (value.width !== undefined &&
      (!Number.isInteger(value.width) ||
        value.width < 1 ||
        value.width > 20_000)) ||
    (value.height !== undefined &&
      (!Number.isInteger(value.height) ||
        value.height < 1 ||
        value.height > 20_000))
  )
    return "Width and height must be positive integers up to 20,000.";
  if (
    value.durationMs !== undefined &&
    (!Number.isInteger(value.durationMs) ||
      value.durationMs < 1 ||
      value.durationMs > 86_400_000)
  )
    return "Duration must be a positive bounded integer.";
  if (
    [value.provenanceScore, value.overallScore].some(
      (score) =>
        score !== undefined &&
        (!Number.isFinite(score) || score < 0 || score > 100),
    )
  )
    return "Scores must be finite values from 0 to 100.";
  if (
    value.mimeType &&
    value.mediaType === "image" &&
    !value.mimeType.startsWith("image/")
  )
    return "Image candidates require an image MIME type.";
  if (
    value.mimeType &&
    value.mediaType === "video" &&
    !value.mimeType.startsWith("video/")
  )
    return "Video candidates require a video MIME type.";
  return null;
};
const unsafe = (
  candidate: VisualAssetCandidate,
  requirement: SceneVisualRequirement,
) =>
  (!candidate.providerAssetId && !candidate.sourceUrl) ||
  candidate.commercialUseAllowed !== true ||
  candidate.modificationAllowed !== true ||
  (requirement.licenceRequirements.attributionRequired &&
    !candidate.attributionText) ||
  candidate.mediaType !== requirement.expectedMediaType ||
  candidate.status === "rejected";

export function VisualAssetManifestPanel({
  contentScriptId,
  manifest,
  pending,
  onMutation,
}: {
  contentScriptId: string;
  manifest: VisualAssetManifest;
  pending: boolean;
  onMutation: () => Promise<void>;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [candidates, setCandidates] = React.useState<
    Record<string, VisualAssetCandidate[]>
  >({});
  const [forms, setForms] = React.useState<
    Record<string, VisualAssetCandidateInput>
  >({});
  const [action, setAction] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const mounted = React.useRef(true);
  const requests = React.useRef<Record<string, number>>({});
  React.useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const load = React.useCallback(
    async (requirementId: string) => {
      const request = (requests.current[requirementId] ?? 0) + 1;
      requests.current[requirementId] = request;
      try {
        const value = await listVisualAssetCandidates(
          contentScriptId,
          requirementId,
        );
        if (mounted.current && requests.current[requirementId] === request)
          setCandidates((current) => ({ ...current, [requirementId]: value }));
      } catch (reason) {
        if (mounted.current)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load candidates.",
          );
      }
    },
    [contentScriptId],
  );
  React.useEffect(() => {
    if (expanded)
      manifest.requirements.forEach((requirement) => {
        void load(requirement.id);
      });
  }, [expanded, load, manifest.requirements]);
  const mutate = async (key: string, operation: () => Promise<unknown>) => {
    if (action) return;
    setAction(key);
    setError(null);
    try {
      await operation();
      await onMutation();
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Visual Asset action failed.",
        );
    } finally {
      if (mounted.current) setAction(null);
    }
  };
  const resolved = manifest.requirements.filter(
    (requirement) =>
      requirement.selectedCandidateId ||
      requirement.acquisitionStrategy === "none_required",
  ).length;
  return (
    <section
      className="space-y-2 rounded border p-3"
      aria-label="Visual Asset manifest"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-foreground">
          Visual Assets · {readable(manifest.status)}
        </p>
        <p>
          {resolved}/{manifest.requirements.length} requirements resolved ·{" "}
          {manifest.manifestVersion}
        </p>
        <Button
          size="sm"
          variant="outline"
          aria-expanded={expanded}
          aria-controls={`visual-manifest-${manifest.id}`}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? "Hide Visual Assets"
            : manifest.status === "ready"
              ? "Review Visual Assets"
              : "Continue Review"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || action !== null}
          onClick={() =>
            void mutate("finalize", () =>
              finalizeVisualAssetManifest(contentScriptId),
            )
          }
        >
          Recalculate Readiness
        </Button>
      </div>
      {manifest.failureReason ? (
        <p role="status" className="text-amber-600">
          {manifest.failureReason}
        </p>
      ) : null}
      {error ? (
        <p role="status" className="text-destructive">
          {error}
        </p>
      ) : null}
      {expanded ? (
        <div
          id={`visual-manifest-${manifest.id}`}
          className="max-h-[70vh] space-y-3 overflow-y-auto"
          aria-live="polite"
        >
          {manifest.requirements.map((requirement) => {
            const value = forms[requirement.id] ?? emptyCandidate();
            const list = candidates[requirement.id] ?? [];
            const validation = fieldError(value);
            return (
              <article
                key={requirement.id}
                className="space-y-2 break-words rounded border p-3"
              >
                <p className="font-medium text-foreground">
                  Scene {requirement.sceneIndex + 1} ·{" "}
                  {duration(requirement.targetDurationMs)} ·{" "}
                  {readable(requirement.requirementType)}
                </p>
                <p>
                  Strategy: {readable(requirement.acquisitionStrategy)} · Media:{" "}
                  {readable(requirement.expectedMediaType)}
                </p>
                <p className="text-foreground">
                  Visual direction: {requirement.visualDescription}
                </p>
                <p>
                  Narration excerpt: {requirement.visualObjective.slice(0, 180)}
                </p>
                {requirement.primarySearchQuery ? (
                  <p>Primary search: {requirement.primarySearchQuery}</p>
                ) : null}
                {requirement.alternateSearchQueries.length ? (
                  <p>
                    Alternates: {requirement.alternateSearchQueries.join(" · ")}
                  </p>
                ) : null}
                {requirement.generationPrompt ? (
                  <p>Generation guidance: {requirement.generationPrompt}</p>
                ) : null}
                {requirement.sourceFactIds.length ? (
                  <p>Facts: {requirement.sourceFactIds.join(", ")}</p>
                ) : null}
                {requirement.mapSpecification ||
                requirement.programmaticSpecification ||
                requirement.textCardSpecification ? (
                  <p>
                    Specification plan available; media is not rendered here.
                  </p>
                ) : null}
                <p>
                  Licence: commercial{" "}
                  {requirement.licenceRequirements.commercialUseRequired
                    ? "required"
                    : "not required"}{" "}
                  · modification{" "}
                  {requirement.licenceRequirements.modificationAllowed
                    ? "required"
                    : "not required"}
                  {requirement.licenceRequirements.attributionRequired
                    ? " · attribution required"
                    : ""}
                </p>
                {requirement.manualReviewRequired ? (
                  <p className="text-amber-600">
                    Manual review:{" "}
                    {requirement.reviewReasons.join(", ") || "Required"}
                  </p>
                ) : null}
                <div className="grid gap-2 rounded bg-muted/30 p-2 sm:grid-cols-2">
                  <label>
                    Provider
                    <input
                      className="mt-1 w-full rounded border bg-background p-1"
                      value={value.provider}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [requirement.id]: {
                            ...value,
                            provider: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Asset ID
                    <input
                      className="mt-1 w-full rounded border bg-background p-1"
                      value={value.providerAssetId ?? ""}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [requirement.id]: {
                            ...value,
                            providerAssetId: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    HTTPS source URL
                    <input
                      className="mt-1 w-full rounded border bg-background p-1"
                      placeholder="https://"
                      value={value.sourceUrl ?? ""}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [requirement.id]: {
                            ...value,
                            sourceUrl: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Media type
                    <select
                      className="mt-1 w-full rounded border bg-background p-1"
                      value={value.mediaType}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [requirement.id]: {
                            ...value,
                            mediaType: event.target.value as "image" | "video",
                            durationMs:
                              event.target.value === "image"
                                ? undefined
                                : value.durationMs,
                          },
                        }))
                      }
                    >
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                  </label>
                  <label>
                    Licence identity
                    <input
                      className="mt-1 w-full rounded border bg-background p-1"
                      value={value.licenceType ?? ""}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [requirement.id]: {
                            ...value,
                            licenceType: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Attribution
                    <input
                      className="mt-1 w-full rounded border bg-background p-1"
                      value={value.attributionText ?? ""}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [requirement.id]: {
                            ...value,
                            attributionText: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Width{" "}
                    <span className="text-muted-foreground">(optional)</span>
                    <input
                      className="mt-1 w-full rounded border bg-background p-1"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={20000}
                      value={value.width ?? ""}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [requirement.id]: {
                            ...value,
                            width:
                              event.currentTarget.value === ""
                                ? undefined
                                : event.currentTarget.valueAsNumber,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Height{" "}
                    <span className="text-muted-foreground">(optional)</span>
                    <input
                      className="mt-1 w-full rounded border bg-background p-1"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={20000}
                      value={value.height ?? ""}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [requirement.id]: {
                            ...value,
                            height:
                              event.currentTarget.value === ""
                                ? undefined
                                : event.currentTarget.valueAsNumber,
                          },
                        }))
                      }
                    />
                  </label>
                  {value.mediaType === "video" ? (
                    <label>
                      Duration ms{" "}
                      <span className="text-muted-foreground">(optional)</span>
                      <input
                        className="mt-1 w-full rounded border bg-background p-1"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={86400000}
                        value={value.durationMs ?? ""}
                        onChange={(event) =>
                          setForms((current) => ({
                            ...current,
                            [requirement.id]: {
                              ...value,
                              durationMs:
                                event.currentTarget.value === ""
                                  ? undefined
                                  : event.currentTarget.valueAsNumber,
                            },
                          }))
                        }
                      />
                    </label>
                  ) : null}
                  <label>
                    MIME type{" "}
                    <span className="text-muted-foreground">(optional)</span>
                    <input
                      className="mt-1 w-full rounded border bg-background p-1"
                      placeholder={
                        value.mediaType === "video" ? "video/mp4" : "image/jpeg"
                      }
                      value={value.mimeType ?? ""}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [requirement.id]: {
                            ...value,
                            mimeType: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Provenance score{" "}
                    <span className="text-muted-foreground">(0–100)</span>
                    <input
                      className="mt-1 w-full rounded border bg-background p-1"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      value={value.provenanceScore ?? ""}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [requirement.id]: {
                            ...value,
                            provenanceScore:
                              event.currentTarget.value === ""
                                ? undefined
                                : event.currentTarget.valueAsNumber,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Overall score{" "}
                    <span className="text-muted-foreground">(0–100)</span>
                    <input
                      className="mt-1 w-full rounded border bg-background p-1"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      value={value.overallScore ?? ""}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [requirement.id]: {
                            ...value,
                            overallScore:
                              event.currentTarget.value === ""
                                ? undefined
                                : event.currentTarget.valueAsNumber,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={value.commercialUseAllowed === true}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [requirement.id]: {
                            ...value,
                            commercialUseAllowed: event.target.checked,
                          },
                        }))
                      }
                    />{" "}
                    Commercial use allowed
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={value.modificationAllowed === true}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [requirement.id]: {
                            ...value,
                            modificationAllowed: event.target.checked,
                          },
                        }))
                      }
                    />{" "}
                    Modification allowed
                  </label>
                </div>
                {validation ? (
                  <p role="status" className="text-destructive">
                    {validation}
                  </p>
                ) : null}
                <Button
                  size="sm"
                  disabled={
                    action !== null ||
                    validation !== null ||
                    !value.provider ||
                    (!value.providerAssetId && !value.sourceUrl)
                  }
                  onClick={() =>
                    void mutate(`add:${requirement.id}`, async () => {
                      await upsertVisualAssetCandidate(
                        contentScriptId,
                        requirement.id,
                        candidateInput(value),
                      );
                      setForms((current) => ({
                        ...current,
                        [requirement.id]: emptyCandidate(),
                      }));
                      await load(requirement.id);
                    })
                  }
                >
                  {action === `add:${requirement.id}`
                    ? "Saving…"
                    : "Add candidate"}
                </Button>
                <div className="space-y-2">
                  {list.map((candidate) => (
                    <div key={candidate.id} className="rounded border p-2">
                      <p className="text-foreground">
                        {candidate.provider} ·{" "}
                        {candidate.providerAssetId ?? "Source candidate"} ·{" "}
                        {readable(candidate.status)}
                      </p>
                      {candidate.sourceUrl ? (
                        <a
                          className="break-all underline"
                          href={candidate.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open source (external)
                        </a>
                      ) : null}
                      <p>
                        {readable(candidate.mediaType)} · commercial:{" "}
                        {String(candidate.commercialUseAllowed)} · modification:{" "}
                        {String(candidate.modificationAllowed)}
                      </p>
                      {candidate.width || candidate.height ? (
                        <p>
                          Resolution: {candidate.width ?? "?"} ×{" "}
                          {candidate.height ?? "?"}
                        </p>
                      ) : null}
                      {candidate.durationMs ? (
                        <p>Duration: {duration(candidate.durationMs)}</p>
                      ) : null}
                      {candidate.mimeType ? (
                        <p>MIME type: {candidate.mimeType}</p>
                      ) : null}
                      {candidate.provenanceScore !== null ||
                      candidate.overallScore !== null ? (
                        <p>
                          Scores: provenance {candidate.provenanceScore ?? "—"}{" "}
                          · overall {candidate.overallScore ?? "—"}
                        </p>
                      ) : null}
                      {candidate.attributionText ? (
                        <p>Attribution: {candidate.attributionText}</p>
                      ) : null}
                      {unsafe(candidate, requirement) ? (
                        <p className="text-amber-600">
                          Cannot safely select: provenance, licence,
                          attribution, media, or rejection requires review.
                        </p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            action !== null || unsafe(candidate, requirement)
                          }
                          onClick={() =>
                            void mutate(`select:${candidate.id}`, () =>
                              selectVisualAssetCandidate(
                                contentScriptId,
                                requirement.id,
                                candidate.id,
                              ),
                            )
                          }
                        >
                          {requirement.selectedCandidateId === candidate.id
                            ? "Selected"
                            : requirement.selectedCandidateId
                              ? "Replace selection"
                              : "Select"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={action !== null}
                          onClick={() =>
                            void mutate(`reject:${candidate.id}`, () =>
                              rejectVisualAssetCandidate(
                                contentScriptId,
                                requirement.id,
                                candidate.id,
                                "Not suitable for this visual requirement",
                              ),
                            )
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action !== null || !requirement.selectedCandidateId}
                  onClick={() =>
                    void mutate(`clear:${requirement.id}`, () =>
                      clearVisualAssetCandidateSelection(
                        contentScriptId,
                        requirement.id,
                      ),
                    )
                  }
                >
                  Clear selection
                </Button>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
