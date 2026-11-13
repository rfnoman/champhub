import { env } from "@/lib/env";

/**
 * Origin of the player app.
 *
 * The two frontends are separate deployments on separate origins, so every crossing
 * between them is an absolute URL rather than a route: the public turf page, a player's
 * profile, the marketing site. Trailing slashes are trimmed so callers can append a
 * path without producing `//turfs/x`.
 */
export function playerAppUrl(): string {
  return env(process.env.NEXT_PUBLIC_PLAYER_APP_URL, "http://localhost:3000").replace(/\/+$/, "");
}
