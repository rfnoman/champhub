import { expect, requiresClerk, test } from "./support/fixtures";

/**
 * Registering a turf and getting it as far as review.
 *
 * Moved from the player app's `turfs.spec.ts` with the rest of the owner surface
 * (DECISIONS D83). The flow is unchanged apart from its URLs and one deletion: it no
 * longer walks through player onboarding first, because nothing here needs a player
 * profile.
 */
test.describe("turf registration", () => {
  requiresClerk();

  test("an owner registers a turf and it starts as a draft", async ({ signedInPage: page }) => {
    await page.goto("/turfs");
    await expect(page.getByRole("heading", { level: 1, name: "Turf dashboard" })).toBeVisible();
    await page.getByRole("link", { name: "Register a turf" }).first().click();

    await expect(page).toHaveURL(/\/new/);
    await page.getByLabel("Turf name").fill("E2E Test Turf");
    await page.getByLabel("Address").fill("Road 1, Dhanmondi, Dhaka");
    await page.getByLabel("Area", { exact: true }).fill("Dhanmondi");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // Step 2 is the map picker; the default Dhaka pin is fine for this.
    await expect(page.getByRole("heading", { name: "Where is it?" })).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByRole("button", { name: "Floodlights" }).click();
    await page.getByRole("button", { name: "Create draft" }).click();

    await expect(page).toHaveURL(/\/turfs\/e2e-test-turf/);
    await expect(page.getByText("Draft")).toBeVisible();
    // A draft has no grounds yet, so it cannot be submitted — and the API says why.
    // Matched on the text rather than role=alert: Next's route announcer is one too.
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText(/Add at least one ground/)).toBeVisible();
  });

  test("a brand-new owner has no turfs", async ({ signedInPage: page }) => {
    await page.goto("/turfs");
    await expect(page.getByText("You have not registered a turf yet.")).toBeVisible();
  });

  test("the turf's tab strip is the same on every page of it", async ({ signedInPage: page }) => {
    // The strip and the turf's name live in `turfs/[slug]/layout.tsx`, so they persist
    // across navigations rather than being re-rendered per page. That is the layout's
    // whole purpose, and a page that reintroduced its own header would break it
    // silently.
    await page.goto("/new");
    const name = `E2E Tabs ${Date.now()}`;
    await page.getByLabel("Turf name").fill(name);
    await page.getByLabel("Address").fill("Road 1, Dhanmondi, Dhaka");
    await page.getByLabel("Area", { exact: true }).fill("Dhanmondi");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page).toHaveURL(/\/turfs\/e2e-tabs/);

    const heading = page.getByRole("heading", { level: 1, name });
    await expect(heading).toBeVisible();

    for (const tab of ["Bookings", "Inventory", "Finance"]) {
      await page.getByRole("link", { name: tab, exact: true }).first().click();
      await expect(heading).toBeVisible();
      await expect(page.getByRole("link", { name: tab, exact: true }).first()).toHaveAttribute(
        "aria-current",
        "page",
      );
    }
  });
});
