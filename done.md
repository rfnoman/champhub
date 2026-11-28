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

---

## Batch 2 — 2026-11-28

### Stars instead of a number, and stickers instead of silence
*From:* "Make the player rating simple just show stars. highes is 5 and add tags that
people can give him with cool sticker design. for example cool as cucumber, strong as
bricks, Powerful as train, baap ka beta"

**Built — stars.** The engine keeps its 1–99 scale, because it has to move in small
steps as matches land and is compared against opponents' averages (DOMAIN §8). What
changed is what a player *reads*: `apps/ratings/stars.py` converts linearly to 0–5 in
half steps, server-side, so both frontends show one answer rather than each doing its
own arithmetic. The profile card's focal point is now "3.0" over a row of stars where a
two-digit number used to shout — "72" invites an argument about why it is not 75.

**Built — stickers.** `PlayerTag` is an admin-editable catalogue (12 seeded, including
all four from the brief) with an emoji, a Bangla label, a one-line description and one of
five `tone`s that colour it. `PlayerTagAward(match, giver, receiver, tag)` is a row
rather than a list on `PeerRating`, because the profile shows "🥒 Cool as a cucumber ×7"
and counting that is a `GROUP BY` on every profile view. Awards are anonymous to the
recipient exactly like the peer ratings they arrive with (DOMAIN §7) — `giver` exists
only to stop one person stacking the same sticker twice.

They are given in the post-match sheet, alongside the stars and only once a rating has
been given: a tag with no stars behind it is a compliment from somebody who could not be
bothered to say how the player actually did. Saving **replaces** that rater's set rather
than adding to it, so unticking takes a sticker back — which is why `my_peer_tags` comes
back on the scorecard and the picker reloads ticked. Three per player, from
`PEER_TAGS_MAX_PER_PLAYER` via `/config` so the picker cannot disagree with what the
save will accept. A retired tag leaves the picker and **stays** on the profiles that
earned it.

Drawn as peeling stickers — a deterministic lean from the key, a soft shadow, a tone
pair that works on both themes — rather than flat chips, so a wall of them reads as
things people gave you and not as filter pills.

**Deviation worth knowing.** Both tag endpoints are **authenticated**, not public. The
first draft had them open and `test_permission_matrix` caught it: a profile's track
record, rating history and fair-play record all sit behind a sign-in, and tags belong
with them. Widening the anonymous surface would have bought nothing — the only screen
that needs the catalogue is the post-match sheet, which is behind the door anyway.

**Also found.** The tag catalogue is reference data, so `conftest.reseed_reference_data`
had to learn about it — without that, any test running after a `transaction=True` test
saw an empty catalogue and every tag was "no such tag".

**Verified.** 2004 backend tests pass (41 new: stars conversion, catalogue, counting and
ordering, the replace-not-append semantics, the limit, retired tags, the constraints, and
the API round trip). Driven in Chrome: the profile shows 3.0 ★★★☆☆ and "What people say"
with Baap ka beta ×2, Cool as a cucumber ×2 and Engine; on a submitted scorecard the
picker appeared only after a star was given, two stickers were picked and saved, and the
rows landed in `PlayerTagAward`. Both frontends lint, typecheck, format and unit-test clean.

---

## Batch 3 — 2026-11-28

### Walk-in bookings, guests, and claiming a history
*From:* "Add a option for walk in booking on turf make it smoother. Like player can come
to turf and ask manager to book a slot player can share qr or say username turf owner can
quickly find it through search and do a booking. Also let people who does not have
account book the turf with phone number and name. they will have a guest view and if they
later open account through clerk and gives the same phone number a message with button
will say this number was user for guest login do you want to claim the account…"

**Built — the counter.** The walk-in form now asks *which kind of person is standing
there*. With an account, staff find them by `@handle`, phone or name and the booking is
**theirs**: `booked_by` is the player, so it lands in their app, puts them on the match
roster and counts towards their record. Before this, a player with an account who turned
up in person got a row recorded against the cashier that they could never see. The
counter search ignores `discoverable` on purpose — that flag hides you from the
directory, and somebody saying their own handle at a counter is the opposite of hiding
(DOMAIN §1b) — and is throttled and needs two characters, because it is a lookup for a
person who is present, not a way to walk the user table.

**Built — the QR.** The player's profile shows a QR containing a plain https link to the
owner app's `/counter?player=<handle>`, so the **manager's own phone camera** resolves
it. No scanner, no camera permission, no QR dependency in either frontend, and it works
for a manager who has installed nothing. It carries only the handle, which is public by
design — a QR held up in a room full of strangers must not be a credential. Rendered
server-side with `segno` and inlined with `currentColor`, so it inverts with the theme.
A manager with one turf is redirected straight through to the booking form with that
player already searched for.

