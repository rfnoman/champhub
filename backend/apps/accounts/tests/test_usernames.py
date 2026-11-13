"""Handles: the rules, the endpoints, and inviting somebody by one (DOMAIN §1b).

Three things are worth testing here and the rest follows from them:

1. **Only one spelling of a handle can exist.** Case, a pasted ``@``, and two people
   racing for the same word all have to end up at one row.
2. **The rules are the same wherever a handle is written** — the API, onboarding, a
   fixture, the Django admin — because the validator is on the field and the service.
3. **A handle resolves to a player who is not discoverable.** That is the whole point of
   giving somebody your handle, and it is also the rule that is easiest to break by
   accident when "find a player" and "search for players" share code.
"""

from __future__ import annotations

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient

from apps.accounts.services import set_username, user_by_username, username_availability
from apps.accounts.usernames import normalize_username, username_problem
from apps.players.services import complete_onboarding, get_or_create_profile

from .factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user():
    return UserFactory(username=None, first_name="Rafi", last_name="Ahmed")


class TestNormalising:
    """What somebody types, folded into what gets stored."""

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("rafiq", "rafiq"),
            ("  rafiq  ", "rafiq"),
            ("@rafiq", "rafiq"),
            ("@ rafiq", "rafiq"),
            ("Rafiq_Hasan", "rafiq_hasan"),
            ("", ""),
            ("@", ""),
            (None, ""),
        ],
    )
    def test_folds_what_people_actually_type(self, raw, expected):
        assert normalize_username(raw) == expected


class TestTheRules:
    def test_accepts_an_ordinary_handle(self):
        assert username_problem("rafiq_hasan_7") is None

    @pytest.mark.parametrize(
        "value,fragment",
        [
            ("", "Choose a username"),
            ("ra", "at least"),
            ("r" * 21, "at most"),
            ("7rafiq", "start with a letter"),
            ("_rafiq", "start with a letter"),
            ("rafiq hasan", "letters, numbers and underscores"),
            ("rafiq.hasan", "letters, numbers and underscores"),
            ("rafiq-hasan", "letters, numbers and underscores"),
            ("rafiq!", "letters, numbers and underscores"),
            ("রফিক", "English letters"),
            ("admin", "reserved"),
            ("champhub", "reserved"),
            ("settings", "reserved"),
        ],
    )
    def test_each_refusal_says_what_is_wrong(self, value, fragment):
        problem = username_problem(value)
        assert problem is not None
        assert fragment in problem

    def test_a_reserved_word_can_be_added_without_a_deploy(self, settings):
        """`USERNAME_RESERVED` is read through `setting()` (CLAUDE.md)."""
        settings.USERNAME_RESERVED = ("sponsor",)
        assert "reserved" in (username_problem("sponsor") or "")
        assert username_problem("admin") is None  # the list was replaced, not extended

    def test_a_bangla_handle_says_why_in_its_own_words(self):
        """Half this app is in Bangla, so this refusal has to make sense to a reader of it."""
        problem = username_problem(normalize_username("রফিক"))
        assert problem is not None
        assert "link" in problem


