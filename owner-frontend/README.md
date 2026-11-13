# ChampHub Turf — the owner app

The frontend turf owners and their staff use: the turf's settings, the day's bookings,
the counter, the shelf, rentals, store orders and the statement. Everything a player
does lives in the other app, `../frontend` (DECISIONS D83).

```
npm install
cp .env.local.example .env.local   # the same Clerk keys as the player app
npm run dev                        # http://localhost:3001
```

Or `./scripts/dev.sh` from the repository root, which starts Postgres, Redis, Django,
Celery and both frontends together.

## Routes

| Path                          | What it is                                                            |
| ----------------------------- | --------------------------------------------------------------------- |
| `/`                           | Every turf this account holds a membership at, plus staff invitations |
| `/new`                        | The three-step registration wizard                                    |
| `/turfs/<slug>`               | Grounds, opening hours, prices, staff, submit for review              |
| `/turfs/<slug>/bookings`      | The day view: confirmation queue, the day's bookings, walk-ins        |
| `/turfs/<slug>/bookings/<id>` | One booking: confirm, take payment, no-show, cancel                   |
| `/turfs/<slug>/counter`       | The till                                                              |
| `/turfs/<slug>/inventory`     | The shelf and the movement log                                        |
| `/turfs/<slug>/rentals`       | What is out and who has it                                            |
| `/turfs/<slug>/orders`        | Store orders waiting at this counter                                  |
| `/turfs/<slug>/finance`       | Takings, payouts, and the CSV                                         |

`turfs/[slug]/layout.tsx` owns the turf's name, its review badge and the tab strip, so
every page inside it renders a `SectionHeader` (`<h2>`) rather than its own `<h1>`.

## Two apps, one account

A turf owner is a player with a role, not a second kind of user (DOMAIN §1), so both
apps use **the same Clerk instance and the same keys**. Two consequences worth knowing
before deploying:

- **The session is per origin.** In development the apps are `localhost:3000` and
  `localhost:3001`; cookies ignore the port, so one sign-in covers both. In production
  they must share a registrable domain — `owner.champhub.com` beside `champhub.com` — or
  use Clerk's satellite-domain setup. On unrelated domains an owner signs in twice.
- **The backend checks the origin.** Clerk stamps the browser's origin into every
  session token as `azp`, and Django rejects a token whose `azp` is not in
  `CLERK_AUTHORIZED_PARTIES`. If every call from this app returns 401 while the player
  app works, that list is the first thing to check — the token is valid, just not
  allowed to be used from here.

## Shared code

The design system (`src/app/globals.css`), the ui primitives, the typed API client and
the i18n setup are **copies** of the player app's, not a shared package (DECISIONS D83).
That was a deliberate trade — no workspace refactor, at the cost of two places to change
a token. When you change one, change the other: `e2e/align.spec.ts` and the
`backdrop-filter` allowlist in `src/__tests__/e2e-hooks.test.ts` are what catch the
drift that matters.

## Checks

```
npm run lint && npm run typecheck && npm run format:check
npm run test        # Vitest: message catalogues, formats, e2e locators
npm run test:e2e    # Playwright; needs real Clerk keys and the API running
npm run gen:api     # regenerate src/lib/api/schema.d.ts (backend must be running)
```

The e2e suite builds and starts the app itself. To run it against one that is already
up: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npx playwright test`.

`components.json` is kept so `npx shadcn@latest add <component>` works here too; the
`shadcn` package itself is a dependency only because `globals.css` imports
`shadcn/tailwind.css`.
