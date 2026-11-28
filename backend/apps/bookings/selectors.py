"""Read-side queries for bookings (CLAUDE.md)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta

from django.db.models import Case, IntegerField, Prefetch, Q, QuerySet, When
from psycopg.types.range import TimestamptzRange

from apps.core.utils import DHAKA, now
from apps.payments.models import Payment
from apps.turfs.models import Turf, TurfMembership

from .models import ACTIVE_BOOKING_STATUSES, Booking, BookingEvent, BookingStatus


def _with_related(queryset: QuerySet[Booking]) -> QuerySet[Booking]:
    return queryset.select_related(
        "ground", "ground__turf", "sport", "sport_format", "booked_by", "confirmed_by"
    ).prefetch_related(
        Prefetch("events", queryset=BookingEvent.objects.select_related("actor")),
        Prefetch("payments", queryset=Payment.objects.select_related("collected_by")),
    )


def bookings_for_player(user) -> QuerySet[Booking]:
    return _with_related(Booking.objects.filter(booked_by=user))


def upcoming_for_player(user) -> QuerySet[Booking]:
    """Still to be played: an active booking whose slot has not finished."""
    return (
        bookings_for_player(user)
        .filter(status__in=ACTIVE_BOOKING_STATUSES, time_range__endswith__gt=now())
        .order_by("time_range")
    )


def past_for_player(user) -> QuerySet[Booking]:
    """Everything else — finished, cancelled, expired or missed."""
    return (
        bookings_for_player(user)
        .filter(Q(time_range__endswith__lte=now()) | ~Q(status__in=ACTIVE_BOOKING_STATUSES))
        .order_by("-time_range")
    )


def bookings_for_turf(
    turf: Turf, *, day: date | None = None, status: str | None = None
) -> QuerySet[Booking]:
    """The turf's calendar. ``day`` is a Dhaka-local date, not UTC.

    A booking that runs past midnight belongs to the evening it started in, which is why
    the window is built from the local day and widened by a few hours rather than being
    a naive UTC date filter.
    """
    queryset = _with_related(Booking.objects.filter(ground__turf=turf))

    if day is not None:
        start = datetime.combine(day, time.min, tzinfo=DHAKA)
        # Six hours past midnight covers every turf's after-midnight close.
        end = datetime.combine(day + timedelta(days=1), time(6, 0), tzinfo=DHAKA)
        queryset = queryset.filter(time_range__overlap=TimestamptzRange(start, end))

    if status:
        queryset = queryset.filter(status=status)

    return queryset.order_by("time_range")


def pending_confirmation_for_turf(turf: Turf) -> QuerySet[Booking]:
    """The queue staff work through, soonest deadline first."""
    return _with_related(
        Booking.objects.filter(ground__turf=turf, status=BookingStatus.RESERVED)
    ).order_by("expires_at")


def staffed_turf_ids(user) -> list:
    if not user or not user.is_authenticated:
        return []
    return list(
        TurfMembership.objects.filter(user=user, status=TurfMembership.Status.ACTIVE).values_list(
            "turf_id", flat=True
        )
    )


def bookings_visible_to(user) -> QuerySet[Booking]:
    """Everything this user may see: their own, plus every booking at a turf they staff."""
    return _with_related(
        Booking.objects.filter(Q(booked_by=user) | Q(ground__turf_id__in=staffed_turf_ids(user)))
    ).distinct()


def counter_player_search(query: str, *, limit: int = 8):
    """Players a staff member can book for, found by handle, phone or name (tasks.md).

    Three lookups, narrowest first, because the three are not equally trustworthy:

    * an **exact handle** — the thing the person said out loud, or that their QR code
      carried. A leading `@` is stripped, matching DOMAIN §1b's "normalised away";
    * an **exact normalised phone**, so `01711-234567` finds `+8801711234567`;
    * a **name prefix**, which is the fuzzy one and is last for that reason.

    `discoverable` is deliberately ignored. It controls appearance in the player
    directory, and a player who hides there still expects the manager to find them when
    they are standing at the counter saying their own handle (DOMAIN §1b).

    An empty query returns nothing rather than everybody: this screen has a search box,
    not a user list.
    """
    from apps.accounts.phones import normalise_phone
    from apps.players.models import PlayerProfile

    text = (query or "").strip()
    if len(text) < 2:
        return PlayerProfile.objects.none()

    handle = text.lstrip("@").lower()
    phone = normalise_phone(text)

    matches = Q(user__username=handle) | Q(display_name__istartswith=text)
    matches |= Q(user__first_name__istartswith=text) | Q(user__last_name__istartswith=text)
    if phone:
        matches |= Q(user__phone=phone)

    return (
        PlayerProfile.objects.select_related("user")
        .filter(matches, user__is_active=True)
        # An exact handle is the certain match and must not be pushed below a name that
        # happens to start with the same letters.
        .order_by(
            Case(When(user__username=handle, then=0), default=1, output_field=IntegerField()),
            "display_name",
        )[:limit]
    )


def resolve_counter_player(reference: str):
    """The account behind a handle or a profile id, or ``None``.

    What the counter screen sends back after a search: the staff member picked a row, so
    this is a lookup of something already chosen rather than a second search. Accepts a
    profile id (what the picker sends) and a `@handle` (what the QR code carries and
    what somebody says out loud), and nothing else — a name is ambiguous and booking the
    wrong Rafi is worse than asking again.
    """
    from apps.players.models import PlayerProfile

    text = (reference or "").strip()
    if not text:
        return None

    try:
        profile = PlayerProfile.objects.select_related("user").get(id=uuid.UUID(text))
    except ValueError, AttributeError, PlayerProfile.DoesNotExist:
        profile = (
            PlayerProfile.objects.select_related("user")
            .filter(user__username=text.lstrip("@").lower())
            .first()
        )

    if profile is None or not profile.user.is_active:
        return None
    return profile.user