class TestSetUsername:
    def test_claims_a_handle(self, user):
        set_username(user=user, username="Rafiq_Hasan")
        user.refresh_from_db()
        assert user.username == "rafiq_hasan"
        assert user.handle == "@rafiq_hasan"

    def test_an_account_without_one_has_an_empty_handle(self, user):
        assert user.username is None
        assert user.handle == ""

    def test_refuses_one_that_is_taken(self, user):
        UserFactory(username="rafiq")
        with pytest.raises(ValidationError) as exc:
            set_username(user=user, username="rafiq")
        assert "taken" in exc.value.message_dict["username"][0]

    def test_refuses_one_taken_in_a_different_case(self, user):
        UserFactory(username="rafiq")
        with pytest.raises(ValidationError):
            set_username(user=user, username="RAFIQ")

    def test_setting_my_own_handle_again_is_not_an_error(self, user):
        set_username(user=user, username="rafiq")
        assert set_username(user=user, username="@Rafiq").username == "rafiq"

    def test_a_change_frees_the_old_handle(self, user):
        set_username(user=user, username="rafiq")
        set_username(user=user, username="rafiq_hasan")

        other = UserFactory(username=None)
        set_username(user=other, username="rafiq")

        user.refresh_from_db()
        other.refresh_from_db()
        assert user.username == "rafiq_hasan"
        assert other.username == "rafiq"

    def test_a_refusal_leaves_the_account_as_it_was(self, user):
        set_username(user=user, username="rafiq")
        UserFactory(username="shanto")
        with pytest.raises(ValidationError):
            set_username(user=user, username="shanto")
        user.refresh_from_db()
        assert user.username == "rafiq"

    def test_the_database_has_the_last_word_on_a_race(self, user):
        """The check can pass for two callers at once; the unique index cannot."""
        UserFactory(username="rafiq")
        with pytest.raises(IntegrityError), transaction.atomic():
            # What `set_username` would do if its "taken?" query had raced.
            user.username = "rafiq"
            user.save(update_fields=["username", "updated_at"])

    def test_the_field_validator_refuses_a_handle_written_around_the_service(self, user):
        """A fixture, a command or the Django admin obeys the same rules."""
        user.username = "Admin"
        with pytest.raises(ValidationError):
            user.full_clean()


class TestAvailability:
    def test_a_free_handle_is_available(self, user):
        answer = username_availability(username="rafiq", user=user)
        assert answer == {"username": "rafiq", "available": True, "reason": ""}

    def test_it_answers_with_the_normalised_handle(self, user):
        """The form shows what would actually be stored, not what was typed."""
        assert username_availability(username="@Rafiq_Hasan", user=user)["username"] == (
            "rafiq_hasan"
        )

    def test_a_taken_handle_is_not(self, user):
        UserFactory(username="rafiq")
        answer = username_availability(username="rafiq", user=user)
        assert answer["available"] is False
        assert "taken" in answer["reason"]

    def test_my_own_handle_reads_as_available(self, user):
        set_username(user=user, username="rafiq")
        assert username_availability(username="rafiq", user=user)["available"] is True

    def test_a_broken_handle_comes_back_with_the_reason_not_an_error(self, user):
        answer = username_availability(username="ra", user=user)
        assert answer["available"] is False
        assert "at least" in answer["reason"]


class TestLookup:
    def test_finds_the_account_behind_a_handle(self, user):
        set_username(user=user, username="rafiq")
        assert user_by_username("@RAFIQ") == user

    def test_returns_none_for_an_unclaimed_handle(self):
        assert user_by_username("nobody_here") is None

    def test_an_empty_handle_never_matches_an_account_without_one(self, user):
        """`username=None` rows must not be reachable by searching for nothing."""
        assert user_by_username("") is None
        assert user_by_username("@") is None


