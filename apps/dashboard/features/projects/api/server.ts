import "server-only";

import type { Project } from "@content-os/contracts";

const apiBaseUrl = process.env.CONTENTOS_API_BASE_URL ?? "http://localhost:3001/api";

export class ProjectRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ProjectRequestError";
  }
}

export async function getProject(id: string): Promise<Project | null> {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new ProjectRequestError("Unable to load this project.", response.status);
  }

  return (await response.json()) as Project;
}
