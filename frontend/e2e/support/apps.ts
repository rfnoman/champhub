import { test } from "./fixtures";

/**
 * The owner app's origin.
 *
 * Running a turf is a separate deployment (DECISIONS D83) with its own Playwright
 * suite, so almost nothing here needs this. The exceptions are the launch journeys,
 * which exist precisely to cross seams — an owner lists a turf and an admin approves
 * it; a player orders from the warehouse while a cashier sells off the turf's own shelf
 * — and a journey that stops at the app boundary stops testing the thing it is for.
 *
 * In development the two apps are `localhost:3000` and `localhost:3001`. Cookies ignore
 * the port, so one sign-in carries across both. In production they must share a
 * registrable domain for the same reason (a subdomain, or a Clerk satellite domain) —
 * see `owner-frontend/README.md`.
 */
export function ownerAppUrl(): string {
  return (process.env.OWNER_APP_URL ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
}

/** A URL in the owner app, for the few specs that cross into it. */
export function ownerUrl(path: string): string {
  return `${ownerAppUrl()}${path}`;
}

/**
 * Skip a spec when the owner app is not running.
 *
 * `playwright.config.ts` starts this app and no other, so a cross-app journey would
 * otherwise fail with a connection error that says nothing about the product. Start it
 * with `./scripts/dev.sh` (or `npm run start` in `owner-frontend/`) and these run.
 */
export async function requiresOwnerApp(): Promise<void> {
  try {
    await fetch(ownerAppUrl(), { redirect: "manual", signal: AbortSignal.timeout(3000) });
  } catch {
    test.skip(true, `The owner app is not reachable at ${ownerAppUrl()}.`);
  }
}
