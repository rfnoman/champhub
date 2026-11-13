"""The project's admin site: Unfold's, plus the second factor (DECISIONS D64, D96).

Why a class at all. Unfold themes the admin by overriding templates, which needs nothing
from us — but two-factor sign-in is a property of the *site*: it is the object that
decides whether a logged-in user may be here (`has_permission`) and which template the
login page renders. django-otp ships `OTPAdminSite` for exactly that, and it cannot be
used here because it is an `AdminSite` subclass of its own: taking it would mean giving
up Unfold's site, which carries the sidebar, the search and the whole theme.

So the two are put together by hand, and it is a small amount of code: an `is_verified()`
check and a login template. The rest — the OTP token field and its validation — is in
`admin_forms.AdminLoginForm`, which Unfold loads through `UNFOLD["LOGIN"]["form"]`.

The flag is read **per request**, not at import. `ADMIN_REQUIRES_OTP` is set in
`base.py` and overridden in `prod.py`, so a class that decided its own bases or its own
form from the setting at import time would be built from the wrong value under the
production settings module — an admin who authenticates and is then refused, with nowhere
to type a code. Reading it through `apps.core.utils.setting` also means it can be flipped
from a `PlatformSetting` row, like every other rule in this codebase.
"""

from __future__ import annotations

from django.http import HttpRequest
from unfold.sites import UnfoldAdminSite

from .utils import setting


def admin_requires_otp() -> bool:
    """Whether a TOTP device must have been verified to use the admin."""
    return bool(setting("ADMIN_REQUIRES_OTP", False))


class ChampHubAdminSite(UnfoldAdminSite):
    """Unfold's admin site, gated on a verified TOTP device when that is switched on."""

    #: Unfold's login page plus the token fields, shown only when the gate is on. A
    #: separate name rather than an override of `admin/login.html`, so the template can
    #: extend Unfold's own without extending itself.
    login_template = "admin/login_otp.html"

    def has_permission(self, request: HttpRequest) -> bool:
        """Staff, and — when the gate is on — verified by a registered device.

        Deliberately the same shape as django-otp's own check: an unverified admin is
        treated exactly as if they were not staff, so they are bounced to the login page
        rather than shown a half-usable admin.
        """
        if not super().has_permission(request):
            return False
        if not admin_requires_otp():
            return True
        # `OTPMiddleware` decorates the user with `is_verified`; if it is somehow absent,
        # nothing has verified anybody and the honest answer is no.
        is_verified = getattr(request.user, "is_verified", None)
        return bool(is_verified and is_verified())

    def each_context(self, request: HttpRequest) -> dict:
        """Tell the login template whether to ask for a token."""
        return {**super().each_context(request), "admin_requires_otp": admin_requires_otp()}
