"""Booking endpoints: the player's flow, the staff actions, and who may do what."""

from __future__ import annotations

from datetime import timedelta

import pytest
from psycopg.types.range import TimestamptzRange
from rest_framework.test import APIClient

from apps.accounts.models import GuestProfile
from apps.accounts.tests.factories import UserFactory
from apps.bookings.models import Booking, BookingStatus
from apps.bookings.services import confirm_booking, create_booking
from apps.core.utils import now
from apps.players.services import get_or_create_profile
from apps.turfs.models import TurfMembership
from apps.turfs.tests.factories import TurfMembershipFactory

from .factories import bookable_ground, next_slot_start

pytestmark = pytest.mark.django_db


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def setup():
    ground, sport_format = bookable_ground()
    owner = TurfMembershipFactory(turf=ground.turf, role=TurfMembership.Role.OWNER).user
    staff = TurfMembershipFactory(turf=ground.turf, role=TurfMembership.Role.CASHIER).user
    return ground, sport_format, owner, staff


def payload(ground, sport_format, start=None) -> dict:
    return {
        "ground_id": str(ground.id),
        "sport_format_id": str(sport_format.id),
        "start": (start or next_slot_start()).isoformat(),
    }


class TestCreate:
    def test_requires_authentication(self, client, setup):
        ground, sport_format, *_ = setup
        assert client.post("/api/v1/bookings", payload(ground, sport_format)).status_code == 401

    def test_books_a_slot(self, client, setup):
        ground, sport_format, *_ = setup
        client.force_authenticate(UserFactory())

        response = client.post("/api/v1/bookings", payload(ground, sport_format), format="json")
        assert response.status_code == 201
        assert response.data["status"] == "reserved"
        assert response.data["price"] == "2000.00"
        assert response.data["turf_name"] == ground.turf.name

    def test_a_taken_slot_is_a_409_not_a_400(self, client, setup):
        """Acceptance: the loser of the race is told the slot was just taken."""
        ground, sport_format, *_ = setup
        start = next_slot_start()
        create_booking(user=UserFactory(), ground=ground, start=start, sport_format=sport_format)
        client.force_authenticate(UserFactory())

        response = client.post(
            "/api/v1/bookings", payload(ground, sport_format, start), format="json"
        )
        assert response.status_code == 409
        assert "just taken" in response.data["start"][0]

    def test_a_slot_the_turf_does_not_offer_is_a_400(self, client, setup):
        ground, sport_format, *_ = setup
        client.force_authenticate(UserFactory())
        odd = next_slot_start() + timedelta(minutes=23)

        response = client.post(
            "/api/v1/bookings", payload(ground, sport_format, odd), format="json"
        )
        assert response.status_code == 400

    def test_the_booking_appears_in_my_bookings(self, client, setup):
        ground, sport_format, *_ = setup
        player = UserFactory()
        client.force_authenticate(player)
        client.post("/api/v1/bookings", payload(ground, sport_format), format="json")

        upcoming = client.get("/api/v1/me/bookings").data
        assert len(upcoming) == 1
        assert upcoming[0]["status"] == "reserved"

    def test_booking_blocks_the_slot_in_availability(self, client, setup):
        """Phase 02's selector picks bookings up through the provider registry (D25)."""
        ground, sport_format, *_ = setup
        start = next_slot_start()
        player = UserFactory()
        client.force_authenticate(player)

        before = client.get(f"/api/v1/grounds/{ground.id}/availability?date={start.date()}").data[
            "slots"
        ]
        assert any(s["start"].startswith(start.isoformat()[:16]) and s["available"] for s in before)

        client.post("/api/v1/bookings", payload(ground, sport_format, start), format="json")

        after = client.get(f"/api/v1/grounds/{ground.id}/availability?date={start.date()}").data[
            "slots"
        ]
        taken = next(s for s in after if s["start"].startswith(start.isoformat()[:16]))
        assert taken["available"] is False
        assert taken["reason"] == "booked"


