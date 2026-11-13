import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A static guard for the hooks the Playwright suite depends on.
 *
 * The 143 end-to-end tests **do not run in CI** — they need a Clerk secret and a
 * production build, so they are run by hand. That makes renaming a test id or dropping
 * an `<h1>` a change that passes every automated check and is discovered much later.
 *
 * This cannot catch a broken layout. It catches deletions and renames, which is most of
 * what a restyle does to a test suite, and it runs in `npm run test` — so it runs in CI.
 * When a locator here is deliberately changed, change it in the spec and here together.
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
  // The till and the stock table moved to owner-frontend (DECISIONS D83); their
  // locators are guarded by that app's copy of this file.
  "activity-history",
  "address-form",
  "availability",
  "cart",
  "conduct-queue",
  "fair-play",
  "home-dashboard",
  "match-board",
  "order-queue",
  "order-status",
  "payout-list",
  "platform-total",
  "player-search-results",
  "rating-history",
  "reminder-settings",
  "scorecard-status",
  "store-items",
  "track-record",
];

describe("locators the e2e suite depends on", () => {
  it.each(ASSERTED_TEST_IDS)("still renders data-testid=%s", (id) => {
    expect(SOURCE).toContain(`data-testid="${id}"`);
  });

  it("keeps the booking flow reachable without English", () => {
    // e2e/support/booking.ts drives the whole booking journey through these, chosen so
    // that launch journey 7 — the same flow in Bangla — does not depend on labels.
    const grid = readFileSync(join(SRC, "components/turf/slot-grid.tsx"), "utf8");
    expect(grid).toContain("data-slot-start=");
    expect(grid).toContain("data-slot-available=");

    const panel = readFileSync(join(SRC, "app/(player)/turfs/[slug]/booking-panel.tsx"), "utf8");
    expect(panel).toContain('data-testid="confirm-booking"');
    expect(panel).toContain('id="ground"');
    expect(panel).toContain('id="date"');
  });

  it("keeps #ground and #board-sport as native selects", () => {
    // `selectOption()` needs a real <select> with real <option> children (D76). A shadcn
    // Select renders a button and a portalled listbox, and silently breaks these.
    const panel = readFileSync(join(SRC, "app/(player)/turfs/[slug]/booking-panel.tsx"), "utf8");
    expect(panel).toMatch(/<select[^>]*id="ground"|id="ground"[^>]*>[\s\S]{0,400}<option/);

    const board = readFileSync(join(SRC, "app/(player)/play/board.tsx"), "utf8");
    expect(board).toContain('id="board-sport"');
  });

  it("keeps the rating bar a meter", () => {
    const rating = readFileSync(join(SRC, "components/player/rating.tsx"), "utf8");
    expect(rating).toContain('role="meter"');
  });

  it("gives every page an h1", () => {
    // `getByRole("heading", { level: 1 })` is asserted on many pages, so a page that
    // loses its h1 fails a spec that will not run until someone runs it by hand.
    //
    // Deliberately "at least one", not "exactly one": a page with an early return for
    // an empty state has two h1 literals and renders one, and a static scan cannot tell
    // those apart. Deletion is the failure mode worth catching here; a genuine duplicate
    // is caught by Playwright's strict mode.
    const withoutHeading = FILES.filter((path) => path.endsWith("page.tsx"))
      .filter((path) => {
        const body = stripComments(readFileSync(path, "utf8"));
        // A page that delegates its heading to a child component is fine.
        return !/<h1[\s>]/.test(body) && !/<PageHeader[\s>]/.test(body);
      })
      .map((path) => path.replace(SRC, ""));

    // Pages that legitimately render no heading of their own.
    const DELEGATES = [
      "/app/onboarding/page.tsx",
      "/app/sign-in/[[...sign-in]]/page.tsx",
      "/app/sign-up/[[...sign-up]]/page.tsx",
      "/app/scorecards/[matchId]/page.tsx",
      "/app/(player)/profile/page.tsx",
      "/app/(player)/players/[playerId]/page.tsx",
      // Renders a form component that owns the heading.
      "/app/(player)/squads/new/page.tsx",
    ];

    expect(withoutHeading.filter((path) => !DELEGATES.includes(path))).toEqual([]);
  });

  it("keeps the English button labels the specs click", () => {
    // ~205 getByRole calls key on exact English names. These live in en.json, so a
    // reworded label is caught here rather than by a 150s Playwright timeout.
    const en = JSON.parse(readFileSync(join(SRC, "../messages/en.json"), "utf8")) as Record<
      string,
      Record<string, string>
    >;
    const values = new Set(
      Object.values(en).flatMap((namespace) => Object.values(namespace ?? {})),
    );

    const REQUIRED = [
      "Next",
      "Finish",
      "Save changes",
      "Save",
      "Add",
      "Remove",
      "Sign in",
      "Sign up",
      "Approve",
      "Language",
      "Edit profile",
      "Mark all read",
      "Make captain",
      "Ask to join",
      "Create squad",
      "Place the order",
      // Handles (DOMAIN §1b): `usernames.spec.ts` clicks these, and `pickUsername`
      // depends on the wizard's field keeping its id rather than its label.
      "Invite",
      "Change",
      "Claim",
    ];

    expect(REQUIRED.filter((label) => !values.has(label))).toEqual([]);
  });

  it("keeps the username field addressable without English", () => {
    // `e2e/support/onboarding.ts` locates the handle field and its hint by id, so that
    // launch journey 7 can walk the wizard in Bangla (DOMAIN §1b). A rename here breaks
    // thirteen specs at once, all of them in a fixture rather than in a test body.
    const wizard = readFileSync(join(SRC, "app/onboarding/onboarding-wizard.tsx"), "utf8");
    expect(wizard).toContain('id="username"');
    expect(wizard).toContain('id="username-hint"');

    const panel = readFileSync(join(SRC, "components/account/username-panel.tsx"), "utf8");
    expect(panel).toContain('id="username"');
  });

  it("keeps backdrop-filter inside its allowlist", () => {
    // DECISIONS D75: only fixed and overlay chrome may blur, so nothing blurred ever
    // sits inside a scrolling list. `glass-panel` is the unrestricted one.
    const ALLOWED = [
      "components/layout/site-header.tsx",
      "components/layout/bottom-nav.tsx",
      "components/ui/sheet.tsx",
      "components/ui/dialog.tsx",
    ];

    const offenders = FILES.filter((path) => {
      const body = readFileSync(path, "utf8");
      return /glass-chrome|backdrop-blur|backdrop-filter/.test(body);
    })
      .map((path) => path.replace(`${SRC}/`, ""))
      .filter((path) => !ALLOWED.includes(path));

    expect(offenders).toEqual([]);
  });
});
