from __future__ import annotations

import json
import logging
import mimetypes

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils.crypto import constant_time_compare
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiParameter,
    extend_schema,
    extend_schema_view,
    inline_serializer,
)
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from svix.webhooks import Webhook, WebhookVerificationError

from apps.core.permissions import IsPlatformAdmin
from apps.core.throttling import GuestLookupThrottle, UsernameCheckThrottle, WebhookThrottle

from .guests import approve_claim, claimable_for, reject_claim, request_claim
from .models import (
    IDENTITY_FILE_FIELDS,
    AccountClaim,
    GuestProfile,
    IdentityStatus,
    IdentityVerification,
)
from .phones import normalise_phone
from .serializers import (
    AccountClaimSerializer,
    AccountPhotoSerializer,
    AdminAccountClaimSerializer,
    AdminIdentityVerificationSerializer,
    ClaimableSerializer,
    ClaimDecisionSerializer,
    ClaimRequestSerializer,
    GuestBookingSerializer,
    GuestLookupSerializer,
    GuestSummarySerializer,
    IdentityDecisionSerializer,
    IdentityDocumentWriteSerializer,
    IdentityVerificationSerializer,
    UsernameAvailabilitySerializer,
    UsernameWriteSerializer,
    UserSerializer,
)
from .services import (
    approve_identity,
    deactivate_user_from_clerk,
    get_or_create_identity,
    reject_identity,
    revoke_identity,
    save_identity_documents,
    set_account_photo,
    set_username,
    submit_identity,
    sync_user_from_clerk,
    username_availability,
)

logger = logging.getLogger(__name__)

SVIX_HEADERS = ("svix-id", "svix-timestamp", "svix-signature")


def _drf_error(exc: DjangoValidationError) -> Response:
    detail = exc.message_dict if hasattr(exc, "message_dict") else {"detail": exc.messages}
    return Response(detail, status=status.HTTP_400_BAD_REQUEST)


def _serve_private_file(file, *, filename_hint: str) -> FileResponse:
    """Stream a document out of the private store.

    Never a redirect to the object and never a signed URL: a link to an NID scan is a
    link that can be pasted, logged by a proxy, or still work after an admin's access is
    taken away. This way the only thing that leaves the building is the bytes, to a
    request that was authorised a moment ago.
    """
    content_type = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
    response = FileResponse(file.open("rb"), content_type=content_type)
    response["Content-Disposition"] = f'inline; filename="{filename_hint}"'
    response["Cache-Control"] = "private, no-store, max-age=0"
    response["X-Content-Type-Options"] = "nosniff"
    return response


class MeView(APIView):
    """The authenticated user, as Django knows them."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        operation_id="me",
        summary="Current user",
        responses={200: UserSerializer},
    )
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    @extend_schema(
        operation_id="me_photo",
        summary="Set my account photo",
        description=(
            "Multipart. The account photograph is shown wherever this person appears and "
            "is what a reviewer compares against their identity document."
        ),
        request={"multipart/form-data": AccountPhotoSerializer},
        responses={200: UserSerializer},
    )
    def patch(self, request):
        payload = AccountPhotoSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        user = set_account_photo(user=request.user, photo=payload.validated_data["photo"])
        return Response(UserSerializer(user).data)


# ---------------------------------------------------------------------------
# Usernames (DOMAIN §1b)
# ---------------------------------------------------------------------------
class MyUsernameView(APIView):
    """Claim or change my handle.

    `PUT` rather than `PATCH`: there is one field, the whole value is replaced, and
    sending it twice has to mean the same thing as sending it once — somebody on a
    Bangladeshi mobile connection taps "save" again when the first attempt looks stuck.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="me_set_username",
        summary="Set my username",
        description=(
            "The @handle other people invite by (DOMAIN §1b). Lowercase letters, digits "
            "and underscores, starting with a letter; a leading `@` and any capitals are "
            "normalised away. Changing it frees the old handle for somebody else."
        ),
        request=UsernameWriteSerializer,
        responses={200: UserSerializer, 400: OpenApiTypes.OBJECT},
        examples=[OpenApiExample("Claim a handle", value={"username": "rafiq_hasan"})],
    )
    def put(self, request):
        payload = UsernameWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            user = set_username(user=request.user, username=payload.validated_data["username"])
        except DjangoValidationError as exc:
            return _drf_error(exc)
        return Response(UserSerializer(user).data)