class TestVisibility:
    def test_the_booker_can_read_it(self, client, setup):
        ground, sport_format, *_ = setup
        player = UserFactory()
        booking = create_booking(
            user=player, ground=ground, start=next_slot_start(), sport_format=sport_format
        )
        client.force_authenticate(player)

        assert client.get(f"/api/v1/bookings/{booking.id}").status_code == 200

    def test_turf_staff_can_read_it(self, client, setup):
        ground, sport_format, _, staff = setup
        booking = create_booking(
            user=UserFactory(), ground=ground, start=next_slot_start(), sport_format=sport_format
        )
        client.force_authenticate(staff)

        assert client.get(f"/api/v1/bookings/{booking.id}").status_code == 200

    def test_a_stranger_cannot(self, client, setup):
        ground, sport_format, *_ = setup
        booking = create_booking(
            user=UserFactory(), ground=ground, start=next_slot_start(), sport_format=sport_format
        )
        client.force_authenticate(UserFactory())

        assert client.get(f"/api/v1/bookings/{booking.id}").status_code == 404

    def test_staff_at_another_turf_cannot(self, client, setup):
        """Acceptance: staff of turf A are not staff of turf B."""
        ground, sport_format, *_ = setup
        other, _ = bookable_ground()
        intruder = TurfMembershipFactory(turf=other.turf, role=TurfMembership.Role.OWNER).user
        booking = create_booking(
            user=UserFactory(), ground=ground, start=next_slot_start(), sport_format=sport_format
        )
        client.force_authenticate(intruder)

        assert client.get(f"/api/v1/bookings/{booking.id}").status_code == 404


class TestStaffActions:
    def test_staff_confirm(self, client, setup):
        ground, sport_format, _, staff = setup
        booking = create_booking(
            user=UserFactory(), ground=ground, start=next_slot_start(), sport_format=sport_format
        )
        client.force_authenticate(staff)

        response = client.post(f"/api/v1/bookings/{booking.id}/confirm", {}, format="json")
        assert response.status_code == 200
        assert response.data["status"] == "confirmed"

    def test_the_player_cannot_confirm_their_own_booking(self, client, setup):
        ground, sport_format, *_ = setup
        player = UserFactory()
        booking = create_booking(
            user=player, ground=ground, start=next_slot_start(), sport_format=sport_format
        )
        client.force_authenticate(player)

        assert (
            client.post(f"/api/v1/bookings/{booking.id}/confirm", {}, format="json").status_code
            == 403
        )

    def test_mark_paid(self, client, setup):
        ground, sport_format, _, staff = setup
        booking = create_booking(
            user=UserFactory(), ground=ground, start=next_slot_start(), sport_format=sport_format
        )
        confirm_booking(booking=booking, actor=staff)
        client.force_authenticate(staff)

        response = client.post(f"/api/v1/bookings/{booking.id}/mark-paid", {}, format="json")
        assert response.status_code == 200
        assert response.data["status"] == "paid"
        assert response.data["payments"][0]["amount"] == "2000.00"

    def test_mark_paid_before_confirming_is_a_400(self, client, setup):
        ground, sport_format, _, staff = setup
        booking = create_booking(
            user=UserFactory(), ground=ground, start=next_slot_start(), sport_format=sport_format
        )
        client.force_authenticate(staff)

        assert (
            client.post(f"/api/v1/bookings/{booking.id}/mark-paid", {}, format="json").status_code
            == 400
        )

    def test_no_show_before_the_grace_period_is_a_400(self, client, setup):
        ground, sport_format, _, staff = setup
        booking = create_booking(
            user=UserFactory(), ground=ground, start=next_slot_start(), sport_format=sport_format
        )
        confirm_booking(booking=booking, actor=staff)
        client.force_authenticate(staff)

        assert (
            client.post(f"/api/v1/bookings/{booking.id}/no-show", {}, format="json").status_code
            == 400
        )

    def test_no_show_after_the_grace_period(self, client, setup):
        ground, sport_format, _, staff = setup
        booking = create_booking(
            user=UserFactory(), ground=ground, start=next_slot_start(), sport_format=sport_format
        )
        confirm_booking(booking=booking, actor=staff)
        started = now() - timedelta(hours=2)
        Booking.objects.filter(pk=booking.pk).update(
            time_range=TimestamptzRange(started, started + timedelta(hours=1))
        )
        client.force_authenticate(staff)

        response = client.post(f"/api/v1/bookings/{booking.id}/no-show", {}, format="json")
        assert response.status_code == 200
        assert response.data["status"] == "no_show"


