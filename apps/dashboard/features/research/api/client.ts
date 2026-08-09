"use client";

import type {
  CreateResearchSourceInput,
  IngestionResult,
  Opportunity,
  OpportunityDetectionResult,
  OpportunityStatus,
  ResearchSource,
  Signal,
  UpdateResearchSourceInput,
} from "@content-os/contracts";

const apiEndpoint = "/api";
const endpoint = `${apiEndpoint}/research-sources`;

export class ResearchApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ResearchApiError";
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
  return requestUrl<Signal[]>(`${apiEndpoint}/signals${query ? `?${query}` : ""}`);
}

export function getOpportunities(projectId?: string) {
  return requestUrl<Opportunity[]>(`${apiEndpoint}/opportunities${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`);
}

export function detectOpportunities(projectId?: string) {
  return requestUrl<OpportunityDetectionResult>(`${apiEndpoint}/opportunities/detect`, { method: "POST", body: JSON.stringify(projectId ? { projectId } : {}) });
}

export function updateOpportunityStatus(id: string, status: OpportunityStatus) {
  return requestUrl<Opportunity>(`${apiEndpoint}/opportunities/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}
