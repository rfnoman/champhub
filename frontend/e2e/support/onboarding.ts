import { expect, type Page } from "@playwright/test";

/**
 * Claiming a handle on the wizard's first step (DOMAIN §1b).
 *
 * Every authenticated spec signs in a brand-new Clerk account and walks the onboarding
 * wizard to get at the thing it actually tests, and since a username is required there,
 * "Next" stays disabled until one is typed and the availability check comes back. This
 * is that step, in one place, so thirteen specs do not each own a copy of it.
 */

/**
 * A handle no other run can collide with.
 *
 * Handles are globally unique and the e2e accounts are real accounts in a real Clerk
 * instance, so a fixed one would pass once and then fail forever. Kept well inside the
 * 20-character limit, lowercase, and starting with a letter.
 */
export function uniqueHandle(prefix = "e2e"): string {
  const stamp = Date.now().toString(36);
  const noise = Math.random().toString(36).slice(2, 5);
  return `${prefix}_${stamp}${noise}`.toLowerCase();
}

/**
 * Fill the username field and wait for the check to say it is free.
 *
 * By element id rather than by label, and asserting on the handle rather than on the
 * sentence around it: journey 7 runs the whole wizard in Bangla, and a locator tied to
 * English wording would quietly reduce that journey to a test of the language switcher.
 * Both catalogues interpolate `@{username}` into the "it is yours" line, and neither
 * puts it in a refusal — so the handle appearing in the hint *is* the confirmation.
 */
export async function pickUsername(page: Page, handle = uniqueHandle()): Promise<string> {
  await page.locator("#username").fill(handle);
  // Waiting on the answer rather than on a timeout: "Next" stays disabled until the
  // server has replied, so clicking any earlier is a flake.
  await expect(page.locator("#username-hint")).toContainText(`@${handle}`);
  return handle;
}
