"""Rate limits for the actions that reach another person (Phase 11 step 4).

The default limits in ``REST_FRAMEWORK`` are a ceiling for ordinary use. These are not:
each one covers something that lands in somebody else's inbox, queue or notifications,
and there is no legitimate reason to do any of them quickly.

They are scoped rather than global so the numbers can be read next to the thing they
protect, and each rate lives in settings (CLAUDE.md: configurable rules in one place).
"""

from __future__ import annotations

from rest_framework.throttling import (
    ScopedRateThrottle,
    SimpleRateThrottle,
    UserRateThrottle,
)


class ReachingPeopleThrottle(UserRateThrottle):
    """Join requests, match invites, squad invites.

    Twenty an hour is more than anybody organising a game will ever send, and far fewer
    than it takes to make the app unpleasant for somebody else.
    """

    scope = "reaching-people"


class ReportThrottle(UserRateThrottle):
    """Conduct reports, which go to a human review queue (D47).

    The queue is the scarce resource: ten an hour from one account is already more than
    a reviewer can act on, and a flood would bury the real ones.
    """

    scope = "reports"


class PlayerSearchThrottle(UserRateThrottle):
    """The player directory.

    Searchable by design (DOMAIN §3) — but searchable is not the same as scrapeable, and
    the difference is a rate. `discoverable=False` keeps somebody out of results
    entirely; this stops the rest being walked wholesale.
    """

    scope = "player-search"


class UsernameCheckThrottle(UserRateThrottle):
    """The "is this handle free?" check (DOMAIN §1b).

    It answers an existence question about any handle somebody cares to name, which is
    also how you would enumerate the user base one guess at a time. A handle is public
    by design — it is on a profile and pasted into chats — so what is worth limiting is
    the rate: a person picking a name tries a handful, a script tries a dictionary.
    """

    scope = "username-check"


class WebhookThrottle(ScopedRateThrottle):
    """Clerk's webhook, and anything else a vendor calls.

    Anonymous by nature — it authenticates by signature, not by session — so without a
    scope of its own it would share the anonymous bucket with every signed-out visitor,
    and a burst of user updates would start being dropped.
    """

    scope = "webhook"


class GuestLookupThrottle(SimpleRateThrottle):
    """The guest booking lookup, keyed on the **phone number being asked about**.

    A six-character code is the only thing protecting a guest's bookings, so this is the
    one limit that genuinely stands between a secret and a guessing script. It must not
    key on the IP address: as the comment on ``DEFAULT_THROTTLE_RATES`` explains, every
    server-rendered page reaches Django from the frontend server's single address, so an
    IP-keyed limit would throttle the site long before it inconvenienced anybody — and a
    determined guesser has more than one address anyway.

    Keying on the number means a thousand guesses at *one* guest's code are stopped no
    matter where they come from, while a busy evening of different guests checking their
    own bookings is unaffected. A request with no readable number falls back to the IP,
    which only has to be good enough to catch nonsense.
    """

    scope = "guest-lookup"

    def get_cache_key(self, request, view):
        from apps.accounts.phones import normalise_phone

        try:
            phone = normalise_phone((request.data or {}).get("phone", ""))
        except AttributeError, TypeError:
            phone = ""
        ident = phone or self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}
