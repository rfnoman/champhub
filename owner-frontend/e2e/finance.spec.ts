import { expect, requiresClerk, test } from "./support/fixtures";

/**
 * Who may read a turf's takings.
 *
 * Moved from the player app's `payments.spec.ts` (DECISIONS D83). The assertion is the
 * same one and it is the important one: being signed into the owner app proves nothing
 * about a particular turf, and the API answers 404 rather than 403 so the existence of
 * a turf's statement is not confirmed to somebody with no business reading it.
 */
test.describe("a turf's finance page", () => {
  requiresClerk();

  test("is for its own staff only", async ({ signedInPage: page }) => {
    const response = await page.goto("/turfs/mirpur-turf-club/finance");
    expect(response?.status()).toBe(404);
  });

  test("and so is its settings page", async ({ signedInPage: page }) => {
    const response = await page.goto("/turfs/mirpur-turf-club");
    expect(response?.status()).toBe(404);
  });
});
