# Phase 12 — Design system: "Floodlit pitch"

**Goal:** one coherent, opinionated visual identity across every screen — player, owner and
admin — with light and dark themes, per-sport colour, glass chrome, motion that answers actions,
buttons that feel physical, and a mobile navigation the app did not previously have. All of it
inside the measured performance budget, the Bangla layout constraints and the 143 e2e journeys.

**Depends on:** all previous phases. **Decisions:** D72–D79 (and D13, D62, D24 constrain it).

## Why this phase exists

Phases 00–11 built a complete product on the **stock shadcn neutral theme**, where every token —
including all five `--chart-*` steps — is zero-chroma `oklch`. The brand green `#16a34a` lived in
the manifest, the generated icon and `viewport.themeColor` and **nowhere in the CSS**, so the
installed app icon was green and the app behind it was greyscale. Three things compounded it:

- **Dark mode was dead code.** The `.dark` block, `@custom-variant dark`, ~47 `dark:` utilities and
  `next-themes` were all present; nothing ever applied the class.
- **There was no mobile navigation.** Nine ghost-button links in `hidden … sm:flex`, on a
  phone-first installable PWA. Below `sm`, no navigation at all.
- **There was no motion.** `transition-colors` in 28 files with no `duration-*` or `ease-*`
  anywhere in the codebase, and `--font-mono` pointing at a font that was never loaded.

## The direction

**The floodlight and the chalk line.** One light source per view — literal on the landing hero, a
top-edge glow on interior chrome. Chalk-line geometry as the structural device, used to encode
information rather than decorate: the centre line splits a scoreline, a penalty arc crops the
player card's rating, unavailable slots are hatched as out of play. Where there is nothing to
encode, there is no line.

Dark is the designed palette and light is a real second one, not an inversion — the vivid
`#00E07A` is a dark-mode-only colour and is demoted to a highlight in light mode (D73). Four sport
identities (football green, futsal amber, cricket cobalt, badminton violet) so a badminton screen
is recognisably not a football screen, applied through a `data-sport` attribute with an allowlist
and a fallback, because sports come from the database and there is an admin queue for proposing
new ones.

## Steps

0. **Make the presentation layer shareable** — zero visual change. Convert the shared
   presentational components in `src/components` from `async`/`getTranslations` to next-intl's sync
   API (it works in both trees), which is what lets the `"use client"` screens stop duplicating
   them; then delete `board.tsx`'s inline `BoardRow` and `discovery.tsx`'s inline row. Extract the
   five literals that recur 8–20× (`native-select`, `segmented`, `page-header`, `filter-pill`).
   Add `error.tsx` / `not-found.tsx`. Add the **source-hook guard test** below.
1. **Tokens, fonts, theme runtime** — the palette in `globals.css` keeping every existing variable
   name so all 141 files keep compiling; per-sport `data-sport` blocks; fix the dangling
   `--font-mono`; Archivo for display and numerals only (D74); `next-themes` with the **CSP nonce**
   (D78b); mount the never-mounted `<Toaster/>`; a token test asserting light/dark parity and AA
   contrast.
2. **Design lab** at `/dev/design` (D78c) — every primitive across both themes × four sports × both
   languages × 390px and desktop. Sign off the look here, before the per-screen work.
3. **Motion and press primitives** — `LazyMotion` with the lazy-feature form (D72), CSS press
   physics on `Button` plus new `touch`/`cta` sizes (D79), the global reduced-motion rule (D78).
