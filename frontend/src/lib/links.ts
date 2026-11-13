import { env } from "@/lib/env";

/**
 * Origin of the owner app.
 *
 * Running a turf moved to its own deployment (DECISIONS D83), so every link from here
 * into it is an absolute URL rather than a route: the header's overflow menu, and the
 * two calls to action on the landing page. Trailing slashes are trimmed so callers can
 * append a path without producing `//turfs/x`.
 */
export function ownerAppUrl(): string {
  return env(process.env.NEXT_PUBLIC_OWNER_APP_URL, "http://localhost:3001").replace(/\/+$/, "");
}

/**
 * Public origin of *this* app, for a link somebody is meant to paste elsewhere.
 *
 * `NEXT_PUBLIC_SITE_URL` is already the deployment's own origin (it backs the Open
 * Graph image URLs), so a shareable profile link reads from the same place rather than
 * from `window.location` — which would hand somebody a `localhost` link off a staging
 * box, or a link through whatever proxy hostname they happened to arrive on.
 */
export function playerAppOrigin(): string {
  return env(process.env.NEXT_PUBLIC_SITE_URL, "http://localhost:3000").replace(/\/+$/, "");
}
