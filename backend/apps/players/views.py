from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.services import user_by_username
from apps.core.throttling import PlayerSearchThrottle
from apps.sports.models import Sport

from .models import PlayerProfile
from .selectors import player_sport_cards, profile_queryset
from .serializers import (
    OnboardingSerializer,
    PlayerProfileSerializer,
    PlayerSportSerializer,
    PlayerSportWriteSerializer,
    ProfileUpdateSerializer,
    PublicPlayerProfileSerializer,
)
from .services import (
    add_player_sport,
    complete_onboarding,
    get_or_create_profile,
    remove_player_sport,
    update_profile,
)


def _drf_error(exc: DjangoValidationError) -> Response:
    detail = exc.message_dict if hasattr(exc, "message_dict") else {"detail": exc.messages}
    return Response(detail, status=status.HTTP_400_BAD_REQUEST)


def _render(profile: PlayerProfile, serializer_class=PlayerProfileSerializer) -> dict:
    """Serialize a profile with its cards attached.

    Re-fetched through ``profile_queryset`` so the card assembly reads prefetched rows
    and reflects writes made moments earlier in the same request.
    """
    fresh = profile_queryset().get(pk=profile.pk)
    fresh.sport_cards = player_sport_cards(fresh)
    return serializer_class(fresh).data


class MyProfileView(APIView):
    """The signed-in player's own profile."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        operation_id="my_profile",
        summary="My player profile",
        description="Creates the profile on first access, so this never 404s.",
        responses={200: PlayerProfileSerializer},
    )
    def get(self, request):
        profile = get_or_create_profile(request.user)
        return Response(_render(profile))

    @extend_schema(
        operation_id="my_profile_update",
        summary="Update my player profile",
        request=ProfileUpdateSerializer,
        responses={200: PlayerProfileSerializer},
    )
    def patch(self, request):
        profile = get_or_create_profile(request.user)
        payload = ProfileUpdateSerializer(instance=profile, data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        try:
            profile = update_profile(profile=profile, data=dict(payload.validated_data))
        except DjangoValidationError as exc:
            return _drf_error(exc)
        return Response(_render(profile))


class OnboardingView(APIView):
    """Finish onboarding: basic info, shared attributes and the chosen sports."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="my_onboarding",
        summary="Complete onboarding",
        request=OnboardingSerializer,
        responses={200: PlayerProfileSerializer},
    )
    def post(self, request):
        payload = OnboardingSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            profile = complete_onboarding(user=request.user, data=dict(payload.validated_data))
        except DjangoValidationError as exc:
            return _drf_error(exc)
        return Response(_render(profile))


class MySportsView(APIView):
    """Add a sport to my profile, or remove one, after onboarding."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="my_sports_add",
        summary="Add or update one of my sports",
        request=PlayerSportWriteSerializer,
        responses={200: PlayerSportSerializer},
    )
    def post(self, request):
        payload = PlayerSportWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        profile = get_or_create_profile(request.user)
        sport = get_object_or_404(Sport, slug=payload.validated_data["sport"])
        try:
            player_sport = add_player_sport(
                profile=profile,
                sport=sport,
                positions=payload.validated_data.get("positions") or [],
                skills=payload.validated_data.get("skills") or {},
            )
        except DjangoValidationError as exc:
            return _drf_error(exc)
        return Response(PlayerSportSerializer(player_sport).data)


class MySportDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="my_sports_remove",
        summary="Remove one of my sports",
        description=(
            "A sport with match history is hidden rather than deleted, so scorecards and "
            "ratings stay intact (DOMAIN §3)."
        ),
        responses={
            200: inline_serializer(
                name="SportRemoved",
                fields={"status": serializers.CharField()},
            )
        },
    )
    def delete(self, request, slug: str):
        profile = get_or_create_profile(request.user)
        sport = get_object_or_404(Sport, slug=slug)
        remaining = remove_player_sport(profile=profile, sport=sport)
        return Response({"status": "hidden" if remaining else "removed"})


class PlayerDetailView(APIView):
    """Another player's public card.

    ``discoverable`` gates *search* only — a direct link still resolves (DOMAIN §3).
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="players_retrieve",
        summary="A player's public profile",
        responses={200: PublicPlayerProfileSerializer},
    )
    def get(self, request, player_id):
        profile = get_object_or_404(profile_queryset(), pk=player_id)
        return Response(_render(profile, PublicPlayerProfileSerializer))


class PlayerByUsernameView(APIView):
    """The same card, found by handle (DOMAIN §1b).

    This is what makes a handle worth having: somebody says "@rafiq_hasan" in a group
    chat and the person reading it can open the profile, invite them, or both, without
    anybody having to exchange an id.

    Two deliberate choices:

    * **It ignores ``discoverable``.** Handing out a handle is the opposite of hiding,
      and this behaves exactly like the direct profile link it is a prettier form of.
    * **404 when there is no account**, and the same 404 when the handle is malformed —
      "no player with that username" is the only honest answer to both, and splitting
      them would turn the endpoint into a validator for guessing.

    Throttled with the player directory, because walking handles through it would be a
    way to enumerate accounts.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [PlayerSearchThrottle]

    @extend_schema(
        operation_id="players_retrieve_by_username",
        summary="A player's public profile, by username",
        responses={200: PublicPlayerProfileSerializer},
    )
    def get(self, request, username):
        user = user_by_username(username)
        if user is None:
            raise Http404("No player with that username.")
        profile = get_object_or_404(profile_queryset(), user=user)
        return Response(_render(profile, PublicPlayerProfileSerializer))
