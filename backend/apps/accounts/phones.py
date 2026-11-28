"""One spelling for a Bangladeshi phone number (tasks.md).

A walk-in gives their number at the counter and may give it again three weeks later;
the same person then signs up through Clerk and types it a third way. `01711-234567`,
`+8801711234567` and `8801711234567` are one number, and a guest profile keyed on the
raw string would be three people — which would break the claim flow in the way that
matters most, by hiding bookings the person really did make.

So everything is stored normalised to E.164 (`+8801711234567`) and compared that way.
Bangladeshi mobiles are the case worth getting exactly right; anything else is kept as
digits with a leading `+`, because refusing a number is worse than storing an odd one.

Unverified, as D9 records — nobody has proved they own the number. That is precisely why
claiming a guest's history needs an admin to look at it rather than a matching string.
"""

from __future__ import annotations

import re

from django.core.exceptions import ValidationError

#: Bangladeshi mobiles are 11 digits beginning `01`, the operator digit being 3–9.
_BD_LOCAL = re.compile(r"^01[3-9]\d{8}$")
_DIGITS = re.compile(r"\D")


def normalise_phone(raw: str | None) -> str:
    """`+8801711234567` out of whatever somebody typed. Empty in, empty out."""
    if not raw or not raw.strip():
        return ""

    text = raw.strip()
    plus = text.startswith("+")
    digits = _DIGITS.sub("", text)
    if not digits:
        return ""

    if _BD_LOCAL.match(digits):
        return f"+880{digits[1:]}"
    if digits.startswith("880") and _BD_LOCAL.match(f"0{digits[3:]}"):
        return f"+{digits}"
    # Not a Bangladeshi mobile: keep it, spelled consistently.
    return f"+{digits}" if plus or len(digits) > 10 else digits


def validate_phone(raw: str) -> str:
    """Normalise, or explain why not. Used where a number identifies somebody."""
    value = normalise_phone(raw)
    if not value:
        raise ValidationError({"phone": "A phone number is needed."})
    if len(_DIGITS.sub("", value)) < 10:
        raise ValidationError({"phone": "That does not look like a phone number."})
    return value


def mask_phone(value: str) -> str:
    """`•••••••4567` — what a guest's number looks like anywhere it is not needed in full.

    The same treatment identity document numbers get (DOMAIN §1a): enough for the person
    to recognise their own, not enough to be worth reading off somebody's screen.
    """
    digits = _DIGITS.sub("", value or "")
    if len(digits) < 4:
        return "••••"
    return "•" * (len(digits) - 4) + digits[-4:]