class TestApi:
    def test_setting_a_username_requires_authentication(self, client):
        assert client.put("/api/v1/me/username", {"username": "rafiq"}).status_code == 401

    def test_put_claims_a_handle(self, client, user):
        client.force_authenticate(user)
        response = client.put("/api/v1/me/username", {"username": "@Rafiq_Hasan"}, format="json")
        assert response.status_code == 200
        assert response.data["username"] == "rafiq_hasan"
        assert response.data["handle"] == "@rafiq_hasan"

    def test_put_is_idempotent(self, client, user):
        client.force_authenticate(user)
        client.put("/api/v1/me/username", {"username": "rafiq"}, format="json")
        assert client.put("/api/v1/me/username", {"username": "rafiq"}).status_code == 200

    def test_put_reports_a_taken_handle_on_the_field(self, client, user):
        UserFactory(username="rafiq")
        client.force_authenticate(user)
        response = client.put("/api/v1/me/username", {"username": "rafiq"}, format="json")
        assert response.status_code == 400
        assert "taken" in response.data["username"][0]

    def test_put_reports_a_reserved_handle_on_the_field(self, client, user):
        client.force_authenticate(user)
        response = client.put("/api/v1/me/username", {"username": "admin"}, format="json")
        assert response.status_code == 400
        assert "reserved" in response.data["username"][0]

    def test_me_carries_the_handle(self, client, user):
        set_username(user=user, username="rafiq")
        client.force_authenticate(user)
        response = client.get("/api/v1/me")
        assert response.data["username"] == "rafiq"
        assert response.data["handle"] == "@rafiq"

    def test_me_renders_an_unset_handle_as_empty_not_null(self, client, user):
        client.force_authenticate(user)
        assert client.get("/api/v1/me").data["username"] == ""

    def test_the_check_endpoint_answers_free_and_taken(self, client, user):
        UserFactory(username="rafiq")
        client.force_authenticate(user)

        taken = client.get("/api/v1/usernames/check", {"username": "@Rafiq"})
        assert taken.data == {
            "username": "rafiq",
            "available": False,
            "reason": "That username is taken.",
        }

        free = client.get("/api/v1/usernames/check", {"username": "rafiq_hasan"})
        assert free.data["available"] is True

    def test_the_check_endpoint_requires_authentication(self, client):
        assert client.get("/api/v1/usernames/check", {"username": "rafiq"}).status_code == 401

    def test_the_check_endpoint_is_throttled(self, client, user, monkeypatch):
        """It answers "does this account exist" for any handle (DOMAIN §1b)."""
        from apps.core.throttling import UsernameCheckThrottle

        # Patched on the class: DRF caches `DEFAULT_THROTTLE_RATES` through its own
        # settings object, so a `settings` override only lands if nothing read it yet.
        monkeypatch.setattr(UsernameCheckThrottle, "get_rate", lambda self: "2/hour")
        client.force_authenticate(user)

        assert client.get("/api/v1/usernames/check", {"username": "a_one"}).status_code == 200
        assert client.get("/api/v1/usernames/check", {"username": "a_two"}).status_code == 200
        assert client.get("/api/v1/usernames/check", {"username": "a_three"}).status_code == 429


class TestOnboarding:
    """A handle is required there, and nowhere else asks for one (DECISIONS D93)."""

    def payload(self, **overrides):
        data = {
            "username": "rafiq",
            "attributes": {"stamina": 60, "agility": 60, "speed": 60, "strength": 60},
            "sports": [{"sport": "football", "positions": [], "skills": {}}],
        }
        data.update(overrides)
        return data

    def test_onboarding_claims_the_handle(self, user):
        complete_onboarding(user=user, data=self.payload())
        user.refresh_from_db()
        assert user.username == "rafiq"

    def test_onboarding_without_one_is_refused(self, user):
        with pytest.raises(ValidationError) as exc:
            complete_onboarding(user=user, data=self.payload(username=""))
        assert "username" in exc.value.message_dict

    def test_a_taken_handle_fails_the_whole_wizard(self, user):
        """No half-onboarded profile behind a handle somebody else has."""
        UserFactory(username="rafiq")
        with pytest.raises(ValidationError):
            complete_onboarding(user=user, data=self.payload())

        user.refresh_from_db()
        assert user.username is None
        profile = get_or_create_profile(user)
        assert profile.onboarding_completed is False

    def test_the_api_refuses_a_wizard_with_no_handle(self, client, user):
        client.force_authenticate(user)
        response = client.post(
            "/api/v1/me/onboarding",
            {k: v for k, v in self.payload().items() if k != "username"},
            format="json",
        )
        assert response.status_code == 400
        assert "username" in response.data

    def test_the_profile_carries_the_handle(self, client, user):
        client.force_authenticate(user)
        client.post("/api/v1/me/onboarding", self.payload(), format="json")
        response = client.get("/api/v1/me/profile")
        assert response.data["username"] == "rafiq"
        assert response.data["handle"] == "@rafiq"
