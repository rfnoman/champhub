import type { Page } from "@playwright/test";

import { expect, requiresClerk, test } from "./support/fixtures";

/**
 * The header, the page and the footer are three siblings that have to share one column.
 *
 * The same rule as the player app, re-asserted here because this app has its own header
 * and footer and the design system is a copy, not a shared package (DECISIONS D83): a
 * `max-w-*` written by hand on one of the three would drift here and nowhere else.
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
  test("the sign-in page lines its header, content and footer up", async ({ page }) => {
    await page.goto("/sign-in");
    const edges = await columnEdges(page);
    expect(edges.content).not.toBeNull();
    expect(edges.header, "header vs content").toBe(edges.content);
    expect(edges.footer, "footer vs content").toBe(edges.content);
  });

  test.describe("signed in", () => {
    // At describe scope, not inside the test: `requiresClerk` is a `test.skip`, and the
    // signed-in fixture runs *before* the test body — so a call in the body skips
    // nothing and the run fails inside the fixture with "CLERK_SECRET_KEY is required".
    requiresClerk();

    test("and so does a turf page, which is the wide column", async ({ signedInPage: page }) => {
      test.setTimeout(240_000);

      // Every signed-in page in this app is `wide`, so the dashboard covers that branch
      // of the `:has()` rule; the sign-in page above covers the default.
      await page.goto("/");
      await page.waitForTimeout(600);
      const edges = await columnEdges(page);
      expect(edges.content, "no page column found").not.toBeNull();
      expect(edges.header, "header vs content").toBe(edges.content);
      expect(edges.footer, "footer vs content").toBe(edges.content);
    });
  });
});
