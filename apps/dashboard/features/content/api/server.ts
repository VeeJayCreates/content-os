import "server-only";

import type { Content } from "@content-os/contracts";

const apiBaseUrl = process.env.CONTENTOS_API_BASE_URL ?? "http://localhost:3001/api";

export class ContentRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ContentRequestError";
  }
}

export async function getContentItem(id: string): Promise<Content | null> {
  const response = await fetch(`${apiBaseUrl}/content/${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new ContentRequestError("Unable to load this content item.", response.status);
  }

  return (await response.json()) as Content;
}
