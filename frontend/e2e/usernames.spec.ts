import type { Page } from "@playwright/test";

import { DEMO_TURFS, bookAFreeSlot } from "./support/booking";
import { apiBaseUrl } from "./support/clerk-users";
import { expect, requiresClerk, test } from "./support/fixtures";
import { pickUsername, uniqueHandle } from "./support/onboarding";
import { openAsNewPlayer } from "./support/roles";

/**
 * Handles, end to end (DOMAIN §1b).
 *
 * The happy path for this feature is three steps that happen in three different places,
 * which is exactly why it is worth one spec: a player picks a handle in onboarding,
 * somebody *else* opens `/players/@handle` and types it into a match invite, and the
 * first player finds the invitation waiting for them. Nothing but an end-to-end test
 * sees that chain — each half of it passes on its own with the other half broken.
 */
async function finishOnboarding(page: Page, handle: string) {
  await page.goto("/onboarding");
  await pickUsername(page, handle);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: /Football/ }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/profile/);
}

/** The id of the match a booking created, read from the API rather than guessed. */
async function myLatestMatch(page: Page): Promise<string> {
  return page.evaluate(async (base) => {
    const token = await (
      window as never as { Clerk: { session: { getToken(): Promise<string> } } }
    ).Clerk.session.getToken();
    const mine = await (
      await fetch(`${base}/api/v1/matches/mine`, { headers: { Authorization: `Bearer ${token}` } })
    ).json();
    return mine[0].id as string;
  }, apiBaseUrl());
}

test.describe("usernames", () => {
  requiresClerk();

  test("a handle finds a stranger and invites them to a match", async ({
    signedInPage: page,
    browser,
  }) => {
    test.setTimeout(300_000);

    const guestHandle = uniqueHandle("guest");
    const guest = await openAsNewPlayer(browser);

    try {
      await finishOnboarding(guest.page, guestHandle);
      await finishOnboarding(page, uniqueHandle("host"));

      // The organiser has nothing but the handle — no id, no search result, no squad in
      // common. This is the case the feature exists for.
      const matchId = await organiseAMatch(page);
      await page.goto(`/players/@${guestHandle}`);
      await expect(page.getByText(`@${guestHandle}`).first()).toBeVisible();

      await page.goto(`/matches/${matchId}`);
      await page.getByLabel("Username", { exact: true }).fill(`@${guestHandle}`);
      await page.getByRole("button", { name: "Invite", exact: true }).first().click();

      // And it arrives: the guest, who was never asked for anything but a handle.
      await guest.page.goto(`/matches/${matchId}`);
      await expect(
        guest.page.getByRole("heading", { name: "You have been invited" }),
      ).toBeVisible();
    } finally {
      await guest.close();
    }
  });

  test("a handle nobody has claimed is refused where it was typed", async ({
    signedInPage: page,
  }) => {
    test.setTimeout(240_000);

    await finishOnboarding(page, uniqueHandle("host"));
    const matchId = await organiseAMatch(page);

    await page.goto(`/matches/${matchId}`);
    await page.getByLabel("Username", { exact: true }).fill("nobody_here_at_all");
    await page.getByRole("button", { name: "Invite", exact: true }).first().click();

    await expect(page.getByRole("alert")).toContainText(/username/i);
  });

  test("a handle can be changed from settings, and the old one stops resolving", async ({
    signedInPage: page,
  }) => {
    test.setTimeout(240_000);

    const first = uniqueHandle("old");
    const second = uniqueHandle("new");
    await finishOnboarding(page, first);

    await page.goto("/settings");
    const field = page.getByLabel("Username", { exact: true });
    await expect(field).toHaveValue(first);
    await field.fill(second);
    await page.getByRole("button", { name: "Change", exact: true }).click();
    // The share link, not the toast: it is what somebody pastes into a chat, so it is
    // the thing that has to have followed the change.
    await expect(page.getByLabel("Your profile link")).toHaveValue(new RegExp(`@${second}$`));

    // The share link is the point of having a handle, so it has to follow the change.
    await page.goto(`/players/@${second}`);
    await expect(page.getByText(`@${second}`).first()).toBeVisible();

    const stale = await page.goto(`/players/@${first}`);
    expect(stale?.status()).toBe(404);
  });
});

/** Book a free slot so this player organises a match, and return the match id. */
async function organiseAMatch(page: Page): Promise<string> {
  await bookAFreeSlot(page, { turfs: DEMO_TURFS });
  return myLatestMatch(page);
}
