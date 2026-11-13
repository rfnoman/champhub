"""Account business logic. Views and serializers stay thin (CLAUDE.md)."""

from __future__ import annotations

import logging
from typing import Any

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.core.utils import now, player_label
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify, notify_many

from .clerk import fetch_clerk_user
from .models import (
    IDENTITY_FILE_FIELDS,
    IdentityStatus,
    IdentityVerification,
    IdentityVerificationEvent,
    User,
)
from .usernames import normalize_username, username_problem

logger = logging.getLogger(__name__)


def get_or_create_user_from_claims(claims: dict[str, Any]) -> User:
    """Return the ``User`` for a verified session token, creating it if needed.

    The webhook is the primary sync path, but it can be late, unconfigured, or have
    failed. Creating on first authenticated call means a signed-in user is never left
    without a row.

    A session token carries **no identity claims** (only ``sub``, ``sid``, ``iss`` and
    friends), so a row created here starts with no name or email. Rather than leave the
    account showing as "Player" everywhere until a webhook arrives — which never happens
    in local development, where Clerk has no public URL to call — the profile is
    backfilled once from Clerk's Backend API. Only for a row that has never been synced,
    so this costs at most one request per account, and never on the hot path afterwards.
    """
    clerk_id = claims["sub"]
    user, created = User.objects.get_or_create(clerk_id=clerk_id)
    if created:
        user.set_unusable_password()
        user.save(update_fields=["password"])
        logger.info("Created user from session token", extra={"clerk_id": clerk_id})

    if user.last_synced_at is None:
        backfill_user_from_clerk_api(user)

    return user


def backfill_user_from_clerk_api(user: User) -> User:
    """Fill a never-synced account's name, email and avatar from Clerk.

    ``last_synced_at`` is stamped even when the read fails, so an unreachable Clerk API
    costs one attempt rather than one per request. A later webhook still corrects
    everything.
    """
    payload = fetch_clerk_user(user.clerk_id)
    fields = user_fields_from_clerk_payload(payload) if payload else {}
    fields["last_synced_at"] = timezone.now()

    for field, value in fields.items():
        setattr(user, field, value)
    user.save(update_fields=[*fields, "updated_at"])

    logger.info(
        "Backfilled user from Clerk's Backend API",
        extra={"clerk_id": user.clerk_id, "found": bool(payload)},
    )
    return user


def _primary_contact(items: list[dict[str, Any]], primary_id: str | None, key: str) -> str:
    """Pick the primary email/phone out of a Clerk user payload.

    Clerk does not order these lists, so the primary one must be resolved by matching
    ``primary_*_id`` against each entry's ``id``; ``[0]`` is a real source of bugs.
    """
    if not items:
        return ""
    if primary_id:
        for item in items:
            if item.get("id") == primary_id:
                return item.get(key) or ""
    return items[0].get(key) or ""


