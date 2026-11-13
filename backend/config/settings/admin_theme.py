"""The Django admin's appearance and navigation (django-unfold, DECISIONS D96).

Kept out of ``base.py`` because it is one long literal with no conditionals in it: the
palette, the sidebar and the login page, and nothing that any other setting depends on.
``base.py`` imports ``UNFOLD`` from here.

Two things are worth knowing before editing it.

**The palette is the product's.** The greens are the frontend's `--brand` family from
`globals.css` (hue 158, D73), and the greys are the same green-greys rather than dead
greys — an admin and the player app that share a database should look like they do. The
scale is 50–950 because that is what Unfold's CSS variables expect; `600` is the one that
carries the buttons and links, which is why the brand value sits there rather than at
`500`.

**The sidebar is curated, not generated.** There are 59 registered models and listing
them all would be a worse index than the one Unfold builds by itself. What is here is
what somebody actually opens: the eight groups below, in the order a support question
tends to arrive in. Everything else stays one click away under "All applications", which
is why `show_all_applications` is on — a model that is not in this list must never become
unreachable.
"""

from django.urls import reverse_lazy
from django.utils.translation import gettext_lazy as _


def _can_view(target: str):
    """A sidebar link's permission check: ``view`` on that one model.

    Without this the sidebar would offer a staff account links to pages it is about to be
    refused by. A superuser passes everything, which is what every admin here is today —
    the callback exists for the day one of them is not.
    """
    app_label, model = target.split(".")

    def check(request) -> bool:
        return request.user.has_perm(f"{app_label}.view_{model}")

    return check


def _item(title, target: str, icon: str) -> dict:
    """One sidebar link to a model's changelist."""
    app_label, model = target.split(".")
    return {
        "title": title,
        "icon": icon,
        "link": reverse_lazy(f"admin:{app_label}_{model}_changelist"),
        "permission": _can_view(target),
    }


UNFOLD = {
    "SITE_TITLE": _("ChampHub admin"),
    "SITE_HEADER": _("ChampHub"),
    "SITE_SUBHEADER": _("Platform administration"),
    "SITE_SYMBOL": "sports_soccer",
    # No "view site" link: this server's `/` is the API, and the thing an admin would
    # want to look at — a turf, a player — lives on a different origin (D83) that Django
    # is not told about. A dead link is worse than no link.
    "SITE_URL": None,
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": False,
    "SHOW_BACK_BUTTON": True,
    "COLORS": {
        # Green-greys (hue 158), so the chrome agrees with the product's `--background`
        # and `--pitch` rather than being a neutral slate.
        "base": {
            "50": "oklch(97.5% .004 158)",
            "100": "oklch(96% .005 158)",
            "200": "oklch(92.8% .008 158)",
            "300": "oklch(87% .01 158)",
            "400": "oklch(70% .012 158)",
            "500": "oklch(55% .015 158)",
            "600": "oklch(45% .018 158)",
            "700": "oklch(37% .02 158)",
            "800": "oklch(27% .022 158)",
            "900": "oklch(19% .022 158)",
            "950": "oklch(12.6% .026 158)",
        },
        # The pitch green. `600` is `--brand` exactly; the rest is a scale around it.
        "primary": {
            "50": "oklch(97.5% .02 158)",
            "100": "oklch(94.5% .04 158)",
            "200": "oklch(89% .07 158)",
            "300": "oklch(81% .1 158)",
            "400": "oklch(70% .13 158)",
            "500": "oklch(60% .14 158)",
            "600": "oklch(52% .13 158)",
            "700": "oklch(44% .11 158)",
            "800": "oklch(36% .09 158)",
            "900": "oklch(29% .07 158)",
            "950": "oklch(19% .045 158)",
        },
    },
    "LOGIN": {
        # Always this form, and it decides per request whether a TOTP token is required
        # (DECISIONS D64/D96) — `ADMIN_REQUIRES_OTP` is overridden in `prod.py` *after*
        # `base.py` has been read, so a form chosen at settings-import time here would be
        # the wrong one in production: an admin would authenticate and then be refused
        # with nowhere to type a code.
        "form": "apps.core.admin_forms.AdminLoginForm",
    },
    "COMMAND": {
        # ⌘K over the model list: with 59 models, searching beats scrolling.
        "search_models": True,
    },
    "SIDEBAR": {
        "show_search": True,
        # Never let a curated list hide a model. Everything registered stays reachable.
        "show_all_applications": True,
        "navigation": [
            {
                "title": _("People"),
                "separator": True,
                "items": [
                    _item(_("Accounts"), "accounts.user", "person"),
                    _item(_("Identity checks"), "accounts.identityverification", "verified_user"),
                    _item(_("Player profiles"), "players.playerprofile", "sports_handball"),
                    _item(_("Conduct reports"), "ratings.conductreport", "report"),
                ],
            },
            {
                "title": _("Venues"),
                "separator": True,
                "items": [
                    _item(_("Turfs"), "turfs.turf", "stadium"),
                    _item(_("Grounds"), "turfs.ground", "grass"),
                    _item(_("Price rules"), "turfs.pricerule", "sell"),
                    _item(_("Closures"), "turfs.closure", "event_busy"),
                    _item(_("Turf staff"), "turfs.turfmembership", "badge"),
                ],
            },
            {
                "title": _("Play"),
                "separator": True,
                "items": [
                    _item(_("Bookings"), "bookings.booking", "event"),
                    _item(_("Matches"), "matches.match", "sports_soccer"),
                    _item(_("Squads"), "matches.squad", "groups"),
                    _item(_("Scorecards"), "scoring.scorecard", "scoreboard"),
                ],
            },
            {
                "title": _("Money"),
                "separator": True,
                "items": [
                    _item(_("Payments"), "payments.payment", "payments"),
                    _item(_("Refunds"), "payments.refund", "undo"),
                    _item(_("Payouts"), "payments.payout", "account_balance"),
                    _item(_("Ledger"), "payments.ledgerentry", "receipt_long"),
                    _item(_("Commission plans"), "payments.commissionplan", "percent"),
                ],
            },
            {
                "title": _("Store and stock"),
                "separator": True,
                "items": [
                    _item(_("Products"), "inventory.product", "inventory_2"),
                    _item(_("Stock"), "inventory.stockitem", "warehouse"),
                    _item(_("Counter sales"), "inventory.countersale", "point_of_sale"),
                    _item(_("Orders"), "store.order", "local_shipping"),
                    _item(_("Delivery zones"), "store.deliveryzone", "map"),
                ],
            },
            {
                "title": _("Fitness"),
                "separator": True,
                "items": [
                    _item(_("Activity log"), "fitness.activitylog", "directions_run"),
                    _item(_("Goals"), "fitness.fitnessgoal", "flag"),
                    _item(_("Bundles"), "fitness.bundle", "redeem"),
                ],
            },
            {
                "title": _("Catalogue"),
                "separator": True,
                "items": [
                    _item(_("Sports"), "sports.sport", "category"),
                    _item(_("Sport proposals"), "sports.sportproposal", "pending"),
                    _item(_("Attributes"), "sports.attribute", "straighten"),
                    _item(_("Amenities"), "turfs.amenity", "checkroom"),
                ],
            },
            {
                "title": _("Platform"),
                "separator": True,
                "items": [
                    _item(_("Platform settings"), "core.platformsetting", "tune"),
                    _item(_("Notifications"), "notifications.notification", "notifications"),
                    _item(_("TOTP devices"), "otp_totp.totpdevice", "key"),
                    _item(_("Permission groups"), "auth.group", "shield_person"),
                ],
            },
        ],
    },
}
