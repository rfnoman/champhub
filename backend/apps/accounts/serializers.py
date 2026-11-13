from __future__ import annotations

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core.utils import player_label

from .models import IDENTITY_FILE_FIELDS, IdentityStatus, IdentityVerification, User
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