class UsernameCheckView(APIView):
    """ "Can I have this one?", for a form to ask while somebody types.

    Throttled, and for a reason worth stating: this endpoint answers "does an account
    exist with this handle" for any handle, which is exactly what walking a dictionary
    through it would be for. A handle is public by design — it is printed on a profile
    and pasted into chats — so the limit is on the *rate*, not on the answer.

    Someone's own current handle comes back available, so re-submitting a form that was
    never edited is not an error.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [UsernameCheckThrottle]

    @extend_schema(
        operation_id="username_check",
        summary="Is this username free?",
        parameters=[
            OpenApiParameter(
                "username",
                str,
                description="The handle to test. A leading `@` and capitals are ignored.",
                required=True,
            )
        ],
        responses={200: UsernameAvailabilitySerializer},
    )
    def get(self, request):
        answer = username_availability(
            username=request.query_params.get("username", ""), user=request.user
        )
        return Response(UsernameAvailabilitySerializer(answer).data)


# ---------------------------------------------------------------------------
# Identity verification (DOMAIN §1a)
# ---------------------------------------------------------------------------
class MyIdentityView(APIView):
    """The signed-in person's own identity check: read it, and fill it in."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        operation_id="my_identity",
        summary="My identity verification",
        description="Creates an empty draft on first access, so this never 404s.",
        responses={200: IdentityVerificationSerializer},
    )
    def get(self, request):
        return Response(IdentityVerificationSerializer(get_or_create_identity(request.user)).data)

    @extend_schema(
        operation_id="my_identity_update",
        summary="Save my identity documents",
        description=(
            "Multipart. Allowed while the check is a draft or was rejected; a submitted "
            "or approved one is frozen."
        ),
        request={"multipart/form-data": IdentityDocumentWriteSerializer},
        responses={200: IdentityVerificationSerializer},
    )
    def patch(self, request):
        payload = IdentityDocumentWriteSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        try:
            verification = save_identity_documents(
                user=request.user, data=dict(payload.validated_data)
            )
        except DjangoValidationError as exc:
            return _drf_error(exc)
        return Response(IdentityVerificationSerializer(verification).data)


class MyIdentitySubmitView(APIView):
    """Send the check to the review queue."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="my_identity_submit",
        summary="Submit my identity for review",
        request=None,
        responses={200: IdentityVerificationSerializer},
    )
    def post(self, request):
        try:
            verification = submit_identity(user=request.user)
        except DjangoValidationError as exc:
            return _drf_error(exc)
        return Response(IdentityVerificationSerializer(verification).data)


class MyIdentityFileView(APIView):
    """One of my own document images, streamed back to me.

    Worth having even though the uploader already has the file: it is how the form shows
    what is currently on record, and the alternative — a public URL — is the thing this
    whole arrangement exists to avoid.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="my_identity_file",
        summary="One of my identity documents",
        parameters=[
            OpenApiParameter(
                "field",
                str,
                location=OpenApiParameter.PATH,
                enum=list(IDENTITY_FILE_FIELDS),
            )
        ],
        responses={(200, "image/*"): OpenApiTypes.BINARY},
    )
    def get(self, request, field: str):
        verification = get_or_create_identity(request.user)
        file = verification.file_field(field)
        if file is None:
            return Response({"detail": "No such document."}, status=status.HTTP_404_NOT_FOUND)
        return _serve_private_file(file, filename_hint=f"{field}.jpg")


