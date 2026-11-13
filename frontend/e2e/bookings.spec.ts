import type { Page } from "@playwright/test";

import { DEMO_TURFS, bookAFreeSlot } from "./support/booking";
import { pickUsername } from "./support/onboarding";
import { expect, requiresClerk, test } from "./support/fixtures";

async function finishOnboarding(page: Page) {
  await page.goto("/onboarding");
  await pickUsername(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: /Football/ }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/profile/);
}

test.describe("booking a slot", () => {
  requiresClerk();

  test.beforeEach(async ({ signedInPage: page }) => {
    await finishOnboarding(page);
  });

  test("a new player's booking waits for the turf to confirm", async ({ signedInPage: page }) => {
    await bookAFreeSlot(page, { turfs: ["dhanmondi-arena", ...DEMO_TURFS] });

    // DECISIONS D3: no track record, so it is held rather than confirmed. "Reserved"
    // appears twice on the page — as the status badge and as a timeline entry.
    await expect(page.getByText("Reserved").first()).toBeVisible();
    await expect(page.getByText(/has not confirmed yet/)).toBeVisible();
    // Exact: the Phase 10 payment card also says "cash at the turf" in its hint.
    await expect(page.getByText("Cash at the turf", { exact: true })).toBeVisible();
  });

  test("the booking appears in my bookings and the slot is no longer free", async ({
    signedInPage: page,
  }) => {
    const booked = await bookAFreeSlot(page, { turfs: ["banani-sports-hub", ...DEMO_TURFS] });
    // Which turf the helper settled on depends on what is still free, so the name is
    // read off the booking rather than assumed.
    const turfName = await page.getByRole("heading", { level: 1 }).textContent();

    await page.goto("/bookings");
    await expect(page.getByRole("heading", { name: turfName! })).toBeVisible();

    // The Phase 02 availability selector picks bookings up through the provider
    // registry, so a booked slot must now read as taken — on the day it was booked.
    await page.goto(`/turfs/${booked.turf}`);
    await page.getByLabel("Date").fill(booked.date);
    await expect(page.getByText("BOOKED").first()).toBeVisible();
  });

  test("a player can cancel their own booking", async ({ signedInPage: page }) => {
    await bookAFreeSlot(page, { turfs: ["uttara-green-ground", ...DEMO_TURFS] });

    await page.getByLabel("Reason").fill("Plans changed");
    await page.getByRole("button", { name: "Cancel booking" }).click();

    await expect(page.getByText("Cancelled").first()).toBeVisible();
    await expect(page.getByText("Plans changed").first()).toBeVisible();
  });

  test("the timeline records every transition", async ({ signedInPage: page }) => {
    await bookAFreeSlot(page, { turfs: ["bashundhara-play-zone", ...DEMO_TURFS] });

    const timeline = page.locator("ol");
    await expect(timeline.getByText("Reserved")).toBeVisible();

    await page.getByRole("button", { name: "Cancel booking" }).click();
    await expect(timeline.getByText("Cancelled")).toBeVisible();
  });
});

test.describe("notifications", () => {
  requiresClerk();

  test("booking produces a notification the bell can show", async ({ signedInPage: page }) => {
    await finishOnboarding(page);
    await bookAFreeSlot(page, { turfs: ["mirpur-turf-club", ...DEMO_TURFS] });

    // The bell reads its count on mount and then every 30s, so the page is reloaded
    // rather than waiting out a poll.
    await page.reload();
    await page.getByRole("button", { name: /unread notification/ }).click();
    await expect(page.getByText(/Booking requested/).first()).toBeVisible();

    // "Mark all read" is only rendered while something is unread, and the trigger
    // itself is hidden from the a11y tree while the menu is open — so its absence is
    // what says the badge cleared.
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(page.getByRole("button", { name: "Mark all read" })).toHaveCount(0);
  });
});
