from __future__ import annotations

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.payments.serializers import PaymentSerializer
from apps.sports.models import MatchUnit
from apps.sports.serializers import SportFormatSerializer, SportSummarySerializer

from .models import Booking, BookingEvent, BookingMode, BookingVisibility


class BookingEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True, default="")
    to_status_label = serializers.CharField(source="get_to_status_display", read_only=True)

    class Meta:
        model = BookingEvent
        fields = [
            "id",
            "from_status",
            "to_status",
            "to_status_label",
            "actor_name",
            "note",
            "created_at",
        ]
        read_only_fields = fields


class BookingSerializer(serializers.ModelSerializer):
    """One booking, with the timeline that makes its status explicable."""

    turf_name = serializers.CharField(source="ground.turf.name", read_only=True)
    turf_slug = serializers.CharField(source="ground.turf.slug", read_only=True)
    turf_area = serializers.CharField(source="ground.turf.area", read_only=True)
    ground_name = serializers.CharField(source="ground.name", read_only=True)
    ground_id = serializers.UUIDField(source="ground.id", read_only=True)
    sport = SportSummarySerializer(read_only=True)
    sport_format = SportFormatSerializer(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    # Declared so the generated client knows an hourly booking sends "" — a read-only
    # model field loses `allow_blank` and would type as the enum alone.
    match_unit = serializers.ChoiceField(
        choices=MatchUnit.choices, read_only=True, allow_blank=True
    )
    starts_at = serializers.DateTimeField(read_only=True)
    ends_at = serializers.DateTimeField(read_only=True)
    player_name = serializers.CharField(read_only=True)
    # The turf's staff screens act on a person — renting gear out, attaching a counter
    # sale — and a name is not an identifier. Profile ids are what the API speaks (D39).
    player_profile_id = serializers.SerializerMethodField()
    # Reader-relative: a turf's own staff can also be the player who booked, and the
    # page needs to know which hat they are wearing before it offers to take money.
    is_mine = serializers.SerializerMethodField()
    events = BookingEventSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    # Staff need to know which of their players is which; the booker's own view uses it
    # to show the turf's cancellation policy.
    cancellation_free_hours = serializers.IntegerField(
        source="ground.turf.cancellation_free_hours", read_only=True
    )

    class Meta:
        model = Booking
        fields = [
            "id",
            "turf_name",
            "turf_slug",
            "turf_area",
            "ground_id",
            "ground_name",
            "sport",
            "sport_format",
            "starts_at",
            "ends_at",
            "price",
            "price_label",
            # What this booking bought, when it was sold per match (D102): "10 overs".
            "match_unit",
            "match_unit_count",
            "mode",
            "visibility",
            "status",
            "status_label",
            "expires_at",
            "auto_confirmed",
            "confirmed_at",
            "cancelled_at",
            "cancel_reason",
            "was_late_cancel",
            "player_name",
            "player_profile_id",
            "is_mine",
            "booked_for_phone",
            "notes",
            "cancellation_free_hours",
            "events",
            "payments",
            "created_at",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.UUIDField(allow_null=True))
    def get_player_profile_id(self, obj):
        profile = getattr(obj.booked_by, "player_profile", None)
        return profile.id if profile else None

    @extend_schema_field(serializers.BooleanField())
    def get_is_mine(self, obj) -> bool:
        user = getattr(self.context.get("request"), "user", None)
        return bool(user and user.is_authenticated and obj.booked_by_id == user.id)


class BookingCreateSerializer(serializers.Serializer):
    ground_id = serializers.UUIDField()
    squad_id = serializers.UUIDField(
        required=False,
        allow_null=True,
        help_text="Required when `mode` is `group`; the squad you are booking for.",
    )
    start = serializers.DateTimeField(
        help_text="The slot's start, exactly as the availability endpoint reported it."
    )
    sport_format_id = serializers.UUIDField()
    mode = serializers.ChoiceField(
        choices=BookingMode.choices, default=BookingMode.INDIVIDUAL, required=False
    )
    visibility = serializers.ChoiceField(
        choices=BookingVisibility.choices, default=BookingVisibility.PUBLIC, required=False
    )
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True)


class WalkInBookingSerializer(BookingCreateSerializer):
    """Staff booking for whoever is standing at the counter (tasks.md).

    Two kinds of person turn up, and the form is the same one:

    * somebody **with an account**, who says their handle or shows the QR code on their
      profile — `player` is their username or profile id, and the booking is theirs, so
      it appears in their app and counts towards their record;
    * somebody **without one**, who gives a name and a number — `booked_for_name` and
      `booked_for_phone`, which become a `GuestProfile` so a regular's bookings group
      together and can be claimed later.

    One of the two is required; giving both is refused rather than guessed at, because
    the two produce very different rows and the staff member meant one of them.
    """

    player = serializers.CharField(
        max_length=64,
        required=False,
        allow_blank=True,
        help_text="An existing player's @handle or profile id.",
    )
    booked_for_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    booked_for_phone = serializers.CharField(max_length=32, required=False, allow_blank=True)

    def validate(self, attrs):
        player = (attrs.get("player") or "").strip()
        name = (attrs.get("booked_for_name") or "").strip()

        if player and name:
            raise serializers.ValidationError(
                {"player": "Book for the account or for a guest, not both."}
            )
        if not player and not name:
            raise serializers.ValidationError(
                {"booked_for_name": "Search for the player, or type a name and number."}
            )
        if name and not (attrs.get("booked_for_phone") or "").strip():
            # The number is what makes a guest claimable later, and without it the
            # booking is a dead end for everybody including the person who made it.
            raise serializers.ValidationError(
                {"booked_for_phone": "A phone number is needed to book for a guest."}
            )
        return attrs


class CancelBookingSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True)


class MarkPaidSerializer(serializers.Serializer):
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        min_value=0,
        help_text="Defaults to the booking price. Set it when a discount was given.",
    )


class NoteSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=300, required=False, allow_blank=True)


class CounterPlayerSerializer(serializers.Serializer):
    """A search hit at the counter: enough to be sure it is the right person.

    The phone is **masked** (`•••••••4567`), matching how identity numbers are treated
    everywhere but the reviewer's own screen (DOMAIN §1a). A cashier confirming "is that
    your number ending 4567?" needs the last four; nobody needs to be able to read a
    stranger's full number off a till.
    """

    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    handle = serializers.CharField(source="user.handle", read_only=True, default="")
    photo_url = serializers.CharField(read_only=True, default="")
    area = serializers.CharField(read_only=True, default="")
    phone_hint = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_phone_hint(self, obj) -> str:
        from apps.accounts.phones import mask_phone

        return mask_phone(obj.user.phone) if obj.user.phone else ""
