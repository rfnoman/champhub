import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A static guard for the hooks the Playwright suite depends on.
 *
 * The end-to-end tests **do not run in CI** — they need a Clerk secret and a production
 * build, so they are run by hand. That makes renaming a test id or dropping an `<h1>` a
 * change that passes every automated check and is discovered much later.
 *
 * The player app has its own copy of this file guarding its own locators; the ones here
 * are the turf's — the till, the stock table, the statement. When a locator is
 * deliberately changed, change it in the spec and here together.
 */

const SRC = join(import.meta.dirname, "..");

/** Comments name the markup they describe, which a naive scan counts as markup. */
function stripComments(body: string): string {
  return body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const FILES = walk(SRC)
  .filter((path) => path.endsWith(".tsx") || path.endsWith(".ts"))
  // Tests name the things they guard, so they would match their own patterns.
  .filter((path) => !path.includes("__tests__"));
const SOURCE = FILES.map((path) => readFileSync(path, "utf8")).join("\n");

/** Every `data-testid` a spec asserts on. */
const ASSERTED_TEST_IDS = [
  "add-product",
  "change-due",
  "finance",
  "finance-lines",
  "finance-total",
  "movement-log",
  "on-hand",
  "order-queue",
  "pos-grid",
  "pos-total",
  "rental-list",
  "stock-table",
  "todays-sales",
];

describe("locators the e2e suite depends on", () => {
  it.each(ASSERTED_TEST_IDS)("still renders data-testid=%s", (id) => {
    expect(SOURCE).toContain(`data-testid="${id}"`);
  });

  it("keeps the counter's selects native", () => {
    // `selectOption()` needs a real <select> with real <option> children (D76). A shadcn
    // Select renders a button and a portalled listbox, and silently breaks these.
    const walkIn = readFileSync(
      join(SRC, "app/(signed-in)/turfs/[slug]/bookings/calendar.tsx"),
      "utf8",
    );
    expect(walkIn).toContain('id="walkin-ground"');
    expect(walkIn).toMatch(/<select[\s\S]{0,400}<option/);

    const manage = readFileSync(join(SRC, "app/(signed-in)/turfs/[slug]/manage.tsx"), "utf8");
    expect(manage).toContain('id="ground-slot"');
    expect(manage).toContain('id="staff-role"');
  });

  it("gives every page a heading of its own or a layout that has one", () => {
    // Pages inside `turfs/[slug]` deliberately render no `<h1>`: the turf's name is the
    // heading and the layout renders it once, so each page carries a `SectionHeader`
    // (an `<h2>`) instead. A page with neither has lost its title.
    const nameless = FILES.filter((path) => path.endsWith("page.tsx")).filter((path) => {
      const body = stripComments(readFileSync(path, "utf8"));
      if (/<h1[\s>]/.test(body) || /<SectionHeader[\s>]/.test(body)) return false;
      // Nothing else in this app delegates its title to a child component.
      return true;
    });

    // Clerk's own sign-in and sign-up components carry their headings.
    const DELEGATES = [
      "/app/sign-in/[[...sign-in]]/page.tsx",
      "/app/sign-up/[[...sign-up]]/page.tsx",
      // The registration wizard's step component owns the heading.
      "/app/(signed-in)/new/page.tsx",
    ];

    expect(
      nameless.map((path) => path.replace(SRC, "")).filter((p) => !DELEGATES.includes(p)),
    ).toEqual([]);
  });

  it("keeps exactly one h1 per turf page, in the layout", () => {
    // Two `<h1>`s on a page is what Playwright's strict mode trips over, and moving the
    // heading into the layout is exactly the change that could reintroduce one.
    const offenders = FILES.filter((path) => path.includes("turfs/[slug]"))
      .filter((path) => !path.endsWith("layout.tsx"))
      .filter((path) => /<h1[\s>]/.test(stripComments(readFileSync(path, "utf8"))))
      .map((path) => path.replace(SRC, ""));

    expect(offenders).toEqual([]);
    const layout = readFileSync(join(SRC, "app/(signed-in)/turfs/[slug]/layout.tsx"), "utf8");
    expect(layout).toMatch(/<h1[\s>]/);
  });

  it("keeps the English button labels the specs click", () => {
    // The e2e specs key on exact English names. These live in en.json, so a reworded
    // label is caught here rather than by a 150s Playwright timeout.
    const en = JSON.parse(readFileSync(join(SRC, "../messages/en.json"), "utf8")) as Record<
      string,
      Record<string, string>
    >;
    const values = new Set(
      Object.values(en).flatMap((namespace) => Object.values(namespace ?? {})),
    );

    const REQUIRED = [
      "Add ground",
      "Add price",
      "Confirm",
      "Invite",
      "Next",
      "Remove",
      "Set hours",
      "Submit for review",
      "Take payment",
      "Take out",
      // Handles (DOMAIN §1b): `account.spec.ts` clicks this, and locates the field by
      // id rather than by label.
      "Claim",
    ];

    expect(REQUIRED.filter((label) => !values.has(label))).toEqual([]);
  });

  it("keeps the username field addressable by id", () => {
    const panel = readFileSync(join(SRC, "components/account/username-panel.tsx"), "utf8");
    expect(panel).toContain('id="username"');
    expect(panel).toContain('id="username-hint"');
  });

  it("keeps backdrop-filter inside its allowlist", () => {
    // DECISIONS D75: only fixed and overlay chrome may blur, so nothing blurred ever
    // sits inside a scrolling list. `glass-panel` is the unrestricted one.
    const ALLOWED = ["components/layout/site-header.tsx", "components/layout/bottom-nav.tsx"];

    const offenders = FILES.filter((path) => {
      const body = readFileSync(path, "utf8");
      return /glass-chrome|backdrop-blur|backdrop-filter/.test(body);
    })
      .map((path) => path.replace(`${SRC}/`, ""))
      .filter((path) => !ALLOWED.includes(path));

    expect(offenders).toEqual([]);
  });

  it("never routes to the player app with <Link>", () => {
    // The two apps are separate origins (DECISIONS D83). A <Link> to the player app
    // would ask this app's router for a route it does not have, and 404 from its own
    // not-found page rather than leaving — which looks like a broken link, not a
    // crossing. Crossings go through `playerAppUrl()` on a plain anchor.
    const offenders = FILES.filter((path) => {
      const body = stripComments(readFileSync(path, "utf8"));
      return /<Link[^>]*href=\{?["'`]?\$?\{?playerAppUrl/.test(body);
    }).map((path) => path.replace(`${SRC}/`, ""));

    expect(offenders).toEqual([]);
  });
});
