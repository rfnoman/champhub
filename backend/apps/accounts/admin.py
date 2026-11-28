from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils.translation import gettext_lazy as _
from unfold.admin import ModelAdmin, TabularInline
from unfold.forms import AdminPasswordChangeForm, UserChangeForm, UserCreationForm

from .models import (
    IDENTITY_FILE_FIELDS,
    AccountClaim,
    GuestProfile,
    IdentityVerification,
    IdentityVerificationEvent,
    User,
)


@admin.register(User)
class UserAdmin(DjangoUserAdmin, ModelAdmin):
    """Support-oriented admin. Accounts are created by Clerk, so editing is limited.

    Both bases, in that order: Django's `UserAdmin` for the password handling and the
    permissions fieldsets, Unfold's `ModelAdmin` for the theme. The three form overrides
    below are Unfold's styling of the auth forms, which otherwise render their password
    widgets with Django's own markup inside an Unfold page (DECISIONS D96).
    """

    form = UserChangeForm
    add_form = UserCreationForm
    change_password_form = AdminPasswordChangeForm

    list_display = (
        "clerk_id",
        "username",
        "email",
        "full_name",
        "is_platform_admin",
        "is_active",
        "created_at",
    )
    list_filter = ("is_platform_admin", "is_active", "is_staff", "is_superuser")
    search_fields = ("clerk_id", "username", "email", "phone", "first_name", "last_name")
    ordering = ("-created_at",)
    readonly_fields = ("id", "clerk_id", "created_at", "updated_at", "last_synced_at", "last_login")

    fieldsets = (
        (None, {"fields": ("id", "clerk_id", "username", "password")}),
        (
            _("Personal info"),
            {"fields": ("first_name", "last_name", "email", "phone", "image_url", "photo")},
        ),
        (
            _("Permissions"),
            {
                "fields": (
                    "is_active",
                    "is_platform_admin",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        (_("Dates"), {"fields": ("last_login", "last_synced_at", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("clerk_id", "email", "password1", "password2"),
            },
        ),
    )


class IdentityVerificationEventInline(TabularInline):
    model = IdentityVerificationEvent
    extra = 0
    can_delete = False
    readonly_fields = ("created_at", "from_status", "to_status", "actor", "note")
    ordering = ("created_at",)

    def has_add_permission(self, request, obj=None) -> bool:
        # Events are written by the services, never by hand.
        return False


@admin.register(IdentityVerification)
class IdentityVerificationAdmin(ModelAdmin):
    """Support view of an identity check — deliberately without the documents.

    The scans are **not** rendered here, and that is not an oversight twice over. The
    private store has no base URL, so Django's readonly `FileField` widget would raise
    trying to link to one; and reviewing is meant to happen in the platform admin UI,
    where every read of a document is logged against the admin who made it. A quiet
    second door into the same files would make that log a half-truth.
    """

    list_display = ("user", "document_type", "status", "submitted_at", "reviewed_by")
    list_filter = ("status", "document_type")
    search_fields = ("user__email", "user__first_name", "user__last_name", "document_number")
    ordering = ("-submitted_at",)
    inlines = [IdentityVerificationEventInline]
    readonly_fields = (
        "id",
        "user",
        "documents_on_file",
        "submitted_at",
        "reviewed_by",
        "reviewed_at",
        "created_at",
        "updated_at",
    )
    fields = (
        "id",
        "user",
        "status",
        "document_type",
        "document_number",
        "documents_on_file",
        "review_note",
        "submitted_at",
        "reviewed_by",
        "reviewed_at",
        "created_at",
        "updated_at",
    )

    @admin.display(description=_("documents on file"))
    def documents_on_file(self, obj) -> str:
        names = [field for field in IDENTITY_FILE_FIELDS if getattr(obj, field)]
        return ", ".join(names) if names else _("none")


@admin.register(GuestProfile)
class GuestProfileAdmin(ModelAdmin):
    """Somebody who booked at a counter without an account (tasks.md)."""

    list_display = ("name", "masked_phone", "booking_count", "claimed_by", "created_at")
    list_filter = ("claimed_by",)
    search_fields = ("name", "phone")
    raw_id_fields = ("created_by", "claimed_by")
    readonly_fields = ("access_code", "claimed_at", "created_at", "updated_at")

    @admin.display(description=_("phone"))
    def masked_phone(self, obj) -> str:
        from .phones import mask_phone

        return mask_phone(obj.phone)

    @admin.display(description=_("bookings"))
    def booking_count(self, obj) -> int:
        return obj.bookings.count()


@admin.register(AccountClaim)
class AccountClaimAdmin(ModelAdmin):
    """The review queue, mirrored in the platform admin UI.

    Read-only on the decision fields: approving has to go through
    `apps.accounts.guests.approve_claim`, which moves the bookings and the rosters with
    it. Flipping `status` here would mark a claim approved and move nothing.
    """

    list_display = ("user", "guest", "status", "bookings_moved", "created_at", "reviewed_by")
    list_filter = ("status",)
    search_fields = ("user__email", "guest__phone", "guest__name")
    raw_id_fields = ("user", "guest", "reviewed_by")
    readonly_fields = ("status", "bookings_moved", "reviewed_by", "reviewed_at")

    def has_add_permission(self, request) -> bool:
        return False
