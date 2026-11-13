import { expect, test } from "@playwright/test";

/**
 * The shell, before anybody signs in.
 *
 * There is no public landing page here — every route is one turf's operations — so the
 * smoke test is the chrome plus the gate. A regression in either is the kind that makes
 * the whole app unreachable while every unit test stays green.
 */
test.describe("public shell", () => {
  test("signed-out visitors are sent to sign in", async ({ page }) => {
    await page.goto("/");

    // The `(signed-in)` layout's auth.protect() sends them to Clerk.
    await expect(page).toHaveURL(/sign-in/);
  });

  test("the sign-in page carries the owner wordmark", async ({ page }) => {
    await page.goto("/sign-in");

    // Exactly one visible link whose accessible name is the wordmark, and it is the
    // owner app's — not the player app's.
    await expect(page.getByRole("link", { name: "ChampHub Turf" })).toBeVisible();
  });

  test("language switches to Bangla and the choice sticks", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Language" }).click();
    await page.getByRole("menuitem", { name: "বাংলা" }).click();

    await expect(page.getByRole("link", { name: "চ্যাম্পহাব টার্ফ" })).toBeVisible();

    // Cookie-based, so it must survive a reload without any URL change (D13). The
    // cookie is per origin, so this app's choice is its own — a cashier can run the
    // till in Bangla without changing the language of their player account.
    await page.reload();
    await expect(page.getByRole("link", { name: "চ্যাম্পহাব টার্ফ" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/sign-in");
  });

  test("nothing here invites a search engine in", async ({ page }) => {
    const response = await page.goto("/sign-in");
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  });
});
