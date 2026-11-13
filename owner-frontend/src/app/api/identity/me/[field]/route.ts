import { auth } from "@clerk/nextjs/server";

import { API_BASE_URL } from "@/lib/api/config";

/**
 * Streams one of the signed-in owner's identity documents from Django.
 *
 * The player app's copy of this route also serves the admin review queue; this one does
 * not, because nothing in the owner app reviews anybody. Identity documents have no URL
 * of their own (DECISIONS D89) and an `<img>` cannot send a bearer token, so a route
 * that forwards the session is the only way to show somebody the scan they uploaded.
 */
const FIELDS = new Set(["document_front", "document_back"]);

export async function GET(_request: Request, { params }: { params: Promise<{ field: string }> }) {
  const { field } = await params;
  if (!FIELDS.has(field)) return new Response("Not found", { status: 404 });

  const token = await (await auth()).getToken();
  if (!token) return new Response("Unauthorized", { status: 401 });

  const upstream = await fetch(`${API_BASE_URL}/api/v1/me/identity/files/${field}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(null, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
