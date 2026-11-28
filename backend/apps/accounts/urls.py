from django.urls import include, path
from rest_framework.routers import SimpleRouter

from .views import (
    AdminClaimDecisionView,
    AdminClaimQueueView,
    AdminIdentityViewSet,
    ClerkWebhookView,
    GuestBookingsView,
    MeView,
    MyClaimView,
    MyIdentityFileView,
    MyIdentitySubmitView,
    MyIdentityView,
    MyUsernameView,
    UsernameCheckView,
)

# No trailing slashes anywhere in this API.
router = SimpleRouter(trailing_slash=False)
router.register("admin/identity-verifications", AdminIdentityViewSet, basename="admin-identity")

urlpatterns = [
    path("me", MeView.as_view(), name="me"),
    path("me/username", MyUsernameView.as_view(), name="my-username"),
    # Not under `me/`: it asks about a handle, not about me, and a later public form of
    # it (a sign-up page, before there is a session) belongs at the same address.
    path("usernames/check", UsernameCheckView.as_view(), name="username-check"),
    path("me/identity", MyIdentityView.as_view(), name="my-identity"),
    path("me/identity/submit", MyIdentitySubmitView.as_view(), name="my-identity-submit"),
    path(
        "me/identity/files/<str:field>",
        MyIdentityFileView.as_view(),
        name="my-identity-file",
    ),
    # Guests have no account, so this is the one booking route outside `me/`.
    path("guest/bookings", GuestBookingsView.as_view(), name="guest-bookings"),
    path("me/account-claim", MyClaimView.as_view(), name="my-account-claim"),
    path("admin/account-claims", AdminClaimQueueView.as_view(), name="admin-account-claims"),
    path(
        "admin/account-claims/<uuid:claim_id>/<str:decision>",
        AdminClaimDecisionView.as_view(),
        name="admin-account-claim-decide",
    ),
    path("webhooks/clerk", ClerkWebhookView.as_view(), name="clerk-webhook"),
    path("", include(router.urls)),
]
