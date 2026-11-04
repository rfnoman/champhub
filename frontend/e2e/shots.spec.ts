import { clerk } from "@clerk/testing/playwright";

import { expect, requiresClerk, test } from "./support/fixtures";

/**
 * Not a test — a screenshot harness for reviewing the Phase 12 design.
 *
 * It reuses the signed-in fixture because the authenticated screens cannot be reached
 * any other way, and runs only when asked for by name.
 */
const OUT = process.env.SHOT_DIR ?? "/tmp/shots";

test.describe("design review", () => {
  test.skip(!process.env.SHOT_DIR, "Set SHOT_DIR to capture design screenshots.");

  test("captures the signed-in screens", async ({ signedInPage: page }) => {
    requiresClerk();
    test.setTimeout(300_000);

    await page.goto("/onboarding");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: /Football/ }).click();
    await page.screenshot({ path: `${OUT}/30-onboarding.png`, fullPage: true });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page).toHaveURL(/profile/);

    for (const [name, path] of [
      ["31-profile", "/profile"],
      ["32-turfs", "/turfs"],
      ["33-play", "/play"],
      ["33b-play-top", "/play"],
      ["34-home", "/home"],
      ["35-store", "/store"],
      ["36-activity", "/activity"],
      ["37-admin", "/admin"],
    ] as const) {
      await page.goto(path);
      // Not `networkidle`: the player area holds an open SSE stream for live
      // notifications, so the network never goes idle and this would wait the full
      // timeout on every screen.
      await page.waitForTimeout(900);
      // The board has hundreds of seeded matches; a full-page shot of it is unreadable.
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: !name.endsWith("-top") });
    }

    // The same screens in dark, and the profile in Bangla at phone width — the two
    // states the design has to hold up in and the easiest ones to forget.
    await page.emulateMedia({ colorScheme: "dark" });
    for (const [name, path] of [
      ["40-profile-dark", "/profile"],
      ["41-home-dark", "/home"],
      ["42-play-dark", "/play"],
    ] as const) {
      await page.goto(path);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/${name}.png` });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .context()
      .addCookies([{ name: "NEXT_LOCALE", value: "bn", url: "http://localhost:3000" }]);
    for (const [name, path] of [
      ["43-profile-bn-390", "/profile"],
      ["44-home-bn-390", "/home"],
    ] as const) {
      await page.goto(path);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
      // Launch journey 7's assertion: the Bangla app must not scroll sideways.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows horizontally at 390px`).toBeLessThanOrEqual(0);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ colorScheme: "light" });

    // One turf detail page, for the slot grid.
    await page.goto("/turfs");
    const first = page.getByRole("link", { name: /Arena|Turf|Ground|Zone/ }).first();
    if (await first.isVisible().catch(() => false)) {
      await first.click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/38-turf-detail.png`, fullPage: true });
    }

    await clerk.signOut({ page });
  });
});
