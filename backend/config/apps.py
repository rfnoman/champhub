"""App configuration for Django's own apps, where this project changes one.

Only the admin so far. `AdminConfig.default_site` is Django's documented way of swapping
in a different `AdminSite`, and it is how `admin.site` becomes this project's — Unfold's
site with the TOTP gate on it (`apps.core.admin_site`, DECISIONS D96).

The alternative was the old wiring in `urls.py`: reassigning `admin.site.__class__` at
import. That worked for one mixin and would not survive a second, because Unfold's site
sets attributes on the *instance* in `__init__` — a class swapped in underneath it is
silently shadowed by whatever the old instance already decided. This way the site is the
right class from the first access.
"""

from django.contrib.admin.apps import AdminConfig


class ChampHubAdminConfig(AdminConfig):
    default_site = "apps.core.admin_site.ChampHubAdminSite"
