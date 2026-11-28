"""Guests, and an account claiming one's history (tasks.md)."""

from __future__ import annotations

import pytest
from django.core.exceptions import ValidationError

from apps.accounts.guests import (
    approve_claim,
    claimable_for,
    get_or_create_guest,
    guest_for_phone,
    reject_claim,
    request_claim,
    withdraw_claim,
)
from apps.accounts.models import AccountClaim, GuestProfile
from apps.accounts.phones import mask_phone, normalise_phone, validate_phone
from apps.accounts.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


class TestPhoneNormalisation:
    """One spelling, or a regular becomes three guests and claims nothing."""

    @pytest.mark.parametrize(
        "raw",
        [
            "01711234567",
            "+8801711234567",
            "8801711234567",
            "01711-234567",
            "  01711 234 567 ",
            "+880 1711 234567",
        ],
    )
    def test_every_way_a_bangladeshi_mobile_is_written(self, raw):
        assert normalise_phone(raw) == "+8801711234567"

    @pytest.mark.parametrize("raw", ["", "   ", None, "abc"])
    def test_nothing_in_nothing_out(self, raw):
        assert normalise_phone(raw) == ""

    def test_every_operator_prefix(self):
        for prefix in "3456789":
            assert normalise_phone(f"01{prefix}11234567") == f"+8801{prefix}11234567"

    def test_a_foreign_number_is_kept_rather_than_refused(self):
        """Storing an odd number beats refusing a real customer."""
        assert normalise_phone("+442079460958") == "+442079460958"

    def test_validate_explains_itself(self):
        with pytest.raises(ValidationError):
            validate_phone("")
        with pytest.raises(ValidationError):
            validate_phone("12345")

    def test_masking_shows_the_last_four(self):
        assert mask_phone("+8801711234567") == "•••••••••4567"
        assert mask_phone("") == "••••"


class TestGuests:
    def test_the_same_number_written_differently_is_one_guest(self):
        first = get_or_create_guest(phone="01711234567", name="Rafi")
        second = get_or_create_guest(phone="+880 1711-234567", name="Rafi")
        assert first.id == second.id
        assert GuestProfile.objects.count() == 1

    def test_a_later_fuller_name_wins(self):
        get_or_create_guest(phone="01711234567", name="Rafi")
        guest = get_or_create_guest(phone="01711234567", name="Rafiqul Hasan")
        assert guest.name == "Rafiqul Hasan"

    def test_a_claimed_guests_name_is_left_alone(self):
        """It belongs to an account now."""
        guest = get_or_create_guest(phone="01711234567", name="Rafi")
        guest.claimed_by = UserFactory()
        guest.save()
        again = get_or_create_guest(phone="01711234567", name="Somebody Else")
        again.refresh_from_db()
        assert again.name == "Rafi"

    def test_an_access_code_is_generated_and_is_unambiguous(self):
        guest = get_or_create_guest(phone="01711234567", name="Rafi")
        assert len(guest.access_code) == 6
        # Nothing a tired person could misread at a counter.
        assert not set(guest.access_code) & set("01OIL")

    def test_two_guests_do_not_share_a_code(self):
        codes = {
            get_or_create_guest(phone=f"0171123456{n}", name="X").access_code for n in range(8)
        }
        assert len(codes) > 1

    def test_a_number_with_no_guest_finds_nothing(self):
        assert guest_for_phone("01711234567") is None

    def test_a_claimed_guest_is_no_longer_offered(self):
        guest = get_or_create_guest(phone="01711234567", name="Rafi")
        guest.claimed_by = UserFactory()
        guest.save()
        assert guest_for_phone("01711234567") is None


class TestClaimable:
    def test_an_account_with_no_phone_is_offered_nothing(self):
        assert claimable_for(UserFactory(phone="")) is None

    def test_a_guest_with_no_bookings_is_not_worth_claiming(self):
        get_or_create_guest(phone="01711234567", name="Rafi")
        assert claimable_for(UserFactory(phone="01711234567")) is None

    def test_a_matching_number_with_bookings_is_offered(self, guest_with_booking):
        guest, _ = guest_with_booking
        user = UserFactory(phone="01711234567")
        assert claimable_for(user) == guest