@extend_schema_view(
    list=extend_schema(
        operation_id="admin_identity_list",
        summary="Identity verification queue",
        parameters=[
            OpenApiParameter("status", str, description="Defaults to `submitted`."),
            OpenApiParameter("q", str, description="Name, email or document number."),
        ],
    ),
    retrieve=extend_schema(operation_id="admin_identity_retrieve", summary="One identity check"),
)
class AdminIdentityViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """The reviewer's side (DOMAIN §1a).

    Platform admins only — and the file endpoint logs every read at WARNING, because
    "who looked at this person's passport" is a question that has to have an answer.
    """

    serializer_class = AdminIdentityVerificationSerializer
    permission_classes = [IsPlatformAdmin]
    queryset = IdentityVerification.objects.none()

    def get_queryset(self):
        rows = IdentityVerification.objects.select_related(
            "user", "user__player_profile", "reviewed_by"
        )
        if self.action != "list":
            return rows

        requested = self.request.query_params.get("status") or IdentityStatus.SUBMITTED
        if requested != "all":
            rows = rows.filter(status=requested)

        query = (self.request.query_params.get("q") or "").strip()
        if query:
            from django.db.models import Q

            rows = rows.filter(
                Q(user__first_name__icontains=query)
                | Q(user__last_name__icontains=query)
                | Q(user__email__icontains=query)
                | Q(document_number__icontains=query)
            )
        # Oldest submission first: a queue, not a stack.
        return rows.order_by("submitted_at", "created_at")

    @extend_schema(
        operation_id="admin_identity_approve",
        summary="Approve an identity check",
        request=IdentityDecisionSerializer,
        responses={200: AdminIdentityVerificationSerializer},
    )
    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        verification = self.get_object()
        payload = IdentityDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            approve_identity(
                verification=verification,
                reviewer=request.user,
                note=payload.validated_data.get("reason", ""),
            )
        except DjangoValidationError as exc:
            return _drf_error(exc)
        return Response(self.get_serializer(verification).data)

    @extend_schema(
        operation_id="admin_identity_reject",
        summary="Reject an identity check",
        request=IdentityDecisionSerializer,
        responses={200: AdminIdentityVerificationSerializer},
    )
    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        verification = self.get_object()
        payload = IdentityDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            reject_identity(
                verification=verification,
                reviewer=request.user,
                reason=payload.validated_data.get("reason", ""),
            )
        except DjangoValidationError as exc:
            return _drf_error(exc)
        return Response(self.get_serializer(verification).data)

    @extend_schema(
        operation_id="admin_identity_revoke",
        summary="Withdraw a verification",
        description="For an approved check that later turns out not to hold.",
        request=IdentityDecisionSerializer,
        responses={200: AdminIdentityVerificationSerializer},
    )
    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        verification = self.get_object()
        payload = IdentityDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            revoke_identity(
                verification=verification,
                reviewer=request.user,
                reason=payload.validated_data.get("reason", ""),
            )
        except DjangoValidationError as exc:
            return _drf_error(exc)
        return Response(self.get_serializer(verification).data)

    @extend_schema(
        operation_id="admin_identity_file",
        summary="A submitted document",
        parameters=[
            OpenApiParameter(
                "field",
                str,
                location=OpenApiParameter.PATH,
                enum=list(IDENTITY_FILE_FIELDS),
            )
        ],
        responses={(200, "image/*"): OpenApiTypes.BINARY},
    )
    @action(detail=True, methods=["get"], url_path="files/(?P<field>[^/.]+)")
    def file(self, request, pk=None, field: str = ""):
        verification = self.get_object()
        document = verification.file_field(field)
        if document is None:
            return Response({"detail": "No such document."}, status=status.HTTP_404_NOT_FOUND)

        logger.warning(
            "Identity document read by an admin",
            extra={
                "verification": str(verification.id),
                "subject": str(verification.user_id),
                "admin": str(request.user.id),
                "field": field,
            },
        )
        return _serve_private_file(document, filename_hint=f"{field}.jpg")


