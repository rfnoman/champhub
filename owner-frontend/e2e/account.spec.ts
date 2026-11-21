import { expect, requiresClerk, test } from "./support/fixtures";

/**
 * The owner's own account page: their photograph and their identity check (DOMAIN §1a).
 *
 * The same panel the player app renders, against the same endpoints — one account, one
 * identity — so this spec is about the owner app's half: that the page is reachable from
 * the dashboard an owner lands on, and that an upload really leaves the browser.
 */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const anImage = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });

test.describe("owner handle", () => {
  requiresClerk();

  test("an owner can claim a username, which is how players invite them", async ({
    signedInPage: page,
  }) => {
    // The only place in this app that offers one: an owner never runs the player
    // onboarding wizard, where a player picks theirs (DECISIONS D93).
    const handle = `owner_${Date.now().toString(36)}`.toLowerCase();

    await page.goto("/account");
    await page.locator("#username").fill(handle);
    await expect(page.locator("#username-hint")).toContainText(`@${handle}`);
    await page.getByRole("button", { name: "Claim", exact: true }).click();

    // The link is the point: it goes to their player profile in the *other* app.
    await expect(page.getByLabel("Your profile link")).toHaveValue(
      new RegExp(`/players/@${handle}$`),
    );
  });
});

test.describe("owner identity", () => {
  requiresClerk();

  test("an unverified owner is told, and can send their NID from the dashboard", async ({
    signedInPage: page,
  }) => {
    await page.goto("/turfs");
    // The dashboard nudge: an owner whose identity is unverified finds out here rather
    // than in a turf rejection.
    await expect(page.getByText("Not sent")).toBeVisible();
    await page.getByRole("link", { name: "Start" }).click();

    await expect(page).toHaveURL(/\/account/);
    await expect(page.getByRole("heading", { name: "Identity verification" })).toBeVisible();

    await page.getByLabel("Your photo").setInputFiles(anImage("me.png"));
    await expect(page.getByRole("button", { name: "Change photo" })).toBeVisible();

    await page.getByLabel("Document", { exact: true }).selectOption("nid");
    await page.getByLabel("Document number").fill("1990123456789");
    await page.getByLabel("Document photo").setInputFiles(anImage("nid.png"));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("On file. Choosing a new one replaces it.")).toBeVisible();

    await page.getByRole("button", { name: "Send for review" }).click();
    await expect(page.getByText("Awaiting review")).toBeVisible();
  });
});