class TestClaiming:
    def test_requesting_twice_returns_the_same_claim(self, guest_with_booking):
        guest, _ = guest_with_booking
        user = UserFactory(phone="01711234567")
        first = request_claim(user=user, guest=guest)
        second = request_claim(user=user, guest=guest)
        assert first.id == second.id
        assert AccountClaim.objects.count() == 1

    def test_an_already_claimed_guest_is_refused(self, guest_with_booking):
        guest, _ = guest_with_booking
        guest.claimed_by = UserFactory()
        guest.save()
        with pytest.raises(ValidationError):
            request_claim(user=UserFactory(phone="01711234567"), guest=guest)

    def test_approving_moves_the_bookings_to_the_account(self, guest_with_booking):
        guest, booking = guest_with_booking
        user = UserFactory(phone="01711234567")
        claim = request_claim(user=user, guest=guest)

        approve_claim(claim=claim, actor=UserFactory(is_platform_admin=True))

        booking.refresh_from_db()
        assert booking.booked_by_id == user.id
        assert booking.guest_id is None
        # The walk-in fields are cleared: the booking has an account behind it now.
        assert booking.booked_for_name == ""
        assert booking.booked_for_phone == ""

    def test_approving_puts_the_player_on_the_match_roster(self, guest_with_booking):
        """The point of claiming is for the history to count."""
        guest, booking = guest_with_booking
        user = UserFactory(phone="01711234567")
        claim = request_claim(user=user, guest=guest)

        approve_claim(claim=claim, actor=UserFactory(is_platform_admin=True))

        assert booking.match.players.filter(player=user).exists()

    def test_approving_records_who_decided_and_how_many_moved(self, guest_with_booking):
        guest, _ = guest_with_booking
        user = UserFactory(phone="01711234567")
        admin = UserFactory(is_platform_admin=True)
        claim = approve_claim(claim=request_claim(user=user, guest=guest), actor=admin)

        assert claim.status == AccountClaim.Status.APPROVED
        assert claim.reviewed_by_id == admin.id
        assert claim.bookings_moved == 1

    def test_approving_marks_the_guest_claimed(self, guest_with_booking):
        guest, _ = guest_with_booking
        user = UserFactory(phone="01711234567")
        approve_claim(
            claim=request_claim(user=user, guest=guest),
            actor=UserFactory(is_platform_admin=True),
        )
        guest.refresh_from_db()
        assert guest.claimed_by_id == user.id
        assert guest.claimed_at is not None

    def test_the_number_lands_on_an_account_that_had_none(self, guest_with_booking):
        guest, _ = guest_with_booking
        user = UserFactory(phone="01711234567")
        user.phone = ""
        user.save()
        approve_claim(
            claim=request_claim(user=user, guest=guest),
            actor=UserFactory(is_platform_admin=True),
        )
        user.refresh_from_db()
        assert user.phone == "+8801711234567"

    def test_a_second_claim_on_the_same_guest_is_withdrawn(self, guest_with_booking):
        """Once the history has moved there is nothing left for a second claimant."""
        guest, _ = guest_with_booking
        first = request_claim(user=UserFactory(phone="01711234567"), guest=guest)
        second = request_claim(user=UserFactory(phone="01711234567"), guest=guest)

        approve_claim(claim=first, actor=UserFactory(is_platform_admin=True))

        second.refresh_from_db()
        assert second.status == AccountClaim.Status.WITHDRAWN

    def test_approving_twice_is_refused(self, guest_with_booking):
        guest, _ = guest_with_booking
        admin = UserFactory(is_platform_admin=True)
        claim = request_claim(user=UserFactory(phone="01711234567"), guest=guest)
        approve_claim(claim=claim, actor=admin)
        with pytest.raises(ValidationError):
            approve_claim(claim=claim, actor=admin)

    def test_rejecting_needs_a_reason(self, guest_with_booking):
        guest, _ = guest_with_booking
        claim = request_claim(user=UserFactory(phone="01711234567"), guest=guest)
        with pytest.raises(ValidationError):
            reject_claim(claim=claim, actor=UserFactory(is_platform_admin=True), reason="  ")

    def test_rejecting_leaves_the_bookings_alone(self, guest_with_booking):
        guest, booking = guest_with_booking
        claim = request_claim(user=UserFactory(phone="01711234567"), guest=guest)
        reject_claim(
            claim=claim,
            actor=UserFactory(is_platform_admin=True),
            reason="Staff did not recognise you.",
        )
        booking.refresh_from_db()
        assert booking.guest_id == guest.id
        guest.refresh_from_db()
        assert not guest.is_claimed

    def test_a_rejected_claim_can_be_made_again(self, guest_with_booking):
        """The usual fix is going to the turf and having staff vouch for you."""
        guest, _ = guest_with_booking
        user = UserFactory(phone="01711234567")
        reject_claim(
            claim=request_claim(user=user, guest=guest),
            actor=UserFactory(is_platform_admin=True),
            reason="No.",
        )
        again = request_claim(user=user, guest=guest)
        assert again.status == AccountClaim.Status.PENDING

    def test_withdrawing_before_anybody_looked(self, guest_with_booking):
        guest, _ = guest_with_booking
        claim = request_claim(user=UserFactory(phone="01711234567"), guest=guest)
        assert withdraw_claim(claim=claim).status == AccountClaim.Status.WITHDRAWN
