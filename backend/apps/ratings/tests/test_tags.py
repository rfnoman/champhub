"""Stickers, and the 1–99 rating shown as stars (tasks.md)."""

from __future__ import annotations

import pytest
from django.core.exceptions import ValidationError

from apps.ratings.models import PlayerTag, PlayerTagAward
from apps.ratings.selectors import tag_catalogue, tags_for
from apps.ratings.stars import stars_from
from apps.ratings.tags import TAGS, sync_tags

pytestmark = pytest.mark.django_db


class TestStars:
    """The engine keeps 1–99; a player reads five stars."""

    @pytest.mark.parametrize(
        ("rating", "expected"),
        [
            (99, 5.0),
            (90, 4.5),
            (80, 4.0),
            (72, 3.5),
            (64, 3.0),
            (50, 2.5),
            (30, 1.5),
            (10, 0.5),
            (1, 0.0),
            (0, 0.0),
            (None, 0.0),
        ],
    )
    def test_linear_in_half_steps(self, rating, expected):
        assert stars_from(rating) == expected

    def test_never_exceeds_five(self):
        """A rating above the scale is a bug elsewhere; six stars would be one here."""
        assert stars_from(140) == 5.0

    def test_a_negative_rating_is_no_stars_rather_than_negative_ones(self):
        assert stars_from(-20) == 0.0


class TestCatalogue:
    def test_the_migration_seeded_it(self):
        assert PlayerTag.objects.count() >= len(TAGS)

    def test_the_tags_from_the_brief_are_there(self):
        keys = set(PlayerTag.objects.values_list("key", flat=True))
        assert {
            "cool_as_cucumber",
            "strong_as_bricks",
            "powerful_as_train",
            "baap_ka_beta",
        } <= keys

    def test_every_tag_has_a_sticker_to_draw(self):
        for tag in PlayerTag.objects.all():
            assert tag.emoji, f"{tag.key} has no emoji"
            assert tag.label_bn, f"{tag.key} has no Bangla label"
            assert tag.tone in PlayerTag.Tone.values

    def test_sync_is_idempotent(self):
        before = PlayerTag.objects.count()
        sync_tags()
        sync_tags()
        assert PlayerTag.objects.count() == before

    def test_a_retired_tag_leaves_the_picker(self):
        PlayerTag.objects.filter(key="sniper").update(is_active=False)
        assert "sniper" not in set(tag_catalogue().values_list("key", flat=True))


class TestProfileTags:
    def test_a_player_with_no_tags_has_an_empty_list(self, player_profile):
        assert tags_for(profile=player_profile) == []

    def test_counted_and_ordered_by_how_often_they_were_given(
        self, player_profile, match_with_roster
    ):
        """The profile says "×7", so the count is the thing being read."""
        match, others = match_with_roster
        cucumber = PlayerTag.objects.get(key="cool_as_cucumber")
        bricks = PlayerTag.objects.get(key="strong_as_bricks")

        for giver in others:
            PlayerTagAward.objects.create(
                match=match, giver=giver, receiver=player_profile.user, tag=cucumber
            )
        PlayerTagAward.objects.create(
            match=match, giver=others[0], receiver=player_profile.user, tag=bricks
        )

        rows = tags_for(profile=player_profile)
        assert [row["key"] for row in rows] == ["cool_as_cucumber", "strong_as_bricks"]
        assert rows[0]["count"] == len(others)
        assert rows[0]["emoji"] == "🥒"

    def test_a_retired_tag_stays_on_the_profile_that_earned_it(
        self, player_profile, match_with_roster
    ):
        """An admin tidying the picker does not take somebody's sticker away."""
        match, others = match_with_roster
        tag = PlayerTag.objects.get(key="sniper")
        PlayerTagAward.objects.create(
            match=match, giver=others[0], receiver=player_profile.user, tag=tag
        )
        PlayerTag.objects.filter(key="sniper").update(is_active=False)

        assert [row["key"] for row in tags_for(profile=player_profile)] == ["sniper"]

    def test_limit_takes_the_commonest(self, player_profile, match_with_roster):
        match, others = match_with_roster
        for index, key in enumerate(("cool_as_cucumber", "engine", "wall")):
            tag = PlayerTag.objects.get(key=key)
            for giver in others[: index + 1]:
                PlayerTagAward.objects.create(
                    match=match, giver=giver, receiver=player_profile.user, tag=tag
                )

        rows = tags_for(profile=player_profile, limit=2)
        assert [row["key"] for row in rows] == ["wall", "engine"]


class TestConstraints:
    def test_nobody_tags_themselves(self, player_profile, match_with_roster):
        match, _ = match_with_roster
        tag = PlayerTag.objects.get(key="wall")
        with pytest.raises(Exception):
            PlayerTagAward.objects.create(
                match=match,
                giver=player_profile.user,
                receiver=player_profile.user,
                tag=tag,
            )

    def test_one_person_cannot_stack_the_same_sticker(self, player_profile, match_with_roster):
        match, others = match_with_roster
        tag = PlayerTag.objects.get(key="engine")
        PlayerTagAward.objects.create(
            match=match, giver=others[0], receiver=player_profile.user, tag=tag
        )
        with pytest.raises(Exception):
            PlayerTagAward.objects.create(
                match=match, giver=others[0], receiver=player_profile.user, tag=tag
            )
