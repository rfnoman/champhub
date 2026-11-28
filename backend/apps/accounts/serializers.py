from __future__ import annotations

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core.utils import player_label

from .models import (
    IDENTITY_FILE_FIELDS,
    AccountClaim,
    IdentityStatus,
    IdentityVerification,
    User,
)
from .usernames import MAX_LENGTH as USERNAME_MAX_LENGTH


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    username = serializers.SerializerMethodField()
    handle = serializers.CharField(read_only=True)
    photo_url = serializers.CharField(read_only=True)
    identity_status = serializers.SerializerMethodField()
    is_identity_verified = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "clerk_id",
            "username",
            "handle",
            "email",
            "phone",
            "first_name",
            "last_name",
            "full_name",
            "image_url",
            "photo_url",
            "identity_status",
            "is_identity_verified",
            "is_platform_admin",
            "is_active",
            "created_at",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.CharField())
    def get_username(self, obj) -> str:
        """``""`` rather than ``null`` for an account with no handle yet.

        The column is nullable because a unique index has no room for a second blank,
        but every reader of this field is putting it in a template or an input value,
        and a null would make each one of those `?? ""`.
        """
        return obj.username or ""

    @extend_schema_field(serializers.ChoiceField(choices=IdentityStatus.choices))
    def get_identity_status(self, obj) -> str:
        """``draft`` for an account that has never started one — not null.

        Both frontends branch on this to decide whether to nag, and a nullable field
        would make every one of those reads `?? "draft"`.
        """
        verification = getattr(obj, "identity", None)
        return verification.status if verification else IdentityStatus.DRAFT

    @extend_schema_field(serializers.BooleanField())
    def get_is_identity_verified(self, obj) -> bool:
        verification = getattr(obj, "identity", None)
        return bool(verification and verification.is_verified)


class UsernameWriteSerializer(serializers.Serializer):
    """``PUT /me/username``. One field, and the rules live in the service.

    `max_length` is generous by one character so a pasted ``@rafiq`` is normalised
    rather than rejected for being a character too long.
    """

    username = serializers.CharField(max_length=USERNAME_MAX_LENGTH + 1, allow_blank=True)


class UsernameAvailabilitySerializer(serializers.Serializer):
    """The answer to "can I have this one?".

    `username` is the *normalised* handle, so a form can show what would actually be
    stored, and `reason` is the one sentence to put under the field when it cannot.
    """

    username = serializers.CharField()
    available = serializers.BooleanField()
    reason = serializers.CharField(allow_blank=True)


class AccountPhotoSerializer(serializers.ModelSerializer):
    """Multipart write of the account photograph, and nothing else."""

    photo = serializers.ImageField(required=True)

    class Meta:
        model = User
        fields = ["photo"]


