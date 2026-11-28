"""Guests, and an account claiming one's history (tasks.md).

Someone walks into a turf, asks the manager for the 8pm slot, gives a name and a number
and plays. Months later they install the app. Everything they have already done is in
the database under a `GuestProfile`, and the only thing connecting it to their new
account is a phone number nobody has verified (DECISIONS D9).

So the join is **offered, requested and reviewed**, in that order:

* ``guest_for_phone`` finds the history when the new account's number matches, which is
  what lets the app say "this number has bookings — are they yours?";
* ``request_claim`` records the ask;
* ``approve_claim`` is a platform admin deciding, and is the only thing that moves data.

A person is never told whose history they are being offered — ``guest_for_phone`` is
only ever called with the caller's *own* number, and what comes back is a count and a
masked number. Typing a stranger's number into the app must not print their name.
"""

from __future__ import annotations

import logging

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.core.utils import now

from .models import AccountClaim, GuestProfile
from .phones import normalise_phone, validate_phone

logger = logging.getLogger(__name__)


def get_or_create_guest(*, phone: str, name: str, created_by=None) -> GuestProfile:
    """The guest behind a phone number, creating them on first sight.

    The name is refreshed on every booking: people give "Rafi" once and "Rafiqul Hasan"
    the next time, and the later spelling is the better one to print on a receipt. An
    **already-claimed** guest is left alone — their name belongs to an account now.
    """
    number = validate_phone(phone)
    guest, created = GuestProfile.objects.get_or_create(
        phone=number,
        defaults={"name": name.strip() or "Guest", "created_by": created_by},
    )
    if not created and name.strip() and not guest.is_claimed and guest.name != name.strip():
        guest.name = name.strip()
        guest.save(update_fields=["name", "updated_at"])
    return guest


def guest_for_phone(phone: str) -> GuestProfile | None:
    """An unclaimed guest with this number, or ``None``.

    Claimed ones are excluded on purpose: their history has already moved, so offering
    it again would be offering nothing, and twice would be offering somebody else's.
    """
    number = normalise_phone(phone)
    if not number:
        return None
    return GuestProfile.objects.filter(phone=number, claimed_by__isnull=True).first()


def claimable_for(user) -> GuestProfile | None:
    """What this account could claim, based on the number *they* gave Clerk.

    Keyed on the user's own phone and nothing else. There is deliberately no way to ask
    "what is behind this number?" for a number that is not yours.
    """
    if not getattr(user, "phone", ""):
        return None
    guest = guest_for_phone(user.phone)
    if guest is None:
        return None
    # Nothing to claim if the guest never actually booked anything.
    return guest if guest.bookings.exists() else None


def open_claim_for(user, guest: GuestProfile) -> AccountClaim | None:
    return AccountClaim.objects.filter(
        user=user, guest=guest, status=AccountClaim.Status.PENDING
    ).first()


@transaction.atomic
def request_claim(*, user, guest: GuestProfile, message: str = "") -> AccountClaim:
    """Ask an admin to join a guest's history to this account."""
    if guest.is_claimed:
        raise ValidationError({"guest": "Those bookings already belong to an account."})

    existing = open_claim_for(user, guest)
    if existing:
        return existing

    claim = AccountClaim.objects.create(user=user, guest=guest, message=message.strip()[:300])
    logger.info("Account claim requested", extra={"claim": str(claim.id), "user": str(user.id)})
    _notify_admins(claim)
    return claim


@transaction.atomic
def approve_claim(*, claim: AccountClaim, actor, reason: str = "") -> AccountClaim:
    """Join the guest's bookings to the account. The only step that moves data.

    Three things change together, which is why this is one transaction:

    * every booking of the guest's is re-pointed at the account, so it shows up in the
      player's own list and on their profile;
    * the **match roster** for each of those bookings gains the player, because a
      booking the guest made created a match with nobody on it (`booked_for_name` keeps
      the booker off the roster) and the point of claiming is for that history to count;
    * the number lands on the account if it had none, and the guest is marked claimed so
      nobody can claim it twice.

    Any other claim on the same guest is withdrawn: once the history has moved there is
    nothing left for a second claimant, and leaving them pending would invite a reviewer
    to approve the same bookings twice.
    """
    if claim.status != AccountClaim.Status.PENDING:
        raise ValidationError({"status": "That claim has already been decided."})
    guest = claim.guest
    if guest.is_claimed:
        raise ValidationError({"guest": "Those bookings already belong to an account."})

    moved = _move_bookings(guest=guest, user=claim.user)

    guest.claimed_by = claim.user
    guest.claimed_at = now()
    guest.save(update_fields=["claimed_by", "claimed_at", "updated_at"])

    if not claim.user.phone:
        claim.user.phone = guest.phone
        claim.user.save(update_fields=["phone", "updated_at"])

    claim.status = AccountClaim.Status.APPROVED
    claim.decision_reason = reason.strip()
    claim.reviewed_by = actor
    claim.reviewed_at = now()
    claim.bookings_moved = moved
    claim.save(
        update_fields=[
            "status",
            "decision_reason",
            "reviewed_by",
            "reviewed_at",
            "bookings_moved",
            "updated_at",
        ]
    )

    AccountClaim.objects.filter(guest=guest, status=AccountClaim.Status.PENDING).exclude(
        pk=claim.pk
    ).update(
        status=AccountClaim.Status.WITHDRAWN,
        decision_reason="Another account claimed these bookings.",
        reviewed_at=now(),
    )

    _notify_claimant(claim, approved=True)
    logger.info("Account claim approved", extra={"claim": str(claim.id), "bookings": moved})
    return claim


