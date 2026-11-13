"""Shared factories. Later phases add TurfFactory, BookingFactory and friends."""

from __future__ import annotations

import factory
from factory.django import DjangoModelFactory

from apps.accounts.models import User


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User
        django_get_or_create = ("clerk_id",)
        skip_postgeneration_save = True

    clerk_id = factory.Sequence(lambda n: f"user_test{n:05d}")
    # A handle, because almost every account in the app has one (onboarding requires it,
    # DOMAIN §1b) and a test that forgets it would be testing a state real players are
    # not in. `username=None` for the cases that need an account without one.
    username = factory.Sequence(lambda n: f"player{n:05d}")
    email = factory.LazyAttribute(lambda o: f"{o.clerk_id}@example.com")
    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
    phone = factory.Sequence(lambda n: f"+88017{n:08d}")
    image_url = factory.LazyAttribute(lambda o: f"https://img.clerk.com/{o.clerk_id}")
    is_active = True

    @factory.post_generation
    def password(obj, create, extracted, **kwargs):
        if not create:
            return
        # Clerk owns credentials; set a usable password only when a test asks for one.
        if extracted:
            obj.set_password(extracted)
        else:
            obj.set_unusable_password()
        obj.save(update_fields=["password"])


class PlatformAdminFactory(UserFactory):
    clerk_id = factory.Sequence(lambda n: f"user_admin{n:05d}")
    username = factory.Sequence(lambda n: f"reviewer{n:05d}")
    is_platform_admin = True
