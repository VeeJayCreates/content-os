"use client";

import type {
  CreateResearchSourceInput,
  BulkCreateResearchSourcesInput,
  BulkCreateResearchSourcesResult,
  IngestionResult,
  Opportunity,
  OpportunityDetectionResult,
  OpportunityStatus,
  ResearchPackageDetail,
  ResearchPackageGenerationResult,
  ResearchSource,
  TopicSelection,
  TopicSelectionEvaluationResult,
  ProjectSelectionPolicy,
  EditorialAssessment,
  Signal,
  ProductionQueueItem,
  FillProductionQueueResult,
  ContentScript,
  ScenePlan,
  AudioGeneration,
  VisualAssetManifest,
  VisualAssetCandidate,
  VisualAssetAcquisitionRun,
  VideoCompositionPlan,
  VideoCompositionAssetPreparationResult,
  VideoRenderInputManifest,
  VideoRenderJob,
  UpdateResearchSourceInput,
} from "@content-os/contracts";

const apiEndpoint = "/api";
const endpoint = `${apiEndpoint}/research-sources`;

export class ResearchApiError extends Error {
  readonly status?: number;

  constructor(
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "ResearchApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return requestUrl<T>(`${endpoint}${path}`, init);
}

async function requestUrl<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let message = "The request could not be completed. Please try again.";
    try {
      const body: unknown = await response.json();
      if (typeof body === "object" && body !== null && "message" in body) {
        const value = body.message;
        message = Array.isArray(value) ? value.join(" ") : String(value);
      }
    } catch {}
    throw new ResearchApiError(message, response.status);
  }
  return (await response.json()) as T;
}

