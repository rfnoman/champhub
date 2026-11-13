from django.urls import path

from .views import (
    MyProfileView,
    MySportDetailView,
    MySportsView,
    OnboardingView,
    PlayerByUsernameView,
    PlayerDetailView,
)

urlpatterns = [
    path("me/profile", MyProfileView.as_view(), name="my-profile"),
    path("me/onboarding", OnboardingView.as_view(), name="my-onboarding"),
    path("me/sports", MySportsView.as_view(), name="my-sports"),
    path("me/sports/<slug:slug>", MySportDetailView.as_view(), name="my-sport-detail"),
    path("players/<uuid:player_id>", PlayerDetailView.as_view(), name="player-detail"),
    # A separate path rather than one that takes either, so neither has to guess what it
    # was handed: `<uuid:...>` already refuses a handle, and `@rafiq` in a URL is the
    # shape people paste (DOMAIN §1b).
    path(
        "players/by-username/<str:username>",
        PlayerByUsernameView.as_view(),
        name="player-by-username",
    ),
]