4. **Primitives** — install the missing shadcn components; resolve the **two card idioms** (shadcn
   `Card`'s `ring-1` versus seven hand-rolled `rounded-xl border shadow-sm` surfaces) onto one
   primitive; build `src/components/charts/{Bars,Line,Ring}` for the five hand-rolled dataviz
   surfaces, library-free as before, on a real categorical `--chart-*` ramp.
5. **Shell and navigation** — break the `max-w-5xl` monopoly (owner and admin need the width more
   than the player hero does); bottom tab bar for the five primary destinations plus a Sheet for
   the long tail; real chrome for owner and admin; `loading.tsx` once the skeletons match.
6. **Signature screens** — player card and profile, turf page and slot grid, match board, home.
7. **Remaining player screens**, grouped by route.
8. **Owner** — including the day/week grid `calendar.tsx` has been owed since Phase 02.
9. **Admin** — including turning the eight-bare-buttons index into a real dashboard.
10. **Docs, measurement, critique.**

## Acceptance checklist

- `npm run lint && npm run format:check && npm run typecheck && npm run test && npm run build` green.
- **`npm run test:e2e` green on both the `chromium` and `mobile` (Pixel 7) projects**, run against
  the production build. These 143 tests are not in CI, so this is the only gate — and it is a
  Definition of Done for *each* of steps 5–9, not just at the end.
- The source-hook guard test passes in CI: all 23 asserted `data-testid`s, `data-slot-start` /
  `data-slot-available` / `confirm-booking`, `id="ground"` / `id="date"` / `id="board-sport"` still
  on real `<select>`/`<input>` elements, `role="meter"`, and exactly one `<h1>` per page.
- New strings in **both** `en.json` and `bn.json` with hand-written Bengali and matching ICU
  arguments. Budget 60–100 keys; both parity tests run in CI, so this cannot be deferred.
- Bangla at 390px on every screen with **no horizontal scroll** (launch journey 7). The five-tab
  bottom bar is the tightest layout in the app — Bengali labels run 20–30% longer.
- LCP and CLS re-measured on Slow 3G + 4× CPU against the recorded `LCP 3.7s, CLS 0.04`, and the
  glass A/B trace (`reduce-effects` toggled at runtime on one build) recorded in PROGRESS.
- Keyboard focus visible throughout; `prefers-reduced-motion` and `prefers-reduced-transparency`
  both verified; `maximum-scale` still unset.
- The eslint rule and vitest assertion pinning `backdrop-filter` to its four-file allowlist pass.
- `docs/PROGRESS.md` updated.

## Things that will break if you are not careful

- **`getByRole("status")` is an inline `<span>`, not a toast.** Eight of them across the app, two
  asserted in `profile.spec.ts`. Mounting `<Toaster/>` is safe; migrating those confirmations to
  toasts would double-match in strict mode.
- **`ratingTone` is contractually tested** — four distinct returns, boundaries at 80/65/50, and no
  `[` in the returned string. The rebranded bands must be real `--color-rating-*` utilities, not
  arbitrary values.
- **Several `<h1>` strings are asserted by exact text** — "Find a match", "Find a turf",
  "Inventory", "Payments", "Turf dashboard". The shared `PageHeader` must not change copy or levels.
- **`profile.spec.ts` has a DOM-shape locator** — `page.locator("div", { hasText: /^⚽\s*Football/ })`
  — which breaks if that settings row stops being a `div`, if the emoji changes, or if anything is
  inserted between the icon and the name.
- **Sport icons are emoji from the Django catalogue**, rendered `<span aria-hidden>`. They stay.
- **`onboarding-wizard.tsx` is the most e2e-coupled file in the app**, driven in `beforeEach` by
  several specs. Its own PR, with any spec edits in the same commit.
- **The bottom nav collides with three sticky footers** — the cart panel, the counter till and the
  booking confirm bar. Decide that interaction once in step 5, before any of them is touched.

## Screens where restyling is not enough

`manage.tsx` (765 lines doing grounds, pricing, staff, photos and settings on one page — the
biggest IA debt in the repo), `calendar.tsx` (a day list, not the grid Phase 02 sketched — flagged
as deferred in PROGRESS and never revisited), the admin index (eight bare buttons),
`onboarding-wizard.tsx` (the highest-stakes first-run screen), `board.tsx` (the most important
player screen; it should answer "what can I play tonight, near me, at my level"), and the three
stock screens (`inventory-board`, `warehouse`, `rental-board`) which need one table pattern decided
once rather than three.