export function getResearchSources(projectId?: string) {
  return request<ResearchSource[]>(
    projectId ? `?projectId=${encodeURIComponent(projectId)}` : "",
  );
}
export function createResearchSource(input: CreateResearchSourceInput) {
  return request<ResearchSource>("", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export function bulkCreateResearchSources(
  input: BulkCreateResearchSourcesInput,
) {
  return request<BulkCreateResearchSourcesResult>("/bulk", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export function updateResearchSource(
  id: string,
  input: UpdateResearchSourceInput,
) {
  return request<ResearchSource>(`/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
export function deleteResearchSource(id: string) {
  return request<{ success: boolean }>(`/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function ingestResearchSource(id: string) {
  return request<IngestionResult>(`/${encodeURIComponent(id)}/ingest`, {
    method: "POST",
  });
}

export function getSignals(filters?: {
  projectId?: string;
  researchSourceId?: string;
}) {
  const params = new URLSearchParams();

  if (filters?.projectId) params.set("projectId", filters.projectId);
  if (filters?.researchSourceId) {
    params.set("researchSourceId", filters.researchSourceId);
  }

  const query = params.toString();
  return requestUrl<Signal[]>(
    `${apiEndpoint}/signals${query ? `?${query}` : ""}`,
  );
}

export function getOpportunities(projectId?: string) {
  return requestUrl<Opportunity[]>(
    `${apiEndpoint}/opportunities${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`,
  );
}

export function detectOpportunities(projectId?: string) {
  return requestUrl<OpportunityDetectionResult>(
    `${apiEndpoint}/opportunities/detect`,
    { method: "POST", body: JSON.stringify(projectId ? { projectId } : {}) },
  );
}

export function updateOpportunityStatus(id: string, status: OpportunityStatus) {
  return requestUrl<Opportunity>(
    `${apiEndpoint}/opportunities/${encodeURIComponent(id)}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
}

export function buildResearchPackage(opportunityId: string) {
  return requestUrl<ResearchPackageGenerationResult>(
    `${apiEndpoint}/opportunities/${encodeURIComponent(opportunityId)}/research`,
    { method: "POST" },
  );
}

export function getResearchPackage(id: string) {
  return requestUrl<ResearchPackageDetail>(
    `${apiEndpoint}/research-packages/${encodeURIComponent(id)}`,
  );
}
export function getEditorialAssessment(opportunityId: string) {
  return requestUrl<EditorialAssessment>(
    `${apiEndpoint}/opportunities/${encodeURIComponent(opportunityId)}/editorial-assessment`,
  );
}
export function assessEditorialFit(opportunityId: string) {
  return requestUrl<EditorialAssessment>(
    `${apiEndpoint}/opportunities/${encodeURIComponent(opportunityId)}/editorial-assessment`,
    { method: "POST" },
  );
}
export function getTopicSelections(projectId?: string) {
  return requestUrl<TopicSelection[]>(
    `${apiEndpoint}/topic-selections${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`,
  );
}
export function evaluateTopicSelections(projectId?: string) {
  return requestUrl<TopicSelectionEvaluationResult>(
    `${apiEndpoint}/topic-selections/evaluate`,
    { method: "POST", body: JSON.stringify(projectId ? { projectId } : {}) },
  );
}
export function getSelectionPolicy(projectId: string) {
  return requestUrl<ProjectSelectionPolicy>(
    `${apiEndpoint}/projects/${encodeURIComponent(projectId)}/selection-policy`,
  );
}
export type SelectionPolicyUpdateInput = Pick<
  ProjectSelectionPolicy,
  | "minimumOpportunityScore"
  | "minimumResearchConfidence"
  | "minimumIndependentSources"
  | "maxSelectedPerRun"
  | "requireResearchPackage"
  | "allowSingleSourceBreakingStories"
>;
export function updateSelectionPolicy(
  projectId: string,
  policy: SelectionPolicyUpdateInput,
) {
  const payload: SelectionPolicyUpdateInput = {
    minimumOpportunityScore: policy.minimumOpportunityScore,
    minimumResearchConfidence: policy.minimumResearchConfidence,
    minimumIndependentSources: policy.minimumIndependentSources,
    maxSelectedPerRun: policy.maxSelectedPerRun,
    requireResearchPackage: policy.requireResearchPackage,
    allowSingleSourceBreakingStories: policy.allowSingleSourceBreakingStories,
  };
  return requestUrl<ProjectSelectionPolicy>(
    `${apiEndpoint}/projects/${encodeURIComponent(projectId)}/selection-policy`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}
export function getProductionQueue(projectId: string) {
  return requestUrl<ProductionQueueItem[]>(
    `${apiEndpoint}/projects/${encodeURIComponent(projectId)}/production-queue`,
  );
}
export function fillProductionQueue(projectId: string, targetCount: number) {
  return requestUrl<FillProductionQueueResult>(
    `${apiEndpoint}/projects/${encodeURIComponent(projectId)}/production-queue/fill`,
    { method: "POST", body: JSON.stringify({ targetCount }) },
  );
}
export function getQueueContentAngle(queueItemId: string) {
  return requestUrl<EditorialAssessment>(
    `${apiEndpoint}/production-queue/${encodeURIComponent(queueItemId)}/content-angle`,
  );
}
export function generateQueueContentAngle(queueItemId: string) {
  return requestUrl<EditorialAssessment>(
    `${apiEndpoint}/production-queue/${encodeURIComponent(queueItemId)}/content-angle`,
    { method: "POST" },
  );
}
export function getQueueScript(queueItemId: string) {
  return requestUrl<ContentScript>(
    `${apiEndpoint}/production-queue/${encodeURIComponent(queueItemId)}/script`,
  );
}
export function generateQueueScript(queueItemId: string) {
  return requestUrl<ContentScript>(
    `${apiEndpoint}/production-queue/${encodeURIComponent(queueItemId)}/script`,
    { method: "POST", body: JSON.stringify({}) },
  );
}
export function getQueueContentPackage(queueItemId: string) {
  return requestUrl<ContentScript>(
    `${apiEndpoint}/production-queue/${encodeURIComponent(queueItemId)}/content-package`,
  );
}
export function generateQueueContentPackage(queueItemId: string) {
  return requestUrl<ContentScript>(
    `${apiEndpoint}/production-queue/${encodeURIComponent(queueItemId)}/content-package`,
    { method: "POST", body: JSON.stringify({}) },
  );
}
export function getScenePlan(contentScriptId: string) {
  return requestUrl<ScenePlan>(
    `${apiEndpoint}/content-scripts/${encodeURIComponent(contentScriptId)}/scene-plan`,
  );
}
export function generateScenePlan(contentScriptId: string) {
  return requestUrl<ScenePlan>(
    `${apiEndpoint}/content-scripts/${encodeURIComponent(contentScriptId)}/scene-plan`,
    { method: "POST" },
  );
}
export function submitScenePlanBatch(contentScriptIds: string[]) {
  return requestUrl<{
    batchId: string | null;
    submittedItemIds: string[];
    skipped: { contentScriptId: string; reason: string }[];
  }>(`${apiEndpoint}/content-scripts/scene-plans/batch`, {
    method: "POST",
    body: JSON.stringify({ contentScriptIds }),
  });
}
export function reconcileScenePlanBatch(batchId: string) {
  return requestUrl<{
    batchId: string;
    processed: number;
    succeeded: number;
    failed: number;
  }>(
    `${apiEndpoint}/content-scripts/scene-plans/batch/${encodeURIComponent(batchId)}/reconcile`,
    { method: "POST" },
  );
}
export function getAudioGeneration(contentScriptId: string) {
  return requestUrl<AudioGeneration>(
    `${apiEndpoint}/content-scripts/${encodeURIComponent(contentScriptId)}/audio-generation`,
  );
}
export function generateAudio(contentScriptId: string) {
  return requestUrl<AudioGeneration>(
    `${apiEndpoint}/content-scripts/${encodeURIComponent(contentScriptId)}/audio-generation`,
    { method: "POST" },
  );
}
export function audioMediaUrl(contentScriptId: string) {
  return `${apiEndpoint}/content-scripts/${encodeURIComponent(contentScriptId)}/audio-generation/audio`;
}
export function audioSegmentMediaUrl(
  contentScriptId: string,
  segmentId: string,
) {
  return `${apiEndpoint}/content-scripts/${encodeURIComponent(contentScriptId)}/audio-generation/segments/${encodeURIComponent(segmentId)}/audio`;
}
export type VisualAssetCandidateInput = {
  provider: string;
  providerAssetId?: string;
  sourceUrl?: string;
  mediaType: "image" | "video";
  mimeType?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  title?: string;
  licenceType?: string;
  licenceUrl?: string;
  attributionText?: string;
  commercialUseAllowed?: boolean;
  modificationAllowed?: boolean;
  provenanceScore?: number;
  overallScore?: number;
};
const visualAssetPath = (contentScriptId: string) =>
  `${apiEndpoint}/content-scripts/${encodeURIComponent(contentScriptId)}/visual-asset-manifest`;
export function prepareVisualAssetManifest(contentScriptId: string) {
  return requestUrl<VisualAssetManifest>(visualAssetPath(contentScriptId), {
    method: "POST",
  });
}
export function getVisualAssetManifest(contentScriptId: string) {
  return requestUrl<VisualAssetManifest>(visualAssetPath(contentScriptId));
}
const visualAssetAcquisitionPath = (contentScriptId: string) =>
  `${visualAssetPath(contentScriptId)}/visual-asset-acquisitions`;
export function prepareVisualAssetAcquisition(contentScriptId: string) {
  return requestUrl<VisualAssetAcquisitionRun>(
    visualAssetAcquisitionPath(contentScriptId),
    { method: "POST" },
  );
}
export function getLatestVisualAssetAcquisition(contentScriptId: string) {
  return requestUrl<VisualAssetAcquisitionRun>(
    `${visualAssetAcquisitionPath(contentScriptId)}/latest`,
  );
}
export function executeVisualAssetAcquisition(
  contentScriptId: string,
  runId: string,
) {
  return requestUrl<VisualAssetAcquisitionRun>(
    `${visualAssetAcquisitionPath(contentScriptId)}/${encodeURIComponent(runId)}/execute`,
    { method: "POST" },
  );
}
export function listVisualAssetCandidates(
  contentScriptId: string,
  requirementId: string,
) {
  return requestUrl<VisualAssetCandidate[]>(
    `${visualAssetPath(contentScriptId)}/requirements/${encodeURIComponent(requirementId)}/candidates`,
  );
}
export function upsertVisualAssetCandidate(
  contentScriptId: string,
  requirementId: string,
  input: VisualAssetCandidateInput,
) {
  return requestUrl<VisualAssetCandidate>(
    `${visualAssetPath(contentScriptId)}/requirements/${encodeURIComponent(requirementId)}/candidates`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
export function selectVisualAssetCandidate(
  contentScriptId: string,
  requirementId: string,
  candidateId: string,
) {
  return requestUrl<VisualAssetManifest>(
    `${visualAssetPath(contentScriptId)}/requirements/${encodeURIComponent(requirementId)}/candidates/${encodeURIComponent(candidateId)}/select`,
    { method: "POST" },
  );
}
export function rejectVisualAssetCandidate(
  contentScriptId: string,
  requirementId: string,
  candidateId: string,
  reason: string,
) {
  return requestUrl<VisualAssetManifest>(
    `${visualAssetPath(contentScriptId)}/requirements/${encodeURIComponent(requirementId)}/candidates/${encodeURIComponent(candidateId)}/reject`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}
export function clearVisualAssetCandidateSelection(
  contentScriptId: string,
  requirementId: string,
) {
  return requestUrl<VisualAssetManifest>(
    `${visualAssetPath(contentScriptId)}/requirements/${encodeURIComponent(requirementId)}/selection`,
    { method: "DELETE" },
  );
}
export function finalizeVisualAssetManifest(contentScriptId: string) {
  return requestUrl<VisualAssetManifest>(
    `${visualAssetPath(contentScriptId)}/finalize`,
    { method: "POST" },
  );
}

const videoProductionPath = (contentScriptId: string) =>
  `${apiEndpoint}/content-scripts/${encodeURIComponent(contentScriptId)}`;

export function prepareVideoComposition(contentScriptId: string) {
  return requestUrl<VideoCompositionPlan>(
    `${videoProductionPath(contentScriptId)}/video-composition-plan`,
    { method: "POST" },
  );
}

export function bindVideoCompositionAssets(contentScriptId: string) {
  return requestUrl<VideoCompositionAssetPreparationResult>(
    `${videoProductionPath(contentScriptId)}/video-composition-plan/assets`,
    { method: "POST" },
  );
}

export function prepareVideoRenderInput(contentScriptId: string) {
  return requestUrl<VideoRenderInputManifest>(
    `${videoProductionPath(contentScriptId)}/video-render-input-manifest`,
    { method: "POST" },
  );
}

export function enqueueVideoRender(contentScriptId: string) {
  return requestUrl<VideoRenderJob>(
    `${videoProductionPath(contentScriptId)}/video-render-jobs`,
    { method: "POST" },
  );
}

export function retryVideoRender(contentScriptId: string) {
  return requestUrl<VideoRenderJob>(
    `${videoProductionPath(contentScriptId)}/video-render-jobs/retry`,
    { method: "POST" },
  );
}

export function getVideoRenderStatus(contentScriptId: string) {
  return requestUrl<VideoRenderJob>(
    `${videoProductionPath(contentScriptId)}/video-render-job`,
  );
}

export function videoRenderOutputUrl(contentScriptId: string) {
  return `${videoProductionPath(contentScriptId)}/video-render-job/output`;
}
