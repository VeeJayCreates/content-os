"use client";

import type { Content, CreateContentInput, UpdateContentInput } from "@content-os/contracts";

const contentEndpoint = "/api/content";

export class ContentApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ContentApiError";
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
  const response = await fetch(`${contentEndpoint}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ContentApiError(await getErrorMessage(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getContent(projectId?: string) {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  return request<Content[]>(query);
}

export function createContent(input: CreateContentInput) {
  return request<Content>("", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateContent(id: string, input: UpdateContentInput) {
  return request<Content>(`/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteContent(id: string) {
  return request<{ success: boolean }>(`/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