class TestCancel:
    def test_the_player_can_cancel(self, client, setup):
        ground, sport_format, *_ = setup
        player = UserFactory()
        booking = create_booking(
            user=player,
            ground=ground,
            start=next_slot_start(hours_ahead=72),
            sport_format=sport_format,
        )
        client.force_authenticate(player)

        response = client.post(
            f"/api/v1/bookings/{booking.id}/cancel", {"reason": "Plans changed"}, format="json"
        )
        assert response.status_code == 200
        assert response.data["status"] == "cancelled"
        assert response.data["cancel_reason"] == "Plans changed"

    def test_staff_cancelling_is_not_counted_against_the_player(self, client, setup):
        ground, sport_format, _, staff = setup
        ground.turf.cancellation_free_hours = 72
        ground.turf.save(update_fields=["cancellation_free_hours"])
        booking = create_booking(
            user=UserFactory(),
            ground=ground,
            start=next_slot_start(hours_ahead=3),
            sport_format=sport_format,
        )
        client.force_authenticate(staff)

        response = client.post(
            f"/api/v1/bookings/{booking.id}/cancel", {"reason": "Flooded"}, format="json"
        )
        assert response.data["was_late_cancel"] is False

    def test_a_stranger_cannot_cancel(self, client, setup):
        ground, sport_format, *_ = setup
        booking = create_booking(
            user=UserFactory(), ground=ground, start=next_slot_start(), sport_format=sport_format
        )
        client.force_authenticate(UserFactory())

        assert (
            client.post(f"/api/v1/bookings/{booking.id}/cancel", {}, format="json").status_code
            == 404
        )


class TestTurfCalendar:
    def test_staff_see_the_days_bookings(self, client, setup):
        ground, sport_format, _, staff = setup
        start = next_slot_start()
        create_booking(user=UserFactory(), ground=ground, start=start, sport_format=sport_format)
        client.force_authenticate(staff)

        response = client.get(f"/api/v1/me/turfs/{ground.turf.slug}/bookings?date={start.date()}")
        assert response.status_code == 200
        assert len(response.data) == 1

    def test_another_turfs_staff_get_a_404(self, client, setup):
        ground, *_ = setup
        other, _ = bookable_ground()
        intruder = TurfMembershipFactory(turf=other.turf, role=TurfMembership.Role.OWNER).user
        client.force_authenticate(intruder)

        assert client.get(f"/api/v1/me/turfs/{ground.turf.slug}/bookings").status_code == 404

    def test_a_malformed_date_is_a_400(self, client, setup):
        ground, _, _, staff = setup
        client.force_authenticate(staff)

        assert (
            client.get(f"/api/v1/me/turfs/{ground.turf.slug}/bookings?date=soon").status_code == 400
        )

    def test_the_pending_queue_is_ordered_by_deadline(self, client, setup):
        ground, sport_format, _, staff = setup
        later = create_booking(
            user=UserFactory(),
            ground=ground,
            start=next_slot_start(hours_ahead=72),
            sport_format=sport_format,
        )
        sooner = create_booking(
            user=UserFactory(),
            ground=ground,
            start=next_slot_start(hours_ahead=3),
            sport_format=sport_format,
        )
        client.force_authenticate(staff)

        response = client.get(f"/api/v1/me/turfs/{ground.turf.slug}/bookings/pending")
        assert [b["id"] for b in response.data] == [str(sooner.id), str(later.id)]


