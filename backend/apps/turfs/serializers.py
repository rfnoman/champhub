from __future__ import annotations

from copy import copy

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.sports.models import MatchUnit, SportFormat
from apps.sports.serializers import SportFormatSerializer, SportSummarySerializer

from .availability import cheapest_price, selling_terms
from .models import (
    Amenity,
    Closure,
    Ground,
    GroundFormatSetting,
    OperatingHours,
    PriceRule,
    Turf,
    TurfMembership,
    TurfPhoto,
    Weekday,
)


class AmenitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Amenity
        fields = ["id", "key", "label", "icon", "order"]


class TurfPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = TurfPhoto
        fields = ["id", "image", "caption", "order"]


class PriceRuleSerializer(serializers.ModelSerializer):
    weekdays = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6),
        # `required=False` would make it optional in the *response* too, even though the
        # model default guarantees a list; COMPONENT_SPLIT_REQUEST keeps the request
        # side lenient through `default`.
        default=list,
        help_text="Monday is 0. Empty means every day.",
    )

    class Meta:
        model = PriceRule
        fields = ["id", "weekdays", "start_time", "end_time", "price", "label"]
        extra_kwargs = {
            "end_time": {
                "help_text": (
                    "An end at or before the start wraps past midnight — 22:00–02:00 is "
                    "a night rate. Equal times therefore mean the full 24 hours, which "
                    "is how a turf prices every open minute with one rule."
                )
            }
        }


class OperatingHoursSerializer(serializers.ModelSerializer):
    weekday_label = serializers.CharField(source="get_weekday_display", read_only=True)
    crosses_midnight = serializers.BooleanField(read_only=True)

    class Meta:
        model = OperatingHours
        fields = ["id", "weekday", "weekday_label", "open_time", "close_time", "crosses_midnight"]


class ClosureSerializer(serializers.ModelSerializer):
    class Meta:
        model = Closure
        fields = ["id", "ground", "starts_at", "ends_at", "reason"]

    def validate(self, attrs):
        starts, ends = attrs.get("starts_at"), attrs.get("ends_at")
        if starts and ends and ends <= starts:
            raise serializers.ValidationError({"ends_at": "A closure must end after it starts."})
        return attrs


class GroundSportFormatSerializer(SportFormatSerializer):
    """One format as a given ground sells it (DECISIONS D102).

    The same shape as a catalogue row, except that `booking_unit`, `match_unit`,
    `match_unit_count` and `approx_minutes` carry this ground's **effective** values —
    its `GroundFormatSetting` merged over the catalogue — plus `minutes`, the length of
    one slot of this format here, and `match_price` when the turf charges a flat fee per
    match. A client never has to merge the override itself.
    """

    minutes = serializers.IntegerField(read_only=True)
    match_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True, allow_null=True
    )
    # Declared rather than inferred: a read-only model field drops `allow_blank`, and
    # the generated client would then not know that an hourly format sends "".
    match_unit = serializers.ChoiceField(
        choices=MatchUnit.choices, read_only=True, allow_blank=True
    )

    class Meta(SportFormatSerializer.Meta):
        fields = [*SportFormatSerializer.Meta.fields, "minutes", "match_price"]
        # Response-only, for the same reason GroundSerializer declares it: every field
        # here is always present, and a client should not have to treat `booking_unit`
        # as possibly undefined.
        read_only_fields = fields


def ground_format_terms(ground: Ground) -> list[SportFormat]:
    """Every format on ``ground``, carrying that ground's selling terms.

    Each row is a **copy**: the originals come out of the prefetch cache and may be
    shared, so overwriting them in place would leak one ground's over count into the
    next ground in the same response.
    """
    rows = []
    for fmt in ground.sport_formats.all():
        terms = selling_terms(ground=ground, sport_format=fmt)
        row = copy(fmt)
        row.booking_unit = terms.booking_unit
        row.match_unit = terms.match_unit
        row.match_unit_count = terms.match_unit_count
        row.approx_minutes = terms.minutes if terms.per_match else None
        row.minutes = terms.minutes
        row.match_price = terms.match_price
        rows.append(row)
    return rows


class GroundFormatSettingSerializer(serializers.ModelSerializer):
    """An owner's override of one per-match format on one ground."""

    sport_format_id = serializers.PrimaryKeyRelatedField(
        queryset=SportFormat.objects.filter(is_active=True),
        source="sport_format",
    )
    sport_format_name = serializers.CharField(source="sport_format.display_name", read_only=True)

    class Meta:
        model = GroundFormatSetting
        fields = [
            "id",
            "sport_format_id",
            "sport_format_name",
            "match_unit_count",
            "approx_minutes",
            "match_price",
        ]

    # Named for the *serializer* field, not the model one: DRF looks up
    # `validate_<declared name>`, so `validate_sport_format` would never run.
    def validate_sport_format_id(self, value: SportFormat) -> SportFormat:
        if not value.is_per_match:
            raise serializers.ValidationError("That format is sold by the clock, not per match.")
        return value