class ClerkWebhookView(APIView):
    """Receive Clerk user events.

    Signature verification is mandatory: the body is untrusted until svix has checked
    it against the endpoint's signing secret (svix also enforces a 5-minute timestamp
    window, which is what stops replays).
    """

    authentication_classes: list = []
    # A scope of its own: without one this would share the anonymous bucket with every
    # signed-out visitor, and a burst of user updates would start being dropped.
    throttle_classes = [WebhookThrottle]
    permission_classes = [AllowAny]

    @extend_schema(
        operation_id="clerk_webhook",
        summary="Clerk webhook receiver",
        description=(
            "Handles `user.created`, `user.updated` and `user.deleted`. Verified with "
            "svix using `CLERK_WEBHOOK_SIGNING_SECRET`."
        ),
        request=None,
        responses={
            200: inline_serializer(
                name="WebhookAccepted",
                fields={
                    "status": serializers.CharField(),
                    "event": serializers.CharField(allow_null=True),
                },
            ),
            400: inline_serializer(
                name="WebhookRejected",
                fields={"detail": serializers.CharField()},
            ),
        },
        examples=[
            OpenApiExample(
                "user.created",
                value={"status": "ok", "event": "user.created"},
                response_only=True,
            )
        ],
    )
    def post(self, request):
        secret = settings.CLERK_WEBHOOK_SIGNING_SECRET
        if not secret:
            logger.error("CLERK_WEBHOOK_SIGNING_SECRET is not set; rejecting webhook.")
            return Response(
                {"detail": "Webhook receiver is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        headers = {name: request.headers.get(name, "") for name in SVIX_HEADERS}
        if not all(headers.values()):
            return Response(
                {"detail": "Missing svix signature headers."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # svix must see the raw body, byte for byte. `verify` raises on failure and
            # returns nothing, so the body is parsed below — only once it is trusted.
            Webhook(secret).verify(request.body, headers)
        except WebhookVerificationError:
            logger.warning("Rejected Clerk webhook with an invalid signature.")
            return Response(
                {"detail": "Invalid webhook signature."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payload = json.loads(request.body)
        except json.JSONDecodeError:
            return Response(
                {"detail": "Body is not valid JSON."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(payload, dict):
            return Response(
                {"detail": "Body is not a webhook event object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        event_type = payload.get("type")
        data = payload.get("data") or {}
        handled = self.handle_event(event_type, data, svix_id=headers["svix-id"])
        return Response({"status": "ok" if handled else "ignored", "event": event_type})

    def handle_event(self, event_type: str | None, data: dict, *, svix_id: str) -> bool:
        """Dispatch a verified event. Returns False for events we do not act on."""
        try:
            match event_type:
                case "user.created" | "user.updated":
                    sync_user_from_clerk(data)
                case "user.deleted":
                    deactivate_user_from_clerk(data)
                case _:
                    logger.info(
                        "Ignoring unhandled Clerk event",
                        extra={"event": event_type, "svix_id": svix_id},
                    )
                    return False
        except ValueError as exc:
            # A malformed payload is the sender's problem, but retrying will not help,
            # so log it and acknowledge rather than make Clerk retry forever.
            logger.error(
                "Malformed Clerk payload: %s",
                exc,
                extra={"event": event_type, "svix_id": svix_id},
            )
            return False
        return True


class GuestBookingsView(APIView):
    """A guest reading their own bookings, with no account (tasks.md).

    Phone **and** code. The number alone identifies a guest but proves nothing, so a
    lookup on it would let anybody who knows a number read a stranger's evening plans.
    The code is handed over at the counter with the booking.

    Public by necessity — the whole point is somebody who has not signed up — and
    throttled for the same reason a sign-in form is: this is a six-character secret and
    the only thing between it and a guessing script is the rate limit.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [GuestLookupThrottle]

    @extend_schema(
        operation_id="guest_bookings",
        summary="A guest's bookings",
        request=GuestLookupSerializer,
        responses={
            200: inline_serializer(
                name="GuestBookings",
                fields={
                    "guest": GuestSummarySerializer(),
                    "bookings": GuestBookingSerializer(many=True),
                },
            ),
            404: GuestLookupSerializer,
        },
    )
    def post(self, request):
        payload = GuestLookupSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        phone = normalise_phone(payload.validated_data["phone"])
        code = payload.validated_data["code"].strip().upper()
        guest = GuestProfile.objects.filter(phone=phone).first() if phone else None

        # One message for a wrong number and a wrong code, so the response cannot be
        # used to find out which numbers exist.
        if guest is None or not constant_time_compare(guest.access_code.upper(), code):
            return Response(
                {"detail": "We could not find bookings for that number and code."},
                status=status.HTTP_404_NOT_FOUND,
            )

        bookings = guest.bookings.select_related("ground__turf", "sport", "sport_format").order_by(
            "-time_range"
        )

        return Response(
            {
                "guest": GuestSummarySerializer(guest).data,
                "bookings": GuestBookingSerializer(bookings, many=True).data,
            }
        )


class MyClaimView(APIView):
    """What this account could claim, and what it has already asked for (tasks.md).

    The offer is driven entirely by the number **this account** gave Clerk — there is no
    way to ask what sits behind somebody else's. See `apps.accounts.guests`.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="my_account_claim",
        summary="Guest bookings this account could claim",
        responses={
            200: inline_serializer(
                name="MyAccountClaim",
                fields={
                    "claimable": ClaimableSerializer(allow_null=True),
                    "claims": AccountClaimSerializer(many=True),
                },
            )
        },
    )
    def get(self, request):
        guest = claimable_for(request.user)
        claims = AccountClaim.objects.filter(user=request.user).select_related("guest")
        return Response(
            {
                "claimable": ClaimableSerializer(guest).data if guest else None,
                "claims": AccountClaimSerializer(claims, many=True).data,
            }
        )

    @extend_schema(
        operation_id="my_account_claim_create",
        summary="Ask for a guest's bookings",
        request=ClaimRequestSerializer,
        responses={201: AccountClaimSerializer},
    )
    def post(self, request):
        payload = ClaimRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        guest = claimable_for(request.user)
        # The id has to match what the offer actually was: accepting any guest id would
        # turn this into "claim anybody's history and hope a reviewer says yes".
        if guest is None or str(guest.id) != str(payload.validated_data["guest_id"]):
            return Response(
                {"guest_id": "There is nothing to claim for this account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            claim = request_claim(
                user=request.user,
                guest=guest,
                message=payload.validated_data.get("message", ""),
            )
        except DjangoValidationError as exc:
            return Response(exc.message_dict, status=status.HTTP_400_BAD_REQUEST)

        return Response(AccountClaimSerializer(claim).data, status=status.HTTP_201_CREATED)


class AdminClaimQueueView(APIView):
    """Claims waiting for a person to look at them (tasks.md)."""

    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(
        operation_id="admin_account_claims",
        summary="Account claims to review",
        parameters=[
            OpenApiParameter("status", str, description="Default `pending`."),
        ],
        responses={200: AdminAccountClaimSerializer(many=True)},
    )
    def get(self, request):
        wanted = request.query_params.get("status") or AccountClaim.Status.PENDING
        claims = (
            AccountClaim.objects.filter(status=wanted)
            .select_related("user", "guest", "reviewed_by")
            .order_by("created_at")
        )
        return Response(AdminAccountClaimSerializer(claims, many=True).data)


class AdminClaimDecisionView(APIView):
    """Approving or rejecting one claim.

    The approval is the whole security model: a phone number is unverified (D9), so a
    person has to decide, and this records who.
    """

    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(
        operation_id="admin_account_claim_decide",
        summary="Approve or reject a claim",
        request=ClaimDecisionSerializer,
        responses={200: AdminAccountClaimSerializer},
    )
    def post(self, request, claim_id, decision):
        claim = get_object_or_404(AccountClaim, id=claim_id)
        payload = ClaimDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        reason = payload.validated_data.get("reason", "")

        try:
            if decision == "approve":
                claim = approve_claim(claim=claim, actor=request.user, reason=reason)
            else:
                claim = reject_claim(claim=claim, actor=request.user, reason=reason)
        except DjangoValidationError as exc:
            return Response(exc.message_dict, status=status.HTTP_400_BAD_REQUEST)

        return Response(AdminAccountClaimSerializer(claim).data)
