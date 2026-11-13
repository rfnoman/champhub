"""Platform settings, and the two admins this project did not write.

`PlatformSetting` is the only place the business can move a rule without a deploy.

The re-registrations at the bottom are here rather than anywhere else because `admin`
modules are imported in `INSTALLED_APPS` order: `django.contrib.auth` and
`otp_totp` both come before `apps.core`, so by the time this file runs their admins exist
and can be swapped for themed ones (DECISIONS D96).
"""

from django.contrib import admin, messages
from django.contrib.auth.admin import GroupAdmin
from django.contrib.auth.models import Group
from django.core.cache import cache
from django_otp.plugins.otp_totp.admin import TOTPDeviceAdmin
from django_otp.plugins.otp_totp.models import TOTPDevice
from unfold.admin import ModelAdmin

from .models import PlatformSetting
from .utils import setting


@admin.register(PlatformSetting)
class PlatformSettingAdmin(ModelAdmin):
    list_display = ("key", "value", "code_default", "description", "updated_at")
    search_fields = ("key", "description")
    readonly_fields = ("code_default", "updated_by", "created_at", "updated_at")

    @admin.display(description="Default in code")
    def code_default(self, obj) -> str:
        """What the rule would be with this row deleted.

        Shown because the override direction is the whole design: deleting a row
        restores the code's value, and an admin about to change a number should be able
        to see what they are overriding.
        """
        from django.conf import settings as django_settings

        value = getattr(django_settings, obj.key, None)
        return "—" if value is None else str(value)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)

        # The cache is what makes this cheap to read; it is also what would make a change
        # take a minute to appear, which is confusing for somebody who just pressed save.
        cache.delete(f"platform-setting:{obj.key}")

        messages.info(request, f"{obj.key} is now {setting(obj.key)!r}, effective immediately.")

    def delete_model(self, request, obj):
        key = obj.key
        super().delete_model(request, obj)
        cache.delete(f"platform-setting:{key}")
        messages.info(request, f"{key} is back to its default in code.")


# ---------------------------------------------------------------------------
# Third-party admins, themed (DECISIONS D96)
# ---------------------------------------------------------------------------
# Unfold styles a page by being the page's `ModelAdmin`, so a model registered by a
# library it knows nothing about renders Django's own 2013 markup inside an Unfold
# layout — most visibly broken on the TOTP device form, which is a page an admin
# genuinely uses. Both are re-registered as subclasses rather than replacements: the
# behaviour (the QR-code link, the group's permission picker) is the library's and is
# worth keeping.
admin.site.unregister(TOTPDevice)
admin.site.unregister(Group)


@admin.register(TOTPDevice)
class ThemedTOTPDeviceAdmin(TOTPDeviceAdmin, ModelAdmin):
    """django-otp's device admin — where an admin registers their second factor (D64)."""


@admin.register(Group)
class ThemedGroupAdmin(GroupAdmin, ModelAdmin):
    """Django's permission groups.

    Close to unused: roles in this product are permissions on one account (DOMAIN §1),
    and the admin's own staff are superusers. Kept registered because the day somebody
    needs a read-only support login, a group is how it gets built.
    """