class GroundSerializer(serializers.ModelSerializer):
    sport_formats = serializers.SerializerMethodField()
    sports = SportSummarySerializer(many=True, read_only=True)
    price_rules = PriceRuleSerializer(many=True, read_only=True)
    format_settings = GroundFormatSettingSerializer(many=True, read_only=True)
    surface_label = serializers.CharField(source="get_surface_display", read_only=True)

    class Meta:
        model = Ground
        fields = [
            "id",
            "name",
            "slug",
            "surface",
            "surface_label",
            "max_players",
            "slot_minutes",
            "is_active",
            "notes",
            "sport_formats",
            "sports",
            "price_rules",
            "format_settings",
        ]
        # Response-only: writes go through GroundWriteSerializer. Declaring every field
        # read-only is what makes them *required* in the generated response type —
        # otherwise a model default (slot_minutes, max_players) reads as `number |
        # undefined` on the client even though it is always present.
        read_only_fields = fields

    @extend_schema_field(GroundSportFormatSerializer(many=True))
    def get_sport_formats(self, ground: Ground):
        return GroundSportFormatSerializer(ground_format_terms(ground), many=True).data


class GroundWriteSerializer(serializers.ModelSerializer):
    sport_format_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=SportFormatSerializer.Meta.model.objects.filter(is_active=True),
        source="sport_formats",
        required=False,
    )

    class Meta:
        model = Ground
        fields = [
            "name",
            "surface",
            "max_players",
            "slot_minutes",
            "notes",
            "sport_format_ids",
        ]


class TurfSummarySerializer(serializers.ModelSerializer):
    """What a listing row needs: identity, position, and what can be played."""

    latitude = serializers.FloatField(read_only=True)
    longitude = serializers.FloatField(read_only=True)
    #: Derived from `location`, so a card can offer directions without the client having
    #: to know how Google spells a route URL.
    directions_url = serializers.CharField(read_only=True)
    amenities = AmenitySerializer(many=True, read_only=True)
    photos = TurfPhotoSerializer(many=True, read_only=True)
    sports = serializers.SerializerMethodField()
    ground_count = serializers.SerializerMethodField()
    price_from = serializers.SerializerMethodField()
    distance_km = serializers.SerializerMethodField()

    class Meta:
        model = Turf
        fields = [
            "id",
            "name",
            "slug",
            "area",
            "city",
            "address",
            "latitude",
            "longitude",
            "map_url",
            "directions_url",
            "amenities",
            "photos",
            "sports",
            "ground_count",
            "price_from",
            "distance_km",
        ]

    @extend_schema_field(SportSummarySerializer(many=True))
    def get_sports(self, obj) -> list[dict]:
        seen: dict[str, object] = {}
        for ground in obj.grounds.all():
            for fmt in ground.sport_formats.all():
                seen.setdefault(fmt.sport.slug, fmt.sport)
        ordered = sorted(seen.values(), key=lambda s: (s.order, s.name))
        return SportSummarySerializer(ordered, many=True).data

    @extend_schema_field(serializers.IntegerField())
    def get_ground_count(self, obj) -> int:
        return len(obj.grounds.all())

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_price_from(self, obj) -> str | None:
        """Cheapest thing a player can buy across the turf's active grounds.

        Per ground rather than per price rule, because a cricket ground's cheapest
        product is a match and not an hour (DECISIONS D102).
        """
        prices = [cheapest_price(ground=ground) for ground in obj.grounds.all()]
        quotable = [price for price in prices if price is not None]
        return str(min(quotable)) if quotable else None

    @extend_schema_field(serializers.FloatField(allow_null=True))
    def get_distance_km(self, obj) -> float | None:
        """Only present when the request supplied a point to measure from."""
        distance = getattr(obj, "distance", None)
        return round(distance.km, 2) if distance is not None else None


class TurfDetailSerializer(TurfSummarySerializer):
    grounds = GroundSerializer(many=True, read_only=True)
    operating_hours = OperatingHoursSerializer(many=True, read_only=True)

    class Meta(TurfSummarySerializer.Meta):
        fields = [
            *TurfSummarySerializer.Meta.fields,
            "description",
            "phone",
            "cancellation_free_hours",
            # Public because a player has to see, before booking, that this turf asks
            # for an advance (DECISIONS D8).
            "advance_percent",
            "grounds",
            "operating_hours",
        ]
        # Response-only, like GroundSerializer: writes go through TurfWriteSerializer.
        # Declaring it makes model-default fields required in the generated response
        # type rather than `number | undefined` on every client read.
        read_only_fields = fields