class IdentityVerificationSerializer(serializers.ModelSerializer):
    """What a person may see about their own identity check.

    Never the files and never the whole document number — there is no reason to render
    either back to the browser, and a payload that carries them is a payload that can
    leak. ``has_document_front``/``has_document_back`` say what was uploaded; the
    pictures themselves are streamed one request at a time by `IdentityFileView`.
    """

    document_type_label = serializers.CharField(source="get_document_type_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    document_number = serializers.CharField(source="masked_document_number", read_only=True)
    photo_url = serializers.SerializerMethodField()
    has_photo = serializers.SerializerMethodField()
    has_document_front = serializers.SerializerMethodField()
    has_document_back = serializers.SerializerMethodField()
    is_editable = serializers.BooleanField(read_only=True)

    class Meta:
        model = IdentityVerification
        fields = [
            "id",
            "status",
            "status_label",
            "document_type",
            "document_type_label",
            "document_number",
            "photo_url",
            "has_photo",
            "has_document_front",
            "has_document_back",
            "is_editable",
            "review_note",
            "submitted_at",
            "reviewed_at",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.CharField())
    def get_photo_url(self, obj) -> str:
        return obj.user.photo_url

    @extend_schema_field(serializers.BooleanField())
    def get_has_photo(self, obj) -> bool:
        return obj.user.has_uploaded_photo

    @extend_schema_field(serializers.BooleanField())
    def get_has_document_front(self, obj) -> bool:
        return bool(obj.document_front)

    @extend_schema_field(serializers.BooleanField())
    def get_has_document_back(self, obj) -> bool:
        return bool(obj.document_back)


class AdminIdentityVerificationSerializer(IdentityVerificationSerializer):
    """The reviewer's view: who it is, and the number in full.

    The number is unmasked here and nowhere else. Comparing it against the document in
    the photograph is the review, so masking it would leave an admin approving a picture
    they cannot read the details of.
    """

    person = serializers.SerializerMethodField()
    email = serializers.EmailField(source="user.email", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)
    user_id = serializers.UUIDField(source="user.id", read_only=True)
    document_number = serializers.CharField(read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta(IdentityVerificationSerializer.Meta):
        fields = [
            *IdentityVerificationSerializer.Meta.fields,
            "user_id",
            "person",
            "email",
            "phone",
            "reviewed_by_name",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.CharField())
    def get_person(self, obj) -> str:
        return player_label(obj.user)

    @extend_schema_field(serializers.CharField())
    def get_reviewed_by_name(self, obj) -> str:
        return player_label(obj.reviewed_by) if obj.reviewed_by else ""


class IdentityDocumentWriteSerializer(serializers.ModelSerializer):
    """PATCH of the draft. Multipart, because two of the four fields are files."""

    class Meta:
        model = IdentityVerification
        fields = ["document_type", "document_number", *IDENTITY_FILE_FIELDS]
        extra_kwargs = {
            "document_type": {"required": False},
            "document_number": {"required": False, "allow_blank": True},
            "document_front": {"required": False, "allow_null": True},
            "document_back": {"required": False, "allow_null": True},
        }


class IdentityDecisionSerializer(serializers.Serializer):
    """A reviewer's note. Required for a rejection; the service enforces that."""

    reason = serializers.CharField(required=False, allow_blank=True, max_length=1000)


class GuestBookingSerializer(serializers.Serializer):
    """One booking as a guest sees it, with no account behind the request.

    Deliberately thin. A signed-in player's booking detail carries the match, the roster,
    payment history and the turf's whole record; a guest typed a phone number and a code
    into a box, so they get what they need to turn up at the right place at the right
    time and nothing that would be worth guessing a code for.
    """

    id = serializers.UUIDField(read_only=True)
    turf_name = serializers.CharField(source="ground.turf.name", read_only=True)
    turf_area = serializers.CharField(source="ground.turf.area", read_only=True)
    turf_slug = serializers.CharField(source="ground.turf.slug", read_only=True)
    ground_name = serializers.CharField(source="ground.name", read_only=True)
    sport_name = serializers.CharField(source="sport.name", read_only=True)
    format_name = serializers.CharField(source="sport_format.name", read_only=True)
    start = serializers.SerializerMethodField()
    end = serializers.SerializerMethodField()
    price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    status = serializers.CharField(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    directions_url = serializers.CharField(source="ground.turf.directions_url", read_only=True)

    @extend_schema_field(serializers.DateTimeField())
    def get_start(self, obj):
        return obj.time_range.lower

    @extend_schema_field(serializers.DateTimeField())
    def get_end(self, obj):
        return obj.time_range.upper


class GuestLookupSerializer(serializers.Serializer):
    """What a guest types to see their own bookings.

    The code is the secret, not the phone number: a number alone would let anybody who
    knows one read a stranger's evening plans, which is exactly the kind of thing DOMAIN
    §1a refuses to do with anything private.
    """

    phone = serializers.CharField(max_length=32)
    code = serializers.CharField(max_length=12)


class GuestSummarySerializer(serializers.Serializer):
    """A guest's own view of themselves, after a successful lookup."""

    name = serializers.CharField(read_only=True)
    phone_hint = serializers.SerializerMethodField()
    booking_count = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_phone_hint(self, obj) -> str:
        from .phones import mask_phone

        return mask_phone(obj.phone)

    @extend_schema_field(serializers.IntegerField())
    def get_booking_count(self, obj) -> int:
        return obj.bookings.count()


class ClaimableSerializer(serializers.Serializer):
    """What the app offers a newly signed-up account whose number matches a guest.

    The name is **not** included. A person types their own number and is told there are
    bookings under it; telling them whose would make "is this number yours?" into a
    directory lookup for anybody willing to type numbers.
    """

    guest_id = serializers.UUIDField(source="id", read_only=True)
    phone_hint = serializers.SerializerMethodField()
    booking_count = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_phone_hint(self, obj) -> str:
        from .phones import mask_phone

        return mask_phone(obj.phone)

    @extend_schema_field(serializers.IntegerField())
    def get_booking_count(self, obj) -> int:
        return obj.bookings.count()


class AccountClaimSerializer(serializers.ModelSerializer):
    """A claim as its maker sees it."""

    status_label = serializers.CharField(source="get_status_display", read_only=True)
    phone_hint = serializers.SerializerMethodField()
    booking_count = serializers.SerializerMethodField()

    class Meta:
        model = AccountClaim
        fields = [
            "id",
            "status",
            "status_label",
            "message",
            "decision_reason",
            "phone_hint",
            "booking_count",
            "bookings_moved",
            "created_at",
            "reviewed_at",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.CharField())
    def get_phone_hint(self, obj) -> str:
        from .phones import mask_phone

        return mask_phone(obj.guest.phone)

    @extend_schema_field(serializers.IntegerField())
    def get_booking_count(self, obj) -> int:
        return obj.guest.bookings.count()


class AdminAccountClaimSerializer(AccountClaimSerializer):
    """The reviewer's view: the full number, and who is asking for what.

    The number is shown **in full** here and masked everywhere else, which is the same
    rule identity documents follow (DOMAIN §1a) — a reviewer deciding whether a person
    really is the guest needs to compare what Clerk has against what the counter wrote
    down, and cannot do that against four digits.
    """

    claimant_name = serializers.CharField(source="user.full_name", read_only=True)
    claimant_email = serializers.CharField(source="user.email", read_only=True)
    claimant_phone = serializers.CharField(source="user.phone", read_only=True)
    claimant_handle = serializers.CharField(source="user.handle", read_only=True)
    guest_name = serializers.CharField(source="guest.name", read_only=True)
    guest_phone = serializers.CharField(source="guest.phone", read_only=True)
    numbers_match = serializers.SerializerMethodField()
    turfs = serializers.SerializerMethodField()

    class Meta(AccountClaimSerializer.Meta):
        fields = [
            *AccountClaimSerializer.Meta.fields,
            "claimant_name",
            "claimant_email",
            "claimant_phone",
            "claimant_handle",
            "guest_name",
            "guest_phone",
            "numbers_match",
            "turfs",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.BooleanField())
    def get_numbers_match(self, obj) -> bool:
        """Whether Clerk's number and the counter's are the same number.

        Computed here, not in the client, because "the same number" is a question only
        `apps.accounts.phones` can answer: Clerk stores whatever the person typed
        (`01799887766`) and the guest row is normalised (`+8801799887766`). Comparing the
        two strings says "different" for the case where a reviewer most wants to be told
        "same" — and the alternative is each of the two frontends reimplementing
        Bangladeshi phone normalisation (DECISIONS D83).
        """
        from .phones import normalise_phone

        account = normalise_phone(obj.user.phone)
        return bool(account) and account == obj.guest.phone

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_turfs(self, obj) -> list[str]:
        """Where the guest actually played — the first thing a reviewer should ask about."""
        return sorted(
            {
                booking.ground.turf.name
                for booking in obj.guest.bookings.select_related("ground__turf")
            }
        )


class ClaimDecisionSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True)


class ClaimRequestSerializer(serializers.Serializer):
    guest_id = serializers.UUIDField()
    message = serializers.CharField(max_length=300, required=False, allow_blank=True)