class TestWalkIn:
    def test_staff_book_for_someone_at_the_counter(self, client, setup):
        ground, sport_format, _, staff = setup
        client.force_authenticate(staff)

        response = client.post(
            f"/api/v1/me/turfs/{ground.turf.slug}/bookings/walk-in",
            {
                **payload(ground, sport_format),
                "booked_for_name": "Karim",
                "booked_for_phone": "+8801711111111",
            },
            format="json",
        )
        assert response.status_code == 201
        # Somebody is standing at the counter, so there is nothing to confirm.
        assert response.data["status"] == "confirmed"
        assert response.data["player_name"] == "Karim"
        assert response.data["visibility"] == "private"

    def test_a_walk_in_needs_a_name(self, client, setup):
        ground, sport_format, _, staff = setup
        client.force_authenticate(staff)

        response = client.post(
            f"/api/v1/me/turfs/{ground.turf.slug}/bookings/walk-in",
            payload(ground, sport_format),
            format="json",
        )
        assert response.status_code == 400

    def test_booking_for_an_existing_account_makes_it_theirs(self, client, setup):
        """The whole point: it shows up in the player's app, not the cashier's."""
        ground, sport_format, _, staff = setup
        player = UserFactory(username="rafiq_hasan")
        get_or_create_profile(player)
        client.force_authenticate(staff)

        response = client.post(
            f"/api/v1/me/turfs/{ground.turf.slug}/bookings/walk-in",
            {**payload(ground, sport_format), "player": "@rafiq_hasan"},
            format="json",
        )
        assert response.status_code == 201, response.data

        booking = Booking.objects.get(id=response.data["id"])
        assert booking.booked_by_id == player.id
        assert booking.guest_id is None
        assert booking.booked_for_name == ""
        # And they are on the roster, because the booker is the player now.
        assert booking.match.players.filter(player=player).exists()

    def test_the_handle_may_be_written_without_the_at(self, client, setup):
        ground, sport_format, _, staff = setup
        player = UserFactory(username="rafiq_hasan")
        get_or_create_profile(player)
        client.force_authenticate(staff)

        response = client.post(
            f"/api/v1/me/turfs/{ground.turf.slug}/bookings/walk-in",
            {**payload(ground, sport_format), "player": "rafiq_hasan"},
            format="json",
        )
        assert response.status_code == 201
        assert Booking.objects.get(id=response.data["id"]).booked_by_id == player.id

    def test_an_unknown_handle_is_refused(self, client, setup):
        ground, sport_format, _, staff = setup
        client.force_authenticate(staff)

        response = client.post(
            f"/api/v1/me/turfs/{ground.turf.slug}/bookings/walk-in",
            {**payload(ground, sport_format), "player": "@nobody_here"},
            format="json",
        )
        assert response.status_code == 400
        assert "player" in response.data

    def test_a_guest_booking_creates_a_guest(self, client, setup):
        ground, sport_format, _, staff = setup
        client.force_authenticate(staff)

        response = client.post(
            f"/api/v1/me/turfs/{ground.turf.slug}/bookings/walk-in",
            {
                **payload(ground, sport_format),
                "booked_for_name": "Karim",
                "booked_for_phone": "01711-234567",
            },
            format="json",
        )
        assert response.status_code == 201

        booking = Booking.objects.get(id=response.data["id"])
        assert booking.guest is not None
        assert booking.guest.name == "Karim"
        # Stored the way a claim will look for it, whatever was typed.
        assert booking.guest.phone == "+8801711234567"
        assert booking.booked_for_phone == "+8801711234567"

    def test_the_same_number_next_week_is_the_same_guest(self, client, setup):
        ground, sport_format, _, staff = setup
        client.force_authenticate(staff)
        body = {
            "booked_for_name": "Karim",
            "booked_for_phone": "01711234567",
        }

        first = client.post(
            f"/api/v1/me/turfs/{ground.turf.slug}/bookings/walk-in",
            {**payload(ground, sport_format), **body},
            format="json",
        )
        second = client.post(
            f"/api/v1/me/turfs/{ground.turf.slug}/bookings/walk-in",
            {
                **payload(ground, sport_format, start=next_slot_start(hours_ahead=48)),
                **body,
                "booked_for_phone": "+880 1711 234567",
            },
            format="json",
        )
        assert (first.status_code, second.status_code) == (201, 201)
        assert GuestProfile.objects.count() == 1
        assert GuestProfile.objects.first().bookings.count() == 2

    def test_a_guest_needs_a_number(self, client, setup):
        """Without one the booking is a dead end — nothing can ever claim it."""
        ground, sport_format, _, staff = setup
        client.force_authenticate(staff)

        response = client.post(
            f"/api/v1/me/turfs/{ground.turf.slug}/bookings/walk-in",
            {**payload(ground, sport_format), "booked_for_name": "Karim"},
            format="json",
        )
        assert response.status_code == 400
        assert "booked_for_phone" in response.data

    def test_both_an_account_and_a_guest_is_refused(self, client, setup):
        ground, sport_format, _, staff = setup
        player = UserFactory(username="rafiq_hasan")
        get_or_create_profile(player)
        client.force_authenticate(staff)

        response = client.post(
            f"/api/v1/me/turfs/{ground.turf.slug}/bookings/walk-in",
            {
                **payload(ground, sport_format),
                "player": "@rafiq_hasan",
                "booked_for_name": "Karim",
                "booked_for_phone": "01711234567",
            },
            format="json",
        )
        assert response.status_code == 400