class OwnerTurfSerializer(TurfDetailSerializer):
    """The owner's own view: status and review feedback, which players never see."""

    status_label = serializers.CharField(source="get_status_display", read_only=True)
    my_role = serializers.SerializerMethodField()
    owner_identity_status = serializers.SerializerMethodField()

    class Meta(TurfDetailSerializer.Meta):
        fields = [
            *TurfDetailSerializer.Meta.fields,
            "status",
            "status_label",
            "rejection_reason",
            "submitted_at",
            "reviewed_at",
            "auto_confirm_enabled",
            "my_role",
            "owner_identity_status",
        ]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_my_role(self, obj) -> str | None:
        user = getattr(self.context.get("request"), "user", None)
        if not user or not user.is_authenticated:
            return None
        membership = next(
            (
                m
                for m in obj.memberships.all()
                if m.user_id == user.id and m.status == TurfMembership.Status.ACTIVE
            ),
            None,
        )
        return membership.role if membership else None

    @extend_schema_field(serializers.CharField())
    def get_owner_identity_status(self, obj) -> str:
        """Whether a verified person stands behind this venue (DOMAIN §1a).

        On the owner's own view it is why the registration page can say "we still need
        your NID"; in the admin queue it is the thing a reviewer should look at before
        approving a turf they have never visited.
        """
        from apps.turfs.services import owner_identity_status

        return owner_identity_status(obj)


class TurfWriteSerializer(serializers.ModelSerializer):
    """Registering or editing a turf.

    Position can arrive two ways and the serializer accepts either: an explicit
    `latitude`/`longitude` pair from dragging the pin, or a `map_url` the owner pasted
    out of Google Maps, which :mod:`apps.turfs.maps` reads the pair out of. Both are
    optional *here* and the pairing is enforced in `validate` — a create with neither is
    refused, a patch with neither simply leaves the location alone.
    """

    latitude = serializers.FloatField(write_only=True, min_value=-90, max_value=90, required=False)
    longitude = serializers.FloatField(
        write_only=True, min_value=-180, max_value=180, required=False
    )
    amenity_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Amenity.objects.all(), source="amenities", required=False
    )

    class Meta:
        model = Turf
        fields = [
            "name",
            "description",
            "address",
            "area",
            "city",
            "phone",
            "latitude",
            "longitude",
            "map_url",
            "amenity_ids",
            "auto_confirm_enabled",
            "cancellation_free_hours",
            "advance_percent",
        ]
        extra_kwargs = {"map_url": {"required": False, "allow_blank": True}}

    def validate(self, attrs):
        """One of the two ways of saying where the turf is, and half a pair is neither."""
        has_lat = attrs.get("latitude") is not None
        has_lng = attrs.get("longitude") is not None
        if has_lat != has_lng:
            raise serializers.ValidationError(
                {"latitude": "Give both latitude and longitude, or neither."}
            )

        creating = self.instance is None
        if creating and not has_lat and not attrs.get("map_url"):
            raise serializers.ValidationError(
                {
                    "latitude": (
                        "Where is the turf? Drop the pin on the map, or paste its Google Maps link."
                    )
                }
            )
        return attrs


class TurfMembershipSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True, default="")
    user_email = serializers.CharField(source="user.email", read_only=True, default="")
    role_label = serializers.CharField(source="get_role_display", read_only=True)
    turf_name = serializers.CharField(source="turf.name", read_only=True)

    class Meta:
        model = TurfMembership
        fields = [
            "id",
            "turf",
            "turf_name",
            "user_name",
            "user_email",
            "invited_email",
            "invited_phone",
            "role",
            "role_label",
            "status",
            "accepted_at",
            "created_at",
        ]
        read_only_fields = fields


class StaffInviteSerializer(serializers.Serializer):
    role = serializers.ChoiceField(
        choices=[
            (TurfMembership.Role.MANAGER, TurfMembership.Role.MANAGER.label),
            (TurfMembership.Role.CASHIER, TurfMembership.Role.CASHIER.label),
        ]
    )
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)


class ReviewDecisionSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=2000, required=False, allow_blank=True)


class SlotSerializer(serializers.Serializer):
    """One slot from ``apps.turfs.availability``."""

    start = serializers.DateTimeField()
    end = serializers.DateTimeField()
    price = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)
    label = serializers.CharField(allow_blank=True)
    available = serializers.BooleanField()
    reason = serializers.CharField(allow_blank=True)
    minutes = serializers.IntegerField(read_only=True)


class AvailabilitySerializer(serializers.Serializer):
    """A day of slots, plus the terms they were sliced and priced under (D102)."""

    ground_id = serializers.UUIDField()
    date = serializers.DateField()
    #: The length of every slot below. Equal to the ground's own `slot_minutes` unless a
    #: per-match format was asked for, in which case it is how long a match runs here.
    slot_minutes = serializers.IntegerField()
    sport_format_id = serializers.UUIDField(allow_null=True)
    booking_unit = serializers.CharField()
    match_unit = serializers.CharField(allow_blank=True)
    match_unit_count = serializers.IntegerField(allow_null=True)
    slots = SlotSerializer(many=True)


class PriceCoverageGapSerializer(serializers.Serializer):
    weekday = serializers.ChoiceField(choices=Weekday.choices)
    weekday_label = serializers.CharField()
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()
