import { expect, requiresClerk, test } from "./support/fixtures";
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

  test("the signed-in widths line up too", async ({ signedInPage: page }) => {
    requiresClerk();
    test.setTimeout(240_000);

    await page.goto("/onboarding");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: /Football/ }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page).toHaveURL(/profile/);

    // `/profile` is the default column and `/owner` the wide one, so this covers both
    // branches of the `:has()` rule as well as the default.
    for (const path of ["/profile", "/owner"]) {
      await page.goto(path);
      await page.waitForTimeout(600);
      const edges = await columnEdges(page);
      expect(edges.content, `${path}: no page column found`).not.toBeNull();
      expect(edges.header, `${path}: header vs content`).toBe(edges.content);
      expect(edges.footer, `${path}: footer vs content`).toBe(edges.content);
    }
  });
});
