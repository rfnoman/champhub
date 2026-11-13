"""Handles: the rules for one, in one place (DOMAIN §1b).

A username is the only *human-chosen, human-typed* identifier in the system. Everything
else a player is known by is either a UUID (safe, unguessable, unspeakable) or a display
name (duplicated freely — there are several Rafiqs). A handle has to be unique, so it
also has to be a shape people can copy off a screen, type into a phone, and say out loud
without ambiguity. That is why the alphabet is this narrow:

* **Lowercase only, and stored lowercase.** ``@Rafiq`` and ``@rafiq`` must not be two
  accounts, and the cheapest way to guarantee that is to have only one spelling exist.
  A mixed-case handle is accepted on input and folded, so nobody is told off for typing
  the way they write their name.
* **Letters, digits and underscore, starting with a letter.** No dots and no hyphens:
  ``rafiq.hasan`` and ``rafiq-hasan`` are read aloud identically, and a leading digit
  invites a handle that looks like an id.
* **Reserved words are refused.** ``@admin``, ``@champhub`` and ``@support`` are not
  handles anybody should be able to answer to, and every word that is a route in either
  frontend is refused too, so ``/players/@settings`` can never be a real person.

The messages matter as much as the rules. Each one names the single thing that is wrong
with what was typed, because the alternative — "invalid username" against a field that
looks fine to the person who filled it in — is how a signup gets abandoned.
"""

from __future__ import annotations

import re

from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

from apps.core.utils import setting

#: Read from settings **at import**, not through `setting()` like the rest: `MAX_LENGTH`
#: is the model field's `max_length`, so it is a column width — changing it is a
#: migration, not a configuration change, and a `PlatformSetting` row must not be able to
#: disagree with the database. `getattr` so a stripped-down settings module still imports.
MIN_LENGTH = getattr(settings, "USERNAME_MIN_LENGTH", 3)
MAX_LENGTH = getattr(settings, "USERNAME_MAX_LENGTH", 20)

#: The shape, checked after normalisation. Length is checked separately so "too short"
#: and "has a space in it" are different sentences.
USERNAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")


def normalize_username(raw: str | None) -> str:
    """Fold what somebody typed into the one spelling that gets stored.

    Tolerant on purpose: a person pasting their handle brings the ``@`` with it, and a
    phone keyboard capitalises the first letter of a field whether they like it or not.
    Neither is a mistake worth an error message.
    """
    return (raw or "").strip().lstrip("@").strip().lower()


def reserved_usernames() -> frozenset[str]:
    """The refused words, from settings or a `PlatformSetting` override.

    An override arrives as text (`setting()` only coerces scalars), so a comma-separated
    row reads as a list — which is what an admin adding one word to the list will type.
    """
    configured = setting("USERNAME_RESERVED", ())
    if isinstance(configured, str):
        configured = configured.split(",")
    return frozenset(normalize_username(word) for word in configured if str(word).strip())


def username_problem(value: str) -> str | None:
    """What is wrong with this handle's *shape*, or ``None``.

    Nothing here touches the database: uniqueness is a different question with a
    different answer ("taken"), and keeping them apart means the availability check and
    the save can share one description of a valid handle.

    `value` is expected to be normalised already — callers get it from
    :func:`normalize_username`, so a capital letter is never reported as an error.
    """
    if not value:
        return str(_("Choose a username."))
    if len(value) < MIN_LENGTH:
        return str(_("A username needs at least %(min)d characters.") % {"min": MIN_LENGTH})
    if len(value) > MAX_LENGTH:
        return str(_("A username can be at most %(max)d characters.") % {"max": MAX_LENGTH})
    if not value.isascii():
        # Worth its own sentence rather than falling through to the one below: this app
        # is half in Bangla, so somebody typing their handle in Bangla has done the
        # natural thing, and "use letters and numbers" reads like a lie to them. A
        # handle has to survive being typed into a URL and read back off a screen.
        return str(_("Use English letters — a username has to work inside a link."))
    if not value[0].isalpha():
        return str(_("A username has to start with a letter."))
    if not USERNAME_RE.match(value):
        return str(_("Use letters, numbers and underscores only — no spaces or dots."))
    if value in reserved_usernames():
        return str(_("That username is reserved. Try another."))
    return None


def validate_username(value: str) -> None:
    """Model-field validator: the same rules, raised the Django way.

    On the field as well as in the service so that a handle written by a fixture, a
    management command or the Django admin obeys the rules the API enforces. It
    normalises nothing — `set_username` does that before the value ever reaches here, and
    a validator that quietly rewrote its input would hide a path that stores a capital.
    """
    problem = username_problem(value or "")
    if problem:
        raise ValidationError(problem, code="invalid_username")
