import { expect, requiresClerk, test } from "./support/fixtures";
import { pickUsername } from "./support/onboarding";
import type { Page } from "@playwright/test";

/**
 * The header, the page and the footer are three siblings that have to share one column.
 *
 * They cannot inherit it from each other — the header renders before `<main>` — so the
 * width travels as a custom property that `:has([data-page-width])` lifts to `<body>`
 * (globals.css). That indirection is easy to break by hand-writing a `max-w-*` on one
 * of the three, and the result is a wordmark sitting a few rem inside the heading
 * beneath it: obvious in a screenshot, invisible in a diff.
 */
async function columnEdges(page: Page) {
  return page.evaluate(() => {
    // The column itself, not the first child — the header's first child is the
    // decorative floodlight line, which is full-bleed by design.
    const left = (sel: string) => {
      const el = document.querySelector(`${sel} .page-column`);
      return el ? Math.round(el.getBoundingClientRect().left) : null;
    };
    const region = document.querySelector("main [data-page-width]") as HTMLElement | null;
    const content = region?.matches('[data-page-width="bleed"]')
      ? (region.querySelector(".page-column") as HTMLElement | null)
      : region;
    return {
      header: left("header"),
      footer: left("footer"),
      content: content ? Math.round(content.getBoundingClientRect().left) : null,
    };
  });
}

test.describe("column alignment", () => {
  test("the public page lines its header, content and footer up", async ({ page }) => {
    await page.goto("/");
    const edges = await columnEdges(page);
    expect(edges.content).not.toBeNull();
    expect(edges.header, "header vs content").toBe(edges.content);
    expect(edges.footer, "footer vs content").toBe(edges.content);
  });

  test.describe("signed in", () => {
    // At describe scope, not inside the test: `requiresClerk` is a `test.skip`, and the
    // signed-in fixture runs *before* the test body — so a call in the body skipped
    // nothing and the run failed inside the fixture with "CLERK_SECRET_KEY is required".
    requiresClerk();

    test("the signed-in widths line up too", async ({ signedInPage: page }) => {
      test.setTimeout(240_000);

      await page.goto("/onboarding");
      await pickUsername(page);
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByRole("button", { name: /Football/ }).click();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByRole("button", { name: "Finish" }).click();
      await expect(page).toHaveURL(/profile/);

      // `/profile` is the default column. The `wide` branch of the `:has()` rule used to
      // be covered here by `/owner`, which has moved to its own app (DECISIONS D83) —
      // `owner-frontend/e2e/align.spec.ts` asserts it there, where every page is wide.
      // It cannot be covered by `/admin` instead: this fixture is a brand-new player, so
      // that is a 404 rendered in the default column, which would pass while testing
      // nothing.
      await page.goto("/profile");
      await page.waitForTimeout(600);
      const edges = await columnEdges(page);
      expect(edges.content, "no page column found").not.toBeNull();
      expect(edges.header, "header vs content").toBe(edges.content);
      expect(edges.footer, "footer vs content").toBe(edges.content);
    });
  });
});