class TestCounterSearch:
    def test_staff_find_a_player_by_handle(self, client, setup):
        ground, _, _, staff = setup
        player = UserFactory(username="rafiq_hasan", first_name="Rafiqul")
        get_or_create_profile(player)
        client.force_authenticate(staff)

        response = client.get(
            f"/api/v1/me/turfs/{ground.turf.slug}/counter-players", {"q": "@rafiq_hasan"}
        )
        assert response.status_code == 200
        assert [row["handle"] for row in response.data] == ["@rafiq_hasan"]

    def test_a_hidden_player_is_still_findable_at_the_counter(self, client, setup):
        """`discoverable` hides you from the directory, not from the manager in front of you."""
        ground, _, _, staff = setup
        player = UserFactory(username="rafiq_hasan")
        profile = get_or_create_profile(player)
        profile.discoverable = False
        profile.save()
        client.force_authenticate(staff)

        response = client.get(
            f"/api/v1/me/turfs/{ground.turf.slug}/counter-players", {"q": "@rafiq_hasan"}
        )
        assert len(response.data) == 1

    def test_found_by_phone_however_it_is_written(self, client, setup):
        ground, _, _, staff = setup
        player = UserFactory(username="rafiq_hasan", phone="+8801711234567")
        get_or_create_profile(player)
        client.force_authenticate(staff)

        response = client.get(
            f"/api/v1/me/turfs/{ground.turf.slug}/counter-players", {"q": "01711-234567"}
        )
        assert len(response.data) == 1
        # Masked: a cashier confirms the last four, nobody reads a full number off a till.
        assert response.data[0]["phone_hint"].endswith("4567")
        assert "1711" not in response.data[0]["phone_hint"]

    def test_an_exact_handle_sorts_above_a_name_that_merely_starts_the_same(self, client, setup):
        ground, _, _, staff = setup
        get_or_create_profile(UserFactory(username="rafi", first_name="Zed"))
        other = UserFactory(username="someone_else", first_name="Rafi")
        get_or_create_profile(other)
        client.force_authenticate(staff)

        response = client.get(f"/api/v1/me/turfs/{ground.turf.slug}/counter-players", {"q": "rafi"})
        assert response.data[0]["handle"] == "@rafi"

    def test_a_one_character_query_returns_nothing(self, client, setup):
        """This screen has a search box, not a user list."""
        ground, _, _, staff = setup
        get_or_create_profile(UserFactory(username="rafiq_hasan"))
        client.force_authenticate(staff)

        response = client.get(f"/api/v1/me/turfs/{ground.turf.slug}/counter-players", {"q": "r"})
        assert response.data == []

    def test_a_stranger_cannot_search(self, client, setup):
        ground, *_ = setup
        client.force_authenticate(UserFactory())
        response = client.get(f"/api/v1/me/turfs/{ground.turf.slug}/counter-players", {"q": "ra"})
        assert response.status_code == 404

    def test_a_player_cannot_take_walk_ins(self, client, setup):
        ground, sport_format, *_ = setup
        client.force_authenticate(UserFactory())

        response = client.post(
            f"/api/v1/me/turfs/{ground.turf.slug}/bookings/walk-in",
            {**payload(ground, sport_format), "booked_for_name": "Karim"},
            format="json",
        )
        assert response.status_code == 404


def test_past_and_upcoming_are_split(client, setup):
    ground, sport_format, *_ = setup
    player = UserFactory()
    upcoming = create_booking(
        user=player, ground=ground, start=next_slot_start(), sport_format=sport_format
    )
    done = create_booking(
        user=player,
        ground=ground,
        start=next_slot_start(hours_ahead=48),
        sport_format=sport_format,
    )
    Booking.objects.filter(pk=done.pk).update(
        status=BookingStatus.COMPLETED,
        time_range=TimestamptzRange(now() - timedelta(hours=3), now() - timedelta(hours=2)),
    )
    client.force_authenticate(player)

    assert [b["id"] for b in client.get("/api/v1/me/bookings").data] == [str(upcoming.id)]
    assert [b["id"] for b in client.get("/api/v1/me/bookings?filter=past").data] == [str(done.id)]


def test_the_timeline_is_returned_with_the_booking(client, setup):
    ground, sport_format, _, staff = setup
    booking = create_booking(
        user=UserFactory(), ground=ground, start=next_slot_start(), sport_format=sport_format
    )
    confirm_booking(booking=booking, actor=staff)
    client.force_authenticate(staff)

    events = client.get(f"/api/v1/bookings/{booking.id}").data["events"]
    assert [e["to_status"] for e in events] == ["reserved", "confirmed"]