def user_fields_from_clerk_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Map a Clerk user object onto our ``User`` fields."""
    return {
        "email": _primary_contact(
            data.get("email_addresses") or [],
            data.get("primary_email_address_id"),
            "email_address",
        ),
        "phone": _primary_contact(
            data.get("phone_numbers") or [],
            data.get("primary_phone_number_id"),
            "phone_number",
        ),
        "first_name": data.get("first_name") or "",
        "last_name": data.get("last_name") or "",
        # `image_url` is current; `profile_image_url` is the legacy Gravatar field.
        "image_url": data.get("image_url") or "",
        "last_synced_at": timezone.now(),
    }


@transaction.atomic
def sync_user_from_clerk(data: dict[str, Any]) -> User:
    """Handle ``user.created`` / ``user.updated``: upsert by ``clerk_id``."""
    clerk_id = data.get("id")
    if not clerk_id:
        raise ValueError("Clerk user payload has no 'id'.")

    fields = user_fields_from_clerk_payload(data)
    user, created = User.objects.update_or_create(clerk_id=clerk_id, defaults=fields)
    if created:
        user.set_unusable_password()
        user.save(update_fields=["password"])

    logger.info(
        "Synced user from Clerk webhook",
        # "created" is a reserved LogRecord attribute and would raise on INFO.
        extra={"clerk_id": clerk_id, "is_new": created},
    )
    return user


@transaction.atomic
def deactivate_user_from_clerk(data: dict[str, Any]) -> User | None:
    """Handle ``user.deleted``.

    The payload is a Deleted Object — ``{"object": "user", "id": ..., "deleted": true}``
    — so only the id is available. The account is soft-deactivated to keep bookings,
    scorecards and ledger history intact.
    """
    clerk_id = data.get("id")
    if not clerk_id:
        raise ValueError("Clerk delete payload has no 'id'.")

    user = User.objects.filter(clerk_id=clerk_id).first()
    if user is None:
        logger.warning("Delete webhook for unknown user", extra={"clerk_id": clerk_id})
        return None

    user.is_active = False
    user.last_synced_at = timezone.now()
    user.save(update_fields=["is_active", "last_synced_at", "updated_at"])
    logger.info("Deactivated user from Clerk webhook", extra={"clerk_id": clerk_id})
    return user


# ---------------------------------------------------------------------------
# Usernames (DOMAIN §1b)
# ---------------------------------------------------------------------------
def user_by_username(username: str | None) -> User | None:
    """The account behind a handle, or ``None``.

    Deliberately indifferent to ``discoverable``: somebody who hands over their handle
    has done the opposite of hiding, and this is the same rule a direct profile link
    already follows (DOMAIN §3). An unset handle never matches — ``normalize_username``
    turns "" and "@" alike into "", and no row stores that.
    """
    value = normalize_username(username)
    if not value:
        return None
    return User.objects.filter(username=value).first()


def username_availability(*, username: str, user: User | None = None) -> dict[str, Any]:
    """Answer "can I have this one?" without writing anything.

    Returns the normalised handle alongside the verdict, because the form that asked is
    showing the person what they typed and should show them what they would actually
    get: type ``@Rafiq_2``, see ``@rafiq_2``.

    Somebody's own current handle reads as available, so re-saving a profile without
    touching the field is not an error.
    """
    value = normalize_username(username)
    problem = username_problem(value)
    if problem:
        return {"username": value, "available": False, "reason": problem}

    taken = User.objects.filter(username=value)
    if user is not None:
        taken = taken.exclude(pk=user.pk)
    if taken.exists():
        return {
            "username": value,
            "available": False,
            "reason": "That username is taken.",
        }
    return {"username": value, "available": True, "reason": ""}


def set_username(*, user: User, username: str) -> User:
    """Claim or change a handle.

    Three things worth knowing:

    * **A change frees the old handle immediately.** There is no reservation period, so
      somebody who renames themselves can be impersonated by the next person to claim
      what they dropped. Accepted for now and written down in DECISIONS (D93); the fix
      when it matters is a `UsernameHistory` row, not a bigger service.
    * **The race is settled by the database.** Two people can pass the "taken?" check in
      the same instant; the unique index is what actually decides, and the
      `IntegrityError` it raises comes back as the same field error the check would have
      given — not a 500. The save gets its own `atomic` block so the failure does not
      poison a surrounding transaction (onboarding runs inside one).
    * **No event row.** Unlike the state machines in CLAUDE.md this is a plain attribute
      with no states to move between; the history worth keeping is the old handle, which
      is the follow-up above.
    """
    value = normalize_username(username)
    problem = username_problem(value)
    if problem:
        raise ValidationError({"username": problem})

    if user.username == value:
        return user

    if User.objects.filter(username=value).exclude(pk=user.pk).exists():
        raise ValidationError({"username": "That username is taken."})

    previous = user.username
    user.username = value
    try:
        with transaction.atomic():
            user.save(update_fields=["username", "updated_at"])
    except IntegrityError as exc:
        user.username = previous
        raise ValidationError({"username": "That username is taken."}) from exc

    logger.info(
        "Username set",
        extra={"user": str(user.id), "username": value, "had_one": bool(previous)},
    )
    return user


# ---------------------------------------------------------------------------
# Identity verification (DOMAIN §1a)
# ---------------------------------------------------------------------------
def get_or_create_identity(user: User) -> IdentityVerification:
    """This account's identity check, created empty on first access.

    Every account can be asked to verify — a player, an owner, both at once — so a
    missing row is never an error, only a check that has not been started.
    """
    verification, created = IdentityVerification.objects.get_or_create(user=user)
    if created:
        logger.info("Started identity verification", extra={"user": str(user.id)})
    return verification


def _record_identity_event(
    verification: IdentityVerification, *, from_status: str, actor=None, note: str = ""
) -> None:
    IdentityVerificationEvent.objects.create(
        verification=verification,
        from_status=from_status,
        to_status=verification.status,
        actor=actor,
        note=note,
    )


def _require_identity_status(verification: IdentityVerification, allowed: tuple[str, ...]) -> None:
    if verification.status not in allowed:
        raise ValidationError(
            {
                "status": (
                    f"An identity check that is “{verification.get_status_display()}” "
                    "cannot do that."
                )
            }
        )


@transaction.atomic
def save_identity_documents(*, user: User, data: dict[str, Any]) -> IdentityVerification:
    """Write what the person has filled in so far, without submitting it.

    Allowed while the check is a draft or has been rejected, and refused once it is
    submitted or approved: a document that a reviewer has looked at must not change
    underneath them, and an approved identity that could be edited is not a verified
    identity at all.

    Replacing a file deletes the old one from the private store rather than orphaning
    it. There is no reason to keep a superseded scan of somebody's passport.
    """
    verification = get_or_create_identity(user)
    _require_identity_status(verification, (IdentityStatus.DRAFT, IdentityStatus.REJECTED))

    fields: list[str] = []
    for name in ("document_type", "document_number"):
        if name in data:
            setattr(verification, name, (data[name] or "").strip())
            fields.append(name)

    for name in IDENTITY_FILE_FIELDS:
        if name not in data:
            continue
        incoming = data[name]
        existing = getattr(verification, name)
        if existing:
            existing.delete(save=False)
        # `""`, never `None`: these columns are NOT NULL (blank, not nullable), so a
        # client sending `document_back: null` to clear it would otherwise 500.
        setattr(verification, name, incoming or "")
        fields.append(name)

    if fields:
        verification.save(update_fields=[*fields, "updated_at"])
    return verification


@transaction.atomic
def submit_identity(*, user: User) -> IdentityVerification:
    """``draft|rejected -> submitted``.

    Completeness is checked here rather than in the serializer, so a half-filled check
    cannot reach the queue through the admin, a management command or a test either.
    Each message names the one thing that is missing: "incomplete" is no use to somebody
    looking at a form they believe they filled in.
    """
    verification = get_or_create_identity(user)
    previous = verification.status
    _require_identity_status(verification, (IdentityStatus.DRAFT, IdentityStatus.REJECTED))

    problems: dict[str, str] = {}
    if not user.has_uploaded_photo:
        problems["photo"] = "Add a photo of yourself before submitting."
    if not verification.document_type:
        problems["document_type"] = "Choose which document you are sending."
    if not verification.document_number:
        problems["document_number"] = "Enter the number printed on the document."
    if not verification.document_front:
        problems["document_front"] = "Upload a photo of the document."
    if problems:
        raise ValidationError(problems)

    verification.status = IdentityStatus.SUBMITTED
    verification.submitted_at = now()
    verification.review_note = ""
    verification.reviewed_by = None
    verification.reviewed_at = None
    verification.save(
        update_fields=[
            "status",
            "submitted_at",
            "review_note",
            "reviewed_by",
            "reviewed_at",
            "updated_at",
        ]
    )
    _record_identity_event(verification, from_status=previous)

    notify_many(
        users=User.objects.filter(is_platform_admin=True, is_active=True),
        kind=NotificationKind.IDENTITY_SUBMITTED,
        url="/admin/identity",
        data={"verification_id": str(verification.id)},
        person=player_label(user),
        document=verification.get_document_type_display(),
    )
    logger.info("Identity submitted", extra={"user": str(user.id)})
    return verification


@transaction.atomic
def approve_identity(
    *, verification: IdentityVerification, reviewer: User, note: str = ""
) -> IdentityVerification:
    """``submitted -> approved``. The badge appears, and turf approval unblocks."""
    previous = verification.status
    _require_identity_status(verification, (IdentityStatus.SUBMITTED,))

    verification.status = IdentityStatus.APPROVED
    verification.review_note = (note or "").strip()
    verification.reviewed_by = reviewer
    verification.reviewed_at = now()
    verification.save(
        update_fields=["status", "review_note", "reviewed_by", "reviewed_at", "updated_at"]
    )
    _record_identity_event(verification, from_status=previous, actor=reviewer, note=note)

    notify(
        user=verification.user,
        kind=NotificationKind.IDENTITY_APPROVED,
        url="/settings/identity",
        document=verification.get_document_type_display(),
    )
    logger.info(
        "Identity approved",
        extra={"user": str(verification.user_id), "reviewer": str(reviewer.id)},
    )
    return verification


@transaction.atomic
def reject_identity(
    *, verification: IdentityVerification, reviewer: User, reason: str
) -> IdentityVerification:
    """``submitted -> rejected``. A reason is required: the person reads it and acts on it."""
    previous = verification.status
    _require_identity_status(verification, (IdentityStatus.SUBMITTED,))

    reason = (reason or "").strip()
    if not reason:
        raise ValidationError({"reason": "Tell them what to fix — they see this."})

    verification.status = IdentityStatus.REJECTED
    verification.review_note = reason
    verification.reviewed_by = reviewer
    verification.reviewed_at = now()
    verification.save(
        update_fields=["status", "review_note", "reviewed_by", "reviewed_at", "updated_at"]
    )
    _record_identity_event(verification, from_status=previous, actor=reviewer, note=reason)

    notify(
        user=verification.user,
        kind=NotificationKind.IDENTITY_REJECTED,
        url="/settings/identity",
        reason=reason,
    )
    logger.info(
        "Identity rejected",
        extra={"user": str(verification.user_id), "reviewer": str(reviewer.id)},
    )
    return verification


@transaction.atomic
def revoke_identity(
    *, verification: IdentityVerification, reviewer: User, reason: str
) -> IdentityVerification:
    """``approved -> rejected``, for when something comes to light afterwards.

    Separate from :func:`reject_identity` because the from-state is different and the
    event row should say which of the two happened — "rejected" and "was verified and
    then was not" are not the same fact about an account.
    """
    previous = verification.status
    _require_identity_status(verification, (IdentityStatus.APPROVED,))

    reason = (reason or "").strip()
    if not reason:
        raise ValidationError({"reason": "Say why the verification is being withdrawn."})

    verification.status = IdentityStatus.REJECTED
    verification.review_note = reason
    verification.reviewed_by = reviewer
    verification.reviewed_at = now()
    verification.save(
        update_fields=["status", "review_note", "reviewed_by", "reviewed_at", "updated_at"]
    )
    _record_identity_event(verification, from_status=previous, actor=reviewer, note=reason)

    notify(
        user=verification.user,
        kind=NotificationKind.IDENTITY_REJECTED,
        url="/settings/identity",
        reason=reason,
    )
    logger.warning(
        "Identity verification revoked",
        extra={"user": str(verification.user_id), "reviewer": str(reviewer.id)},
    )
    return verification


def set_account_photo(*, user: User, photo) -> User:
    """Replace the account photograph, deleting whatever it replaced.

    Not a state transition and not part of the identity record — a photo is a photo, and
    somebody who changes theirs has not un-verified themselves. It is only *checked* at
    submission, as the thing a reviewer compares the document against.
    """
    if user.photo:
        user.photo.delete(save=False)
    user.photo = photo or ""  # NOT NULL; see save_identity_documents.
    user.save(update_fields=["photo", "updated_at"])
    return user


def is_identity_verified(user) -> bool:
    """Whether this account has a verified identity. Safe on a user with no row."""
    verification = getattr(user, "identity", None)
    return bool(verification and verification.is_verified)
