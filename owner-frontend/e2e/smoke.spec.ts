import { expect, test } from "@playwright/test";

/**
 * The shell, before anybody signs in.
 *
 * `/` is the owner landing page and the only public route in this app; everything else
 * is one turf's operations and sits behind the `(signed-in)` gate. The smoke test is
 * the chrome, the landing, and the gate — a regression in any of them makes the whole
 * app either unreachable or unsellable while every unit test stays green.
 */
test.describe("public shell", () => {
  test("signed-out visitors get the landing page, not a login box", async ({ page }) => {
    await page.goto("/");

    // Still on `/`: a stranger who clicked "list your turf" in the player app has to
    // meet the argument for registering before the sign-in form.
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Stop taking bookings on WhatsApp" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Register your turf" }).first()).toBeVisible();
  });

  test("exactly one h1 on the landing page", async ({ page }) => {
    await page.goto("/");

    // Playwright's strict mode trips over two, and so does a screen reader's heading
    // list. The hero owns the only one.
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("the gate still holds behind it", async ({ page }) => {
    // The landing is public; the turf operations are not. The `(signed-in)` layout's
    // auth.protect() sends a signed-out visitor to Clerk (DECISIONS D12).
    await page.goto("/turfs");

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
