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