**Built — guests.** No account means a `GuestProfile` keyed on the **normalised** phone
(`apps/accounts/phones.py`): `01711-234567`, `+8801711234567` and `8801711234567` are one
person, and keying on the raw string would turn a Friday regular into eight guests and
hide every one of them from a later claim. They read their own bookings at `/guest` with
their number **and a six-character code** from the counter — a number alone would let
anybody who knows one read a stranger's evening plans.

**Built — claiming.** The app offers, the person asks, a platform admin decides. The
offer is driven only by the number *that account* gave Clerk and never names the guest,
so "is this number yours?" cannot become a directory lookup. Approval is one transaction:
re-point the bookings, clear the walk-in fields (they are what kept the booker off the
roster), **add the player to each match roster** — the point of claiming is for the
history to count — mark the guest claimed, and withdraw any rival claim. The reviewer
sees the guest's full number; everybody else gets `•••••••7766`.

**Deviations and findings worth knowing.**

- **The reviewer's "same number" hint was comparing strings and got it backwards.** Clerk
  stores what the person typed (`01799887766`); the guest row is normalised
  (`+8801799887766`). Driving it in the browser showed "different" for the case where a
  reviewer most wants to be told "same". Moved to the backend as `numbers_match`, where
  normalisation lives — and where the two frontends cannot disagree (D83).
- **I clobbered the owner app's `counter` i18n namespace** (the POS till) by naming the
  new QR landing page's namespace the same thing. Restored from HEAD; the new one is
  `counterScan`.
- **The guest lookup is the one new public route**, declared in `test_permission_matrix`
  with its reason. Rate-limited on the **number being asked about**, not the address: as
  that settings comment says, every server-rendered page reaches Django from the frontend
  server's single IP, so an IP-keyed limit would throttle the site before it troubled a
  code guesser.
- **Both tag endpoints from batch 2 ended up authenticated** for the same permission-matrix
  reason — see that batch.
- New dependency: `segno` (pure Python, no transitive deps), noted in D109.

**Verified.** 2102 backend tests pass (103 new across phones, guests, claims, the walk-in
API, the counter search and the QR). Driven in Chrome end to end: booked for a found
player and confirmed the row was theirs and on the roster; read a guest's two bookings at
`/guest` with phone + code; claimed them from the profile; approved in the admin queue
and watched both bookings move onto the account and onto their rosters; followed the QR
link from `/counter?player=…` through the turf picker to a pre-filled form. Both
frontends lint, typecheck, format and unit-test clean.

*Decisions recorded:* D108, D109, D110.

**Follow-ups, honestly.**

- **The walk-in time field is free text against a per-match ground.** Typing 19:00 on a
  badminton court that sells 45-minute matches gets "That slot is not offered on this
  ground" — correct, and discovered by driving it, but the field should offer the slots
  the ground actually has rather than letting staff guess. Pre-existing (D102), surfaced
  here.
- **A guest's access code cannot be reissued.** Lose the receipt and there is no path
  back except staff reading it off the admin.
- **Nothing tells a guest their code.** The booking is confirmed at the counter and the
  code exists, but no receipt, SMS or printout carries it yet — today a staff member has
  to read it out.
- **A rejected claim gives no way to appeal in-app.** The copy says to ask turf staff to
  vouch, and there is no mechanism for staff to do that vouching.
- **The Bangla for all of this is mine**, and joins the queue waiting on a native speaker.

---

## Verification notes — 2026-11-28

Running the end-to-end suites against the **production build** (not `next dev`, per the
Playwright config's own comment) turned up seven failing specs. None of them were app
bugs introduced by this work, but two kinds are worth writing down.

**Four specs encoded behaviour this batch deliberately changed.** They clicked past the
registration form's map step with a comment saying the Dhaka default was fine, and one
filled the walk-in Name and Phone directly. Both are now wrong on purpose (D103, D108),
so the specs paste a Maps link and pick the guest half of the form. That is the kind of
failure a test is *for*.

**Three were the specs' own bugs, and had been for a while.** `usernames.spec.ts` asked
for `role=heading` on a card title the design system renders as a `<div>`, matched
`role=alert` where Next's route announcer also matches, and clicked Invite then switched
browser context before the POST had landed. The database was checked first — the invites
were being written with `leader_approved` and the serializer's own filter found them —
so there was nothing to fix behind the glass. The file's absence from the previous
phase's list of green specs now makes sense.

**Also worth knowing for the next person:** `npm run test:e2e` locally reuses an already
running dev server (`reuseExistingServer: !CI`), so a dev server left up means the suite
silently tests `next dev` and reports failures the config exists to avoid — and Clerk's
secret has to be exported into the shell or 115 authenticated specs skip without saying
much about it.