@transaction.atomic
def reject_claim(*, claim: AccountClaim, actor, reason: str) -> AccountClaim:
    """Turn a claim down. A reason is required — the person reads it."""
    if claim.status != AccountClaim.Status.PENDING:
        raise ValidationError({"status": "That claim has already been decided."})
    if not reason.strip():
        raise ValidationError({"reason": "Say why, so the person knows what to do next."})

    claim.status = AccountClaim.Status.REJECTED
    claim.decision_reason = reason.strip()
    claim.reviewed_by = actor
    claim.reviewed_at = now()
    claim.save(
        update_fields=[
            "status",
            "decision_reason",
            "reviewed_by",
            "reviewed_at",
            "updated_at",
        ]
    )
    _notify_claimant(claim, approved=False)
    return claim


@transaction.atomic
def withdraw_claim(*, claim: AccountClaim) -> AccountClaim:
    """The person changing their mind before anybody looked at it."""
    if claim.status != AccountClaim.Status.PENDING:
        raise ValidationError({"status": "That claim has already been decided."})
    claim.status = AccountClaim.Status.WITHDRAWN
    claim.reviewed_at = now()
    claim.save(update_fields=["status", "reviewed_at", "updated_at"])
    return claim


def _move_bookings(*, guest: GuestProfile, user) -> int:
    """Re-point the guest's bookings at the account, and put them on the rosters."""
    from apps.matches.models import MatchPlayer

    bookings = list(guest.bookings.select_related("match").all())
    for booking in bookings:
        booking.booked_by = user
        # The walk-in fields are cleared: they are what made the roster skip the booker
        # (`apps.matches.services`), and with the booking now owned by an account the
        # player *is* the booker.
        booking.booked_for_name = ""
        booking.booked_for_phone = ""
        booking.guest = None
        booking.save(
            update_fields=[
                "booked_by",
                "booked_for_name",
                "booked_for_phone",
                "guest",
                "updated_at",
            ]
        )

        match = getattr(booking, "match", None)
        if match is not None:
            MatchPlayer.objects.get_or_create(match=match, player=user)

    return len(bookings)


def _notify_admins(claim: AccountClaim) -> None:
    from apps.accounts.models import User
    from apps.notifications.models import NotificationKind
    from apps.notifications.services import notify_many

    admins = list(User.objects.filter(is_platform_admin=True, is_active=True))
    if not admins:
        return
    from .phones import mask_phone

    notify_many(
        users=admins,
        kind=NotificationKind.ACCOUNT_CLAIM_SUBMITTED,
        url="/admin/claims",
        data={"claim_id": str(claim.id)},
        person=claim.user.full_name or claim.user.email,
        bookings=claim.guest.bookings.count(),
        # Masked even to a reviewer in a list: the full number is on the claim itself,
        # which is where a decision is actually made (DOMAIN §1a's reasoning).
        phone=mask_phone(claim.guest.phone),
    )


def _notify_claimant(claim: AccountClaim, *, approved: bool) -> None:
    from apps.notifications.models import NotificationKind
    from apps.notifications.services import notify

    notify(
        user=claim.user,
        kind=(
            NotificationKind.ACCOUNT_CLAIM_APPROVED
            if approved
            else NotificationKind.ACCOUNT_CLAIM_REJECTED
        ),
        url="/bookings" if approved else "/settings",
        data={"claim_id": str(claim.id)},
        bookings=claim.bookings_moved,
        reason=claim.decision_reason,
    )
