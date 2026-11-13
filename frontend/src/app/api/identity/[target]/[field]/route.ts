import { auth } from "@clerk/nextjs/server";

import { API_BASE_URL } from "@/lib/api/config";

/**
 * Streams one identity document from Django, with this browser's session attached.
 *
 * It exists because those documents have no URL — they live in a private store and the
 * API hands them out one authorised request at a time (DECISIONS D89). An `<img>` tag
 * cannot send an `Authorization` header, so without this route the only way to show a
 * reviewer the NID they are reviewing would be to fetch it into a blob in JavaScript,
 * which breaks the moment the page is server-rendered.
 *
 * `target` is either `me` or a verification id — the first resolves to the person's own
 * document, the second to the admin endpoint, which refuses anyone who is not a
 * platform admin. This route adds no authority of its own: it forwards a token and
 * copies back whatever Django decided.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = new Set(["document_front", "document_back"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ target: string; field: string }> },
) {
  const { target, field } = await params;
  if (!FIELDS.has(field)) return new Response("Not found", { status: 404 });

  const path =
    target === "me"
      ? `/api/v1/me/identity/files/${field}`
      : UUID.test(target)
        ? `/api/v1/admin/identity-verifications/${target}/files/${field}`
        : null;
  if (!path) return new Response("Not found", { status: 404 });

  const token = await (await auth()).getToken();
  if (!token) return new Response("Unauthorized", { status: 401 });

  const upstream = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(null, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      // Same posture as the API: this is somebody's passport, not a turf photo.
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
