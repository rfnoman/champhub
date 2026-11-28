# ChampHub — completed tasks

Tasks are taken from `tasks.md`, built, checked, driven in a real browser, and only then
moved here. Each entry says what was actually built, what it deviated from, and how it
was verified — the detail that `tasks.md` (a wish list) does not carry.

---

## Batch 1 — 2026-11-28

### Google Maps location for a turf
*From:* "google map points the location -> owner can share google map location and player
and owner can see where it is pointed and clicking on that should open google map show
direction"

**Built.** `apps/turfs/maps.py` reads coordinates out of whatever an owner pastes: the
desktop place URL (`!3d/!4d`), a dropped pin (`@lat,lng`), the `?q=`/`?query=`/`?ll=`
family, a bare `23.74, 90.37`, and the `maps.app.goo.gl` short link the phone's Share
button produces — the last by following the redirect, which is the one outbound request
the backend makes on a user's behalf and is fenced by a host allowlist checked on the
*response*, a 6s timeout and a swallow-to-null failure path. A shared place link carries
two positions and the venue's (`!3d/!4d`) wins over the camera's (`@`); `0,0` is treated
as a failed parse. New `Turf.map_url` column stores the link as given; `directions_url`
is derived from `location` and is a route (`dir/?api=1&destination=…`), not a map view.

Owners can now **edit the location after registration**, which was impossible before —
the pin could only ever be set during registration, so a mis-dropped pin needed support.
Registration accepts a pasted link instead of a pin, and no longer silently submits the
Dhaka default when the owner never touched the map. Players get a "Getting there" section
with a Directions button, and "View on Google Maps" when the owner shared a place link.

**Verified.** 29 parser unit tests + 7 API tests; driven in Chrome — pasted a Dhanmondi
place URL into the owner's Location panel and confirmed the backend stored the *place*
coordinates (23.7489, 90.3708) rather than the camera's (23.7461, 90.3742), and that the
player page's Directions link resolved to `…dir/?api=1&destination=23.8213,90.4254`.

*Decision recorded:* D103.

### Futsal gains 6v6, 7v7 and 8v8
*From:* "in futsal add more options 5*5 add 6*6, 7*7, 8*8"

**Built.** Futsal now offers 4v4 through 8v8, ordered by side size, and its description no
longer calls it five-a-side only. `sync_catalogue` matches on `(sport, slug)`, so migration
`sports/0007` adds the three rows and corrects the ordering of the two existing ones
without touching any ground's format selection. The reverse is a no-op on purpose: a
booking may reference 7v7 futsal by then, and a format cannot be removed from under one.

**Verified.** 3 catalogue tests (including that the new formats stayed `booking_unit=time`
and did not accidentally become per-match, D102); `seed_demo` reports 14 formats; Chrome
shows Futsal 4v4/5v5/6v6/7v7/8v8 in the owner's add-ground format picker.

*Decision recorded:* D104.

### The turf settings page stops shouting
*From:* "make turf dashboard simple all the options or butting that can be categorize pull
them in a dropdown and add explining text"

**Built.** The four unfolded cards became `<details>` disclosures, each with a title, a
line explaining what it is for, and — the point of the change — a summary of its own state
while shut: "2 grounds · 2 active", "Open 7 days a week", "No opening hours set — nothing
can be booked". The first *incomplete* section opens on arrival, so the page answers
"what now?" before it offers thirty inputs. Submit-for-review stays a plain card: it is
the call to action, not a section to go looking in. Native `<details>` rather than a Radix
accordion — the keyboard handling is the browser's, and `<details>` keeps children mounted,
so collapsing a section does not discard a half-typed form.

Also extracted the duplicated DRF-error formatter to `lib/api/errors.ts`.

**Verified.** Chrome: all five sections render collapsed with correct summaries on an
established turf; opening Location and Grounds works; lint, typecheck, format and 71
Vitest tests green.

*Decision recorded:* D105.
