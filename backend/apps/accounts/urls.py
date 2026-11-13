from django.urls import include, path
from rest_framework.routers import SimpleRouter

from .views import (
    AdminIdentityViewSet,
    ClerkWebhookView,
    MeView,
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
    path("webhooks/clerk", ClerkWebhookView.as_view(), name="clerk-webhook"),
    path("", include(router.urls)),
]
