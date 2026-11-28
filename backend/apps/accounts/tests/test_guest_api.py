"""The guest's own view, and the claim queue (tasks.md)."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.guests import request_claim
from apps.accounts.models import AccountClaim
from apps.accounts.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def client():
    return APIClient()


class TestGuestBookings:
    """Phone **and** code, because a number identifies but proves nothing."""

    def test_a_guest_reads_their_own_bookings(self, client, guest_with_booking):
        guest, booking = guest_with_booking
        response = client.post(
            "/api/v1/guest/bookings",
            {"phone": "01711234567", "code": guest.access_code},
            format="json",
        )

        assert response.status_code == 200, response.data
        assert response.data["guest"]["name"] == "Rafi"
        assert len(response.data["bookings"]) == 1
        row = response.data["bookings"][0]
        assert row["id"] == str(booking.id)
        assert row["turf_name"]
        # Enough to turn up at the right place: where it is, and how to get there.
        assert row["directions_url"].startswith("https://www.google.com/maps/dir/")

    def test_the_number_may_be_written_any_way(self, client, guest_with_booking):
        guest, _ = guest_with_booking
        response = client.post(
            "/api/v1/guest/bookings",
            {"phone": "+880 1711-234567", "code": guest.access_code},
            format="json",
        )
        assert response.status_code == 200

    def test_the_code_is_not_case_sensitive(self, client, guest_with_booking):
        guest, _ = guest_with_booking
        response = client.post(
            "/api/v1/guest/bookings",
            {"phone": "01711234567", "code": guest.access_code.lower()},
            format="json",
        )
        assert response.status_code == 200

    def test_the_wrong_code_is_refused(self, client, guest_with_booking):
        response = client.post(
            "/api/v1/guest/bookings",
            {"phone": "01711234567", "code": "WRONGX"},
            format="json",
        )
        assert response.status_code == 404

    def test_a_wrong_number_and_a_wrong_code_answer_the_same(self, client, guest_with_booking):
        """Otherwise the response says which numbers exist."""
        guest, _ = guest_with_booking
        wrong_number = client.post(
            "/api/v1/guest/bookings",
            {"phone": "01799999999", "code": guest.access_code},
            format="json",
        )
        wrong_code = client.post(
            "/api/v1/guest/bookings",
            {"phone": "01711234567", "code": "WRONGX"},
            format="json",
        )
        assert wrong_number.status_code == wrong_code.status_code == 404
        assert wrong_number.data == wrong_code.data

    def test_the_full_number_is_never_returned(self, client, guest_with_booking):
        guest, _ = guest_with_booking
        response = client.post(
            "/api/v1/guest/bookings",
            {"phone": "01711234567", "code": guest.access_code},
            format="json",
        )
        assert "1711" not in response.data["guest"]["phone_hint"]
        assert response.data["guest"]["phone_hint"].endswith("4567")


class TestMyClaim:
    def test_an_account_whose_number_matches_is_offered_the_history(
        self, client, guest_with_booking
    ):
        guest, _ = guest_with_booking
        user = UserFactory(phone="01711234567")
        client.force_authenticate(user)

        response = client.get("/api/v1/me/account-claim")
        assert response.status_code == 200
        assert response.data["claimable"]["guest_id"] == str(guest.id)
        assert response.data["claimable"]["booking_count"] == 1

    def test_the_offer_never_names_the_guest(self, client, guest_with_booking):
        """ "Is this number yours?" must not be a directory lookup."""
        client.force_authenticate(UserFactory(phone="01711234567"))
        response = client.get("/api/v1/me/account-claim")
        assert "name" not in response.data["claimable"]
        assert "Rafi" not in str(response.data["claimable"])

    def test_an_account_with_another_number_is_offered_nothing(self, client, guest_with_booking):
        client.force_authenticate(UserFactory(phone="01799999999"))
        response = client.get("/api/v1/me/account-claim")
        assert response.data["claimable"] is None

    def test_asking_creates_a_pending_claim(self, client, guest_with_booking):
        guest, _ = guest_with_booking
        client.force_authenticate(UserFactory(phone="01711234567"))

        response = client.post(
            "/api/v1/me/account-claim",
            {"guest_id": str(guest.id), "message": "I play there every Friday."},
            format="json",
        )
        assert response.status_code == 201, response.data
        assert response.data["status"] == "pending"
        assert AccountClaim.objects.count() == 1

    def test_claiming_a_guest_that_was_not_offered_is_refused(self, client, guest_with_booking):
        """Otherwise this is "claim anybody's history and hope a reviewer says yes"."""
        guest, _ = guest_with_booking
        client.force_authenticate(UserFactory(phone="01799999999"))

        response = client.post(
            "/api/v1/me/account-claim", {"guest_id": str(guest.id)}, format="json"
        )
        assert response.status_code == 400
        assert AccountClaim.objects.count() == 0

    def test_a_signed_out_visitor_cannot_ask(self, client, guest_with_booking):
        guest, _ = guest_with_booking
        response = client.post(
            "/api/v1/me/account-claim", {"guest_id": str(guest.id)}, format="json"
        )
        assert response.status_code == 401


class TestAdminQueue:
    def test_the_queue_lists_pending_claims_with_the_full_number(self, client, guest_with_booking):
        """The reviewer is the one person who needs it in full (DOMAIN §1a)."""
        guest, _ = guest_with_booking
        request_claim(user=UserFactory(phone="01711234567"), guest=guest)
        client.force_authenticate(UserFactory(is_platform_admin=True))

        response = client.get("/api/v1/admin/account-claims")
        assert response.status_code == 200
        assert len(response.data) == 1
        row = response.data[0]
        assert row["guest_phone"] == "+8801711234567"
        assert row["guest_name"] == "Rafi"
        # Where they played is the first thing worth checking.
        assert len(row["turfs"]) == 1

    def test_the_two_numbers_are_compared_as_numbers_not_as_strings(
        self, client, guest_with_booking
    ):
        """Clerk keeps what was typed; the guest row is normalised. Same number."""
        guest, _ = guest_with_booking
        request_claim(user=UserFactory(phone="01711-234567"), guest=guest)
        client.force_authenticate(UserFactory(is_platform_admin=True))

        row = client.get("/api/v1/admin/account-claims").data[0]
        assert row["claimant_phone"] == "01711-234567"
        assert row["guest_phone"] == "+8801711234567"
        assert row["numbers_match"] is True

    def test_a_different_number_does_not_claim_to_match(self, client, guest_with_booking):
        guest, _ = guest_with_booking
        user = UserFactory(phone="01711234567")
        claim = request_claim(user=user, guest=guest)
        # They asked with a matching number, then changed it on the account.
        user.phone = "01799999999"
        user.save()
        client.force_authenticate(UserFactory(is_platform_admin=True))

        row = client.get("/api/v1/admin/account-claims").data[0]
        assert row["numbers_match"] is False
        assert str(claim.id) == row["id"]

    def test_an_account_with_no_number_does_not_match(self, client, guest_with_booking):
        guest, _ = guest_with_booking
        user = UserFactory(phone="01711234567")
        request_claim(user=user, guest=guest)
        user.phone = ""
        user.save()
        client.force_authenticate(UserFactory(is_platform_admin=True))

        assert client.get("/api/v1/admin/account-claims").data[0]["numbers_match"] is False

    def test_an_ordinary_player_cannot_see_the_queue(self, client):
        client.force_authenticate(UserFactory())
        assert client.get("/api/v1/admin/account-claims").status_code == 403

    def test_approving_moves_the_bookings(self, client, guest_with_booking):
        guest, booking = guest_with_booking
        user = UserFactory(phone="01711234567")
        claim = request_claim(user=user, guest=guest)
        client.force_authenticate(UserFactory(is_platform_admin=True))

        response = client.post(
            f"/api/v1/admin/account-claims/{claim.id}/approve", {}, format="json"
        )
        assert response.status_code == 200, response.data
        assert response.data["status"] == "approved"
        assert response.data["bookings_moved"] == 1

        booking.refresh_from_db()
        assert booking.booked_by_id == user.id

    def test_the_player_sees_the_booking_in_their_own_list_afterwards(
        self, client, guest_with_booking
    ):
        """This is what claiming is for."""
        guest, booking = guest_with_booking
        user = UserFactory(phone="01711234567")
        claim = request_claim(user=user, guest=guest)

        client.force_authenticate(UserFactory(is_platform_admin=True))
        client.post(f"/api/v1/admin/account-claims/{claim.id}/approve", {}, format="json")

        client.force_authenticate(user)
        upcoming = client.get("/api/v1/me/bookings").data
        past = client.get("/api/v1/me/bookings", {"filter": "past"}).data
        assert str(booking.id) in [row["id"] for row in list(upcoming) + list(past)]

    def test_rejecting_needs_a_reason(self, client, guest_with_booking):
        guest, _ = guest_with_booking
        claim = request_claim(user=UserFactory(phone="01711234567"), guest=guest)
        client.force_authenticate(UserFactory(is_platform_admin=True))

        response = client.post(f"/api/v1/admin/account-claims/{claim.id}/reject", {}, format="json")
        assert response.status_code == 400

    def test_rejecting_tells_the_person_why(self, client, guest_with_booking):
        guest, _ = guest_with_booking
        user = UserFactory(phone="01711234567")
        claim = request_claim(user=user, guest=guest)
        client.force_authenticate(UserFactory(is_platform_admin=True))

        client.post(
            f"/api/v1/admin/account-claims/{claim.id}/reject",
            {"reason": "Staff did not recognise you."},
            format="json",
        )

        client.force_authenticate(user)
        mine = client.get("/api/v1/me/account-claim")
        assert mine.data["claims"][0]["decision_reason"] == "Staff did not recognise you."

    def test_an_admin_cannot_approve_a_claim_twice(self, client, guest_with_booking):
        guest, _ = guest_with_booking
        claim = request_claim(user=UserFactory(phone="01711234567"), guest=guest)
        client.force_authenticate(UserFactory(is_platform_admin=True))

        first = client.post(f"/api/v1/admin/account-claims/{claim.id}/approve", {}, format="json")
        second = client.post(f"/api/v1/admin/account-claims/{claim.id}/approve", {}, format="json")
        assert (first.status_code, second.status_code) == (200, 400)
