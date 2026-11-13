"""The admin login form: Unfold's, plus a TOTP token when the gate is on (D64, D96).

django-otp's own `OTPAdminAuthenticationForm` cannot be used directly, because the field
styling has to come from Unfold's form — so this is that form with django-otp's mixin on
top, which is all `OTPAdminAuthenticationForm` is too.

The one real difference from django-otp's version: **the token is only required when
`ADMIN_REQUIRES_OTP` says so.** django-otp's form always demands one, which is why the
old wiring had to swap the whole admin site class to turn the feature on. Here one form
is installed permanently and asks the setting per submission, so development stays a
password away and production stays two factors away, with nothing to keep in step.
"""

from __future__ import annotations

from typing import Any

from django import forms
from django.utils.translation import gettext_lazy as _
from django_otp.forms import OTPAuthenticationFormMixin
from unfold.forms import AuthenticationForm
from unfold.widgets import BASE_INPUT_CLASSES

from .admin_site import admin_requires_otp


class AdminLoginForm(AuthenticationForm, OTPAuthenticationFormMixin):
    """Username, password, and — when required — a code from a registered device."""

    otp_token = forms.CharField(required=False, label=_("Authenticator code"))
    # Two fields django-otp's mixin reads: which device to use, and a flag for its
    # "send me a challenge" button. Neither is offered here — every device is a TOTP app
    # and there is nothing to send — but the mixin looks them up, so they exist, hidden.
    otp_device = forms.CharField(required=False, widget=forms.HiddenInput)
    otp_challenge = forms.CharField(required=False, widget=forms.HiddenInput)

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        # The same classes Unfold puts on username and password, so the three inputs on
        # the login page are one form rather than two styles.
        self.fields["otp_token"].widget.attrs.update(
            {
                "class": " ".join(BASE_INPUT_CLASSES),
                "autocomplete": "one-time-code",
                "inputmode": "numeric",
            }
        )

    def clean(self) -> dict[str, Any]:
        self.cleaned_data = super().clean()
        if admin_requires_otp():
            # Raises unless the token matches a device registered to this account. It
            # runs after the password has been checked, so a wrong password never reveals
            # whether an account has a device.
            self.clean_otp(self.get_user())
        return self.cleaned_data
