import { expect, requiresClerk, test } from "./support/fixtures";
import { pickUsername } from "./support/onboarding";

/**
 * Identity verification, end to end (DOMAIN §1a).
 *
 * The happy path is deliberately the slow one: a photo of the person and a photo of a
 * document, both uploaded over a real multipart request, then a submit that the API
 * only accepts once both are there. That ordering is the whole feature — a submit
 * without a photograph has to be refused and say so.
 *
 * The images are 1x1 PNGs built here rather than committed: a fixture that looks like a
 * real NID is a thing somebody eventually mistakes for one.
 */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const anImage = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });

test.describe("identity verification", () => {
  requiresClerk();

  // A brand-new account is held in onboarding by the player layout, so get through it
  // first — the identity check is a settings page, not part of signing up.
  test.beforeEach(async ({ signedInPage: page }) => {
    await page.goto("/onboarding");
    await pickUsername(page);
    await page.getByLabel("Area").fill("Dhanmondi");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: /Football/ }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page).toHaveURL(/\/profile/);
  });

  test("a player uploads a document and it reaches the review queue", async ({
    signedInPage: page,
  }) => {
    await page.goto("/settings/identity");
    await expect(page.getByRole("heading", { name: "Identity verification" })).toBeVisible();

    // Nothing uploaded yet, so the API must refuse and name what is missing.
    await page.getByRole("button", { name: "Send for review" }).click();
    await expect(page.getByText("Add a photo of yourself first.")).toBeVisible();

    await page.getByLabel("Your photo").setInputFiles(anImage("me.png"));
    await expect(page.getByRole("button", { name: "Change photo" })).toBeVisible();

    await page.getByLabel("Document", { exact: true }).selectOption("passport");
    await page.getByLabel("Document number").fill("BX0912345");
    await page.getByLabel("Document photo").setInputFiles(anImage("passport.png"));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("On file. Choosing a new one replaces it.")).toBeVisible();

    await page.getByRole("button", { name: "Send for review" }).click();
    await expect(page.getByText("Awaiting review")).toBeVisible();
    // Frozen once a reviewer has it.
    await expect(page.getByRole("button", { name: "Send for review" })).toHaveCount(0);
  });
});
