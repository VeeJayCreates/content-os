"use client";

import type { AgentRun, AgentRunDetail, AgentRunStatus } from "@content-os/contracts";

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

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
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

export function getAgentRun(id: string) {
  return request<AgentRunDetail>(`/api/agent-runs/${encodeURIComponent(id)}`);
}
