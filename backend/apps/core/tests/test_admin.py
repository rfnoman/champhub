"""The Django admin, after the move to django-unfold (DECISIONS D96).

Why this file exists. The conversion renamed the base class of 58 `ModelAdmin`s and 26
inlines and swapped the admin *site* for one of ours — a change that compiles perfectly
while leaving one changelist raising on a filter Unfold renders differently, and nothing
else in the suite opens an admin page. So every registered model's changelist and add
form is fetched here, which is the cheapest honest test of "the admin still works".

It also pins the two things that are easy to lose and expensive to lose quietly:

* **The TOTP gate** (D64). It used to be a class swap in `urls.py`; it is now a method on
  our site and a branch in the login form. Both directions are asserted — a password
  alone is enough with the gate off, and is not with it on.
* **The theme is actually in use.** A regression here would not be a 500, it would be the
  default Django admin with nobody noticing for a month.
"""

from __future__ import annotations

import re

import pytest
from django.contrib import admin
from django.core.cache import cache
from django.test import Client, RequestFactory
from django.urls import reverse
from unfold.admin import ModelAdmin as UnfoldModelAdmin
from unfold.sites import UnfoldAdminSite

from apps.accounts.models import User
from apps.core.admin_site import ChampHubAdminSite

pytestmark = pytest.mark.django_db

ADMIN_CLERK_ID = "user_admin_smoke"
ADMIN_PASSWORD = "pw-for-the-test"


