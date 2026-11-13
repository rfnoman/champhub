"""The user account.

Authentication lives in Clerk; Django holds a mirror of the account keyed by
``clerk_id`` (Clerk's ``user_...`` id, the ``sub`` claim of a session token). Roles are
permissions on one account, never separate user types (DOMAIN §1): ``is_platform_admin``
here, turf owner/staff via ``TurfMembership`` (Phase 02), rider via an assignment
(Phase 08).
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core.models import BaseModel
from apps.core.storage import identity_upload_path, private_storage
from apps.core.validators import validate_image_upload

from .usernames import MAX_LENGTH as USERNAME_MAX_LENGTH
from .usernames import validate_username


class UserManager(BaseUserManager):
    """Users are normally created by Clerk sync, not by hand."""

    use_in_migrations = True

    def create_user(self, clerk_id: str, email: str = "", password: str | None = None, **extra):
        if not clerk_id:
            raise ValueError("clerk_id is required")
        user = self.model(clerk_id=clerk_id, email=self.normalize_email(email), **extra)
        # Clerk owns credentials; an unusable password is the norm here.
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(
        self, clerk_id: str, email: str = "", password: str | None = None, **extra
    ):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("is_platform_admin", True)
        if not extra["is_staff"] or not extra["is_superuser"]:
            raise ValueError("Superuser must have is_staff and is_superuser set.")
        return self.create_user(clerk_id, email, password, **extra)


class User(BaseModel, AbstractBaseUser, PermissionsMixin):
    clerk_id = models.CharField(
        _("Clerk user id"),
        max_length=255,
        unique=True,
        db_index=True,
        help_text="Clerk's user id; the `sub` claim of a session token.",
    )
    username = models.CharField(
        _("username"),
        max_length=USERNAME_MAX_LENGTH,
        unique=True,
        null=True,
        blank=True,
        validators=[validate_username],
        help_text=(
            "The @handle other people invite by (DOMAIN §1b). Lowercase, unique, and "
            "NULL until it is chosen — blank would collide under the unique index."
        ),
    )
    email = models.EmailField(_("email address"), blank=True, db_index=True)
    phone = models.CharField(
        _("phone number"),
        max_length=32,
        blank=True,
        help_text="E.164, e.g. +8801XXXXXXXXX. Unverified in v1 (DECISIONS D9).",
    )
    first_name = models.CharField(_("first name"), max_length=150, blank=True)
    last_name = models.CharField(_("last name"), max_length=150, blank=True)
    image_url = models.URLField(_("avatar URL"), max_length=500, blank=True)
    photo = models.ImageField(
        _("photo"),
        upload_to="accounts/photos/",
        blank=True,
        validators=[validate_image_upload],
        help_text=(
            "The account holder's own photograph. Beats the Clerk avatar everywhere, "
            "and is what a reviewer compares against the identity document."
        ),
    )

    is_platform_admin = models.BooleanField(
        _("platform admin"),
        default=False,
        help_text="Approves turfs and sports, handles disputes and conduct reports.",
    )
    is_active = models.BooleanField(
        _("active"),
        default=True,
        help_text="Set to False instead of deleting (Clerk `user.deleted` soft-deactivates).",
    )
    is_staff = models.BooleanField(
        _("django admin access"),
        default=False,
        help_text="Access to the Django admin site. Unrelated to turf staff.",
    )
    last_synced_at = models.DateTimeField(
        _("last synced from Clerk"), null=True, blank=True, editable=False
    )

    objects = UserManager()

    USERNAME_FIELD = "clerk_id"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.full_name or self.email or self.clerk_id

    @property
    def handle(self) -> str:
        """``@rafiq``, or empty for an account that has not chosen one yet.

        The ``@`` is presentation, so it lives here rather than in the column: a stored
        ``@`` would have to be stripped again by every lookup, and the first person to
        search for their own handle would type it both ways.
        """
        return f"@{self.username}" if self.username else ""

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def get_full_name(self) -> str:
        return self.full_name

    def get_short_name(self) -> str:
        return self.first_name or self.full_name or self.email

    @property
    def photo_url(self) -> str:
        """The best photograph of this person, from the account's point of view.

        Uploaded account photo, then a player's profile photo (which predates this field
        and is still the one a player edits on their profile), then whatever Clerk has —
        usually initials or a Gravatar, which is why it ranks last.
        """
        if self.photo:
            return self.photo.url
        profile = getattr(self, "player_profile", None)
        if profile is not None and profile.photo:
            return profile.photo.url
        return self.image_url

    @property
    def has_uploaded_photo(self) -> bool:
        """Whether this person has given us a photograph of *themselves*.

        Deliberately not satisfied by `image_url`: a Clerk avatar is frequently a set of
        initials on a coloured circle, and an identity check that accepted that would be
        a checkbox rather than a check.
        """
        profile = getattr(self, "player_profile", None)
        return bool(self.photo) or bool(profile is not None and profile.photo)


class IdentityDocumentType(models.TextChoices):
    """What a person may prove who they are with (DOMAIN §1a).

    Four documents, any one of them enough. Bangladesh issues the NID at 18, so a
    younger player legitimately has only a birth certificate; a driving licence and a
    passport are the two most people already carry a photograph of.
    """

    NID = "nid", _("National ID (NID)")
    DRIVING_LICENCE = "driving_licence", _("Driving licence")
    BIRTH_CERTIFICATE = "birth_certificate", _("Birth certificate")
    PASSPORT = "passport", _("Passport")


class IdentityStatus(models.TextChoices):
    DRAFT = "draft", _("Not submitted")
    SUBMITTED = "submitted", _("Awaiting review")
    APPROVED = "approved", _("Verified")
    REJECTED = "rejected", _("Rejected")


class IdentityVerification(BaseModel):
    """One account, one identity check — whichever roles that account holds.

    Roles are permissions on one account (DOMAIN §1), so this hangs off ``User`` rather
    than off ``PlayerProfile`` or ``TurfMembership``. A turf owner who also plays is one
    person with one NID, and asking them twice would be both rude and useless.

    **State machine** (CLAUDE.md: one service function per transition, each writing an
    ``IdentityVerificationEvent``)::

        draft → submitted → approved
                         ↘ rejected → submitted   (fix it and send it back)
                            approved → rejected   (revoked, if something comes to light)

    The files are the sensitive part. ``document_front``/``document_back`` live in the
    private store and are never served by URL — ``.url`` raises there on purpose. The
    photograph is on ``User`` instead, because it is a profile picture that happens to
    also be what a reviewer compares the document against.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="identity"
    )
    document_type = models.CharField(
        _("document"), max_length=20, choices=IdentityDocumentType.choices, blank=True
    )
    document_number = models.CharField(
        _("document number"),
        max_length=60,
        blank=True,
        help_text="Shown whole to reviewers only; masked everywhere else.",
    )
    document_front = models.ImageField(
        _("document (front)"),
        upload_to=identity_upload_path,
        storage=private_storage,
        blank=True,
        validators=[validate_image_upload],
    )
    document_back = models.ImageField(
        _("document (back)"),
        upload_to=identity_upload_path,
        storage=private_storage,
        blank=True,
        validators=[validate_image_upload],
        help_text="Optional. An NID and a driving licence carry the address on the back.",
    )
    status = models.CharField(
        _("status"),
        max_length=10,
        choices=IdentityStatus.choices,
        default=IdentityStatus.DRAFT,
        db_index=True,
    )
    submitted_at = models.DateTimeField(_("submitted at"), null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="identity_reviews",
    )
    reviewed_at = models.DateTimeField(_("reviewed at"), null=True, blank=True)
    review_note = models.TextField(
        _("reviewer's note"),
        blank=True,
        help_text="Why it was rejected. The person reads this, so it has to be actionable.",
    )

    class Meta:
        verbose_name = _("identity verification")
        verbose_name_plural = _("identity verifications")
        ordering = ["-submitted_at", "-created_at"]
        indexes = [
            # The review queue: submitted first, oldest first.
            models.Index(fields=["status", "submitted_at"], name="identity_queue_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.get_status_display()}"

    @property
    def is_verified(self) -> bool:
        return self.status == IdentityStatus.APPROVED

    @property
    def is_editable(self) -> bool:
        """Draft and rejected can be worked on; submitted and approved are frozen."""
        return self.status in (IdentityStatus.DRAFT, IdentityStatus.REJECTED)

    @property
    def masked_document_number(self) -> str:
        """``•••• 4821``. What anyone who is not reviewing this gets to see.

        Including the person themselves: it is enough to recognise which document they
        uploaded, and a number that is never rendered in full is a number that cannot be
        read over somebody's shoulder.
        """
        from apps.core.utils import setting

        number = (self.document_number or "").strip()
        if not number:
            return ""
        visible = int(setting("IDENTITY_NUMBER_VISIBLE_CHARS", 4))
        tail = number[-visible:] if visible else ""
        return f"•••• {tail}".strip()

    def file_field(self, name: str):
        """One of the two document files, by the name the API uses, or ``None``."""
        if name not in IDENTITY_FILE_FIELDS:
            return None
        return getattr(self, name) or None


class IdentityVerificationEvent(BaseModel):
    """Who moved an identity check where, and why.

    Every transition writes one (CLAUDE.md). For this model in particular it is also the
    answer to "who looked at this person's passport, and when" — a question that only
    has an answer if it was written down at the time.
    """

    verification = models.ForeignKey(
        IdentityVerification, on_delete=models.CASCADE, related_name="events"
    )
    from_status = models.CharField(_("from"), max_length=10, choices=IdentityStatus.choices)
    to_status = models.CharField(_("to"), max_length=10, choices=IdentityStatus.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="identity_events",
    )
    note = models.TextField(_("note"), blank=True)

    class Meta:
        verbose_name = _("identity verification event")
        verbose_name_plural = _("identity verification events")
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.verification_id}: {self.from_status} → {self.to_status}"


#: The two document files, by the name the API addresses them with.
IDENTITY_FILE_FIELDS = ("document_front", "document_back")

#: Importable aliases for ENUM_NAME_OVERRIDES (see apps/turfs/models.py).
IDENTITY_DOCUMENT_TYPE_CHOICES = IdentityDocumentType.choices
IDENTITY_STATUS_CHOICES = IdentityStatus.choices
