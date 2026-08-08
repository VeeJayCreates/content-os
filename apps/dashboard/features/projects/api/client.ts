"use client";

import type { CreateProjectInput, Project } from "@content-os/contracts";

const projectsEndpoint = "/api/projects";

export class ProjectsApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ProjectsApiError";
  }
}

async function getErrorMessage(response: Response) {
  try {
    const body: unknown = await response.json();

    if (typeof body === "object" && body !== null && "message" in body) {
      const message = body.message;
      return Array.isArray(message) ? message.join(" ") : String(message);
    }
  } catch {
    // The API may return an empty response for an infrastructure error.
  }

  return "The request could not be completed. Please try again.";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${projectsEndpoint}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ProjectsApiError(await getErrorMessage(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getProjects() {
  return request<Project[]>("");
}

export function createProject(input: CreateProjectInput) {
  return request<Project>("", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteProject(id: string) {
  return request<{ success: boolean }>(`/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
