"use client";

import {
  ProductionQueueStatus,
  type AgentPipeline,
  type AgentRun,
  type AgentRunDetail,
  type AgentRunStatus,
  type ProductionQueueItem,
  type Project,
} from "@content-os/contracts";

export type AgentRunFilters = {
  projectId?: string;
  agentKey?: string;
  status?: AgentRunStatus;
  limit?: number;
};

export class AgentRuntimeApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AgentRuntimeApiError";
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  if (!response.ok) {
    let message = "The agent runtime request could not be completed.";
    try {
      const body: unknown = await response.json();
      if (typeof body === "object" && body !== null && "message" in body) {
        const value = body.message;
        message = Array.isArray(value) ? value.join(" ") : String(value);
      }
    } catch {}
    throw new AgentRuntimeApiError(message, response.status);
  }
  return (await response.json()) as T;
}

export function listAgentRuns(filters: AgentRunFilters = {}) {
  const query = new URLSearchParams();
  if (filters.projectId) query.set("projectId", filters.projectId);
  if (filters.agentKey) query.set("agentKey", filters.agentKey);
  if (filters.status) query.set("status", filters.status);
  if (filters.limit !== undefined) query.set("limit", String(filters.limit));
  const suffix = query.toString();
  return request<AgentRun[]>(`/api/agent-runs${suffix ? `?${suffix}` : ""}`);
}

/** Bounded room set, unpaged server query: history volume cannot hide room state. */
export function listAgentRunsByAgent(agentKeys: readonly string[]) {
  const query = new URLSearchParams({ agentKeys: agentKeys.join(",") });
  return request<AgentRun[]>(`/api/agent-runs/office?${query}`);
}

export function getAgentRun(id: string) {
  return request<AgentRunDetail>(`/api/agent-runs/${encodeURIComponent(id)}`);
}

export function getAgentPipeline(productionQueueItemId: string) {
  return request<AgentPipeline>(`/api/agent-pipelines/production-queue/${encodeURIComponent(productionQueueItemId)}/synchronize`, { method: "POST" });
}

const TERMINAL_PIPELINE_DISCOVERY_LIMIT = 50;

/** Discover observable pipeline work from its source of truth, independently of run history. */
export async function listAgentPipelines(additionalQueueItemIds: string[] = []) {
  const projectResult = await Promise.allSettled([request<Project[]>("/api/projects")]);
  const projects = projectResult[0]?.status === "fulfilled" ? projectResult[0].value : [];
  const queueResults = await Promise.allSettled(
    projects.map((project) =>
      request<ProductionQueueItem[]>(
        `/api/projects/${encodeURIComponent(project.id)}/production-queue`,
      ),
    ),
  );
  const activeStatuses = new Set<ProductionQueueStatus>([
    ProductionQueueStatus.QUEUED,
    ProductionQueueStatus.PROCESSING,
  ]);
  const queueItemIds = new Set(additionalQueueItemIds);
  const queueItems = queueResults.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  for (const item of queueItems) {
    if (activeStatuses.has(item.status)) queueItemIds.add(item.id);
  }
  queueItems
    .filter(
      (item) =>
        item.status === ProductionQueueStatus.FAILED ||
        item.status === ProductionQueueStatus.COMPLETED,
    )
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    )
    .slice(0, TERMINAL_PIPELINE_DISCOVERY_LIMIT)
    .forEach((item) => queueItemIds.add(item.id));
  const results = await Promise.allSettled([...queueItemIds].map(getAgentPipeline));
  return {
    pipelines: results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    ),
    partial:
      projectResult.some((result) => result.status === "rejected") ||
      queueResults.some((result) => result.status === "rejected") ||
      results.some((result) => result.status === "rejected"),
  };
}