@pytest.fixture(autouse=True)
def clear_setting_cache():
    """`ADMIN_REQUIRES_OTP` is read through `setting()`, which caches (D96)."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def admin_user_account():
    return User.objects.create_superuser(
        clerk_id=ADMIN_CLERK_ID, email="admin@champhub.test", password=ADMIN_PASSWORD
    )


@pytest.fixture
def admin_client(admin_user_account):
    """A superuser with a password, which is not how real accounts work here.

    Everybody signs in through Clerk and has an unusable password (`UserFactory`); the
    Django admin is the one door that still takes one, which is the whole reason D64
    bolts a second factor onto it.
    """
    client = Client()
    assert client.login(clerk_id=ADMIN_CLERK_ID, password=ADMIN_PASSWORD)
    return client


def registered_models():
    """Every model with an admin, as `(app_label, model_name, admin_class)`."""
    return [
        (model._meta.app_label, model._meta.model_name, type(model_admin))
        for model, model_admin in admin.site._registry.items()
    ]


def model_ids():
    return [f"{app}.{model}" for app, model, _ in registered_models()]


class TestTheme:
    def test_the_site_is_unfolds_with_our_gate_on_it(self):
        assert isinstance(admin.site, ChampHubAdminSite)
        assert isinstance(admin.site, UnfoldAdminSite)

    @pytest.mark.parametrize("entry", registered_models(), ids=model_ids())
    def test_every_admin_is_an_unfold_admin(self, entry):
        """Including the ones this project did not write (Group, TOTP devices)."""
        _, _, admin_class = entry
        assert issubclass(admin_class, UnfoldModelAdmin)

    def test_the_index_renders_the_themed_shell(self, admin_client):
        response = admin_client.get(reverse("admin:index"))
        assert response.status_code == 200
        body = response.content.decode()
        # Unfold's own markup, not Django's: its stylesheet and the sidebar it builds.
        assert "unfold" in body
        assert "ChampHub" in body

    def test_the_sidebar_offers_the_curated_groups(self, admin_client):
        body = admin_client.get(reverse("admin:index")).content.decode()
        for group in ("People", "Venues", "Play", "Money", "Store and stock", "Platform"):
            assert group in body, group

    def test_a_curated_link_points_at_a_real_changelist(self, admin_client):
        """`UNFOLD` names models as strings; a typo would be a 500 at reverse time."""
        assert admin_client.get(reverse("admin:core_platformsetting_changelist")).status_code == 200


class TestEveryPage:
    """Open everything. One parametrised test per registered model, both views."""

    @pytest.mark.parametrize("entry", registered_models(), ids=model_ids())
    def test_the_changelist_renders(self, admin_client, entry):
        app_label, model_name, _ = entry
        url = reverse(f"admin:{app_label}_{model_name}_changelist")
        assert admin_client.get(url).status_code == 200

    @pytest.mark.parametrize("entry", registered_models(), ids=model_ids())
    def test_the_add_form_renders(self, admin_client, admin_user_account, entry):
        """Where adding is allowed — a few of these are deliberately read-only."""
        app_label, model_name, _ = entry
        model, model_admin = next(
            (model, registered)
            for model, registered in admin.site._registry.items()
            if model._meta.app_label == app_label and model._meta.model_name == model_name
        )

        request = RequestFactory().get("/")
        request.user = admin_user_account
        if not model_admin.has_add_permission(request):
            pytest.skip(f"{model._meta.label} cannot be added by hand")

        url = reverse(f"admin:{app_label}_{model_name}_add")
        assert admin_client.get(url).status_code == 200


class TestTheSecondFactor:
    """D64, carried over from `OTPAdminSite` to our own site class."""

    def test_a_password_is_enough_when_the_gate_is_off(self, settings, admin_client):
        settings.ADMIN_REQUIRES_OTP = False
        assert admin_client.get(reverse("admin:index")).status_code == 200

    def test_a_password_alone_is_refused_when_the_gate_is_on(self, settings, admin_client):
        settings.ADMIN_REQUIRES_OTP = True
        response = admin_client.get(reverse("admin:index"))
        # Treated exactly as a non-staff user would be: bounced to the login page.
        assert response.status_code == 302
        assert "/admin/login" in response["Location"]

    def test_the_login_page_asks_for_a_code_only_when_the_gate_is_on(self, settings):
        client = Client()

        settings.ADMIN_REQUIRES_OTP = False
        assert "otp_token" not in client.get(reverse("admin:login")).content.decode()

        settings.ADMIN_REQUIRES_OTP = True
        body = client.get(reverse("admin:login")).content.decode()
        assert "otp_token" in body

    def test_logging_in_without_a_code_fails_when_the_gate_is_on(self, settings):
        settings.ADMIN_REQUIRES_OTP = True
        User.objects.create_superuser(
            clerk_id="user_admin_otp", email="otp@champhub.test", password="pw-for-the-test"
        )
        client = Client()
        response = client.post(
            reverse("admin:login"),
            {"username": "user_admin_otp", "password": "pw-for-the-test"},
        )
        # Rendered the form again rather than redirecting into the admin.
        assert response.status_code == 200
        assert not response.wsgi_request.user.is_authenticated

    def test_signing_in_lands_on_the_admin_index(self, settings, admin_user_account):
        """Found by hand during the conversion, and only by hand (DECISIONS D96).

        Unfold's login template carries no hidden `next`, so a sign-in that started at
        `/admin/login/` posted no destination and `LoginView` fell back to
        `LOGIN_REDIRECT_URL` — `/accounts/profile/`, which this project does not serve.
        Every automated check passed; the admin landed on a 404.
        """
        settings.ADMIN_REQUIRES_OTP = False
        client = Client()

        # Posted the way a browser does: the fields the rendered page actually carries.
        page = client.get(reverse("admin:login")).content.decode()
        hidden = re.search(r'name="next" value="([^"]*)"', page)
        assert hidden, (
            "the login page posts nowhere; a sign-in will fall back to LOGIN_REDIRECT_URL"
        )

        response = client.post(
            reverse("admin:login"),
            {"username": ADMIN_CLERK_ID, "password": ADMIN_PASSWORD, "next": hidden.group(1)},
        )
        assert response.status_code == 302
        assert response["Location"] == reverse("admin:index")

    def test_the_login_form_is_the_one_unfold_was_told_to_use(self):
        from apps.core.admin_forms import AdminLoginForm

        assert admin.site.login_form is AdminLoginForm
