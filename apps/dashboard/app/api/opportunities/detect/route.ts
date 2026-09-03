import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const upstreamBaseUrl =
  process.env.CONTENTOS_API_BASE_URL ?? "http://localhost:3001/api";

/**
 * A request-body preserving proxy for the potentially long-running manual
 * discovery action. Next rewrite proxying is retained for all other API calls.
 */
export async function POST(request: NextRequest) {
  const body = await request.arrayBuffer();
  const upstream = await fetch(`${upstreamBaseUrl}/opportunities/detect`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": request.headers.get("content-type") ?? "application/json",
    },
    body,
    cache: "no-store",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}
