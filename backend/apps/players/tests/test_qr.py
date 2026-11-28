"""The counter QR code (tasks.md)."""

from __future__ import annotations

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.tests.factories import UserFactory
from apps.players.qr import counter_qr_svg, counter_url
from apps.players.services import get_or_create_profile

pytestmark = pytest.mark.django_db


class TestCounterUrl:
    @override_settings(OWNER_APP_BASE_URL="https://turf.champhub.com.bd")
    def test_it_points_at_the_owner_apps_counter(self):
        assert (
            counter_url("rafiq_hasan") == "https://turf.champhub.com.bd/counter?player=rafiq_hasan"
        )

    def test_it_carries_only_the_handle(self):
        """A QR held up in a room full of strangers must not be a credential."""
        url = counter_url("rafiq_hasan")
        assert "rafiq_hasan" in url
        assert "token" not in url and "code" not in url


class TestSvg:
    def test_it_is_an_inline_svg(self):
        svg = counter_qr_svg("rafiq_hasan")
        assert svg.startswith("<svg")
        assert "<?xml" not in svg

    def test_it_inherits_the_page_colour(self):
        """Black on the midnight base is a black square."""
        svg = counter_qr_svg("rafiq_hasan")
        assert "currentColor" in svg
        assert "#000" not in svg

    def test_a_longer_handle_still_encodes(self):
        assert counter_qr_svg("a" * 20).startswith("<svg")


class TestEndpoint:
    def test_a_player_gets_their_code(self):
        user = UserFactory(username="rafiq_hasan")
        get_or_create_profile(user)
        client = APIClient()
        client.force_authenticate(user)

        response = client.get("/api/v1/me/counter-code")
        assert response.status_code == 200
        assert response.data["handle"] == "@rafiq_hasan"
        assert response.data["svg"].startswith("<svg")
        assert "rafiq_hasan" in response.data["url"]

    def test_without_a_handle_it_says_so_rather_than_drawing_nothing(self):
        user = UserFactory(username=None)
        get_or_create_profile(user)
        client = APIClient()
        client.force_authenticate(user)

        response = client.get("/api/v1/me/counter-code")
        assert response.status_code == 409
        assert "username" in response.data["detail"]

    def test_a_signed_out_visitor_is_refused(self):
        assert APIClient().get("/api/v1/me/counter-code").status_code == 401
