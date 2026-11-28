import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { clerkRoutes } from "../clerk-routes";

/**
 * Every one of these has to name a route this app actually serves.
 *
 * The bug this guards against shipped to production and was invisible: the four values
 * lived only in `.env.local.example`, the Phase 13 Vercel table never listed them, and
 * an *empty* Clerk URL is not an error — it is a silent fall back to the Dashboard's
 * answers. So `auth.protect()` bounced signed-out visitors to the hosted account
 * portal on another origin in Clerk's default purple, and an owner who signed in was
 * sent to the player app. Nothing failed; lint, typecheck, build and the e2e suite
 * were all green.
 *
 * Holding them in code fixes the deployment half. This fixes the other half: a route
 * can still be renamed out from under them, and the failure would look the same.
 */

const APP = path.join(__dirname, "..", "..", "app");

/** Does the App Router serve `pathname`? Route groups `(x)` do not appear in URLs. */
function routeExists(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);

  // Catch-all optional segments — `sign-in/[[...sign-in]]` — serve the parent too.
  const candidates = [
    path.join(APP, ...segments),
    // One route group may wrap it: `(player)/play`, `(signed-in)/turfs`.
    ...["(player)", "(admin)", "(signed-in)"].map((group) => path.join(APP, group, ...segments)),
  ];

  return candidates.some((dir) => existsSync(dir));
}

describe("clerkRoutes", () => {
  it.each(Object.entries(clerkRoutes))("%s is an in-app path, not an origin", (_name, value) => {
    expect(value.startsWith("/")).toBe(true);
    // An absolute URL here is how you end up back on the account portal.
    expect(value).not.toMatch(/^https?:/);
  });

  it.each(Object.entries(clerkRoutes))("%s points at a route that exists", (_name, value) => {
    expect(routeExists(value)).toBe(true);
  });

  it("keeps sign-in and sign-up on this app's own pages", () => {
    expect(clerkRoutes.signInUrl).toBe("/sign-in");
    expect(clerkRoutes.signUpUrl).toBe("/sign-up");
  });

  it("keeps a signed-in owner in this app rather than the player one", () => {
    // `/` is this app's front door, which redirects a signed-in owner on to /turfs.
    expect(clerkRoutes.signInFallbackRedirectUrl).toBe("/");
    expect(clerkRoutes.signUpFallbackRedirectUrl).toBe("/");
  });
});
