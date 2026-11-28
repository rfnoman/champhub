"""The seeded catalogue and its re-sync."""

from __future__ import annotations

import pytest
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction

from apps.sports.catalogue import ATTRIBUTES, SPORTS, sync_catalogue
from apps.sports.models import (
    Attribute,
    BookingUnit,
    Sport,
    SportFormat,
    SportSkill,
    StatDefinition,
)

pytestmark = pytest.mark.django_db


def test_migration_seeded_every_sport():
    assert Sport.objects.count() == len(SPORTS)
    assert set(Sport.objects.values_list("slug", flat=True)) == {s["slug"] for s in SPORTS}


def test_shared_attributes_are_seeded_in_order():
    keys = list(Attribute.objects.values_list("key", flat=True))
    assert keys == [a["key"] for a in ATTRIBUTES]


def test_football_has_formats_skills_weights_and_stats():
    football = Sport.objects.get(slug="football")
    assert {f.slug for f in football.formats.all()} >= {"5v5", "7v7"}
    assert football.formats.get(slug="7v7").capacity == 14
    assert {s.key for s in football.skills.all()} >= {"finishing", "passing", "defending"}
    assert football.attribute_weights.count() == len(ATTRIBUTES)
    assert {s.key for s in football.stat_definitions.all()} >= {
        "goals",
        "assists",
        "saves",
        "clean_sheet",
        "yellow",
        "red",
        "minutes_played",
    }


def test_cricket_and_badminton_stats_match_domain():
    cricket = {s.key for s in Sport.objects.get(slug="cricket").stat_definitions.all()}
    assert cricket >= {"runs", "balls", "wickets", "overs", "runs_conceded", "catches"}
    badminton = {s.key for s in Sport.objects.get(slug="badminton").stat_definitions.all()}
    assert badminton >= {"sets_won", "points_won"}


def test_every_sport_records_minutes_played():
    for sport in Sport.objects.all():
        assert sport.stat_definitions.filter(key="minutes_played").exists()


def test_cards_are_marked_as_negative_stats():
    yellow = StatDefinition.objects.get(sport__slug="football", key="yellow")
    assert yellow.is_positive is False
    goals = StatDefinition.objects.get(sport__slug="football", key="goals")
    assert goals.is_positive is True


def test_goalkeeping_is_excluded_from_the_overall():
    """Only keepers rate it, so it must not drag an outfielder's overall down."""
    keeping = SportSkill.objects.get(sport__slug="football", key="goalkeeping")
    assert keeping.counts_toward_overall is False


def test_sync_is_idempotent():
    before = (
        Sport.objects.count(),
        SportSkill.objects.count(),
        StatDefinition.objects.count(),
        Attribute.objects.count(),
    )
    sync_catalogue()
    sync_catalogue()
    after = (
        Sport.objects.count(),
        SportSkill.objects.count(),
        StatDefinition.objects.count(),
        Attribute.objects.count(),
    )
    assert before == after


def test_sync_updates_edited_rows_in_place():
    football = Sport.objects.get(slug="football")
    football.met_value = 1
    football.save(update_fields=["met_value"])

    sync_catalogue()

    football.refresh_from_db()
    assert str(football.met_value) == "7.00"
    assert football.id == Sport.objects.get(slug="football").id


class TestFutsalFormats:
    """A futsal court sells more than five a side (tasks.md)."""

    def test_every_side_size_from_four_to_eight_is_on_offer(self):
        futsal = Sport.objects.get(slug="futsal")
        assert [f.slug for f in futsal.formats.all()] == ["4v4", "5v5", "6v6", "7v7", "8v8"]

    def test_capacity_is_both_sides(self):
        assert SportFormat.objects.get(sport__slug="futsal", slug="8v8").capacity == 16

    def test_futsal_is_still_sold_by_the_clock(self):
        """Adding sizes must not make futsal a per-match sport (D102)."""
        for slug in ("6v6", "7v7", "8v8"):
            fmt = SportFormat.objects.get(sport__slug="futsal", slug=slug)
            assert fmt.booking_unit == BookingUnit.TIME
            assert fmt.is_per_match is False


class TestPerMatchFormats:
    """Cricket and badminton are counted in overs and games, not hours (D102)."""

    def test_box_cricket_is_ten_overs_in_about_two_hours(self):
        box = SportFormat.objects.get(sport__slug="cricket", slug="box")
        assert box.is_per_match
        assert (box.match_unit, box.match_unit_count, box.approx_minutes) == ("overs", 10, 120)

    def test_badminton_is_counted_in_games(self):
        doubles = SportFormat.objects.get(sport__slug="badminton", slug="doubles")
        assert (doubles.match_unit, doubles.match_unit_count) == ("games", 3)

    def test_nets_practice_is_still_sold_by_the_clock(self):
        """Not every cricket format is a match — nets are an hour of throwing balls."""
        nets = SportFormat.objects.get(sport__slug="cricket", slug="nets")
        assert nets.is_per_match is False
        assert nets.approx_minutes is None

    def test_football_is_untouched(self):
        assert SportFormat.objects.get(sport__slug="football", slug="5v5").booking_unit == (
            BookingUnit.TIME
        )

    def test_a_per_match_format_without_a_unit_is_refused_by_the_database(self):
        football = Sport.objects.get(slug="football")
        with pytest.raises(IntegrityError), transaction.atomic():
            SportFormat.objects.create(
                sport=football,
                name="Nonsense",
                slug="nonsense",
                players_per_side=5,
                booking_unit=BookingUnit.MATCH,
            )

    def test_the_admin_hears_about_it_before_postgres_does(self):
        incomplete = SportFormat(
            sport=Sport.objects.get(slug="football"),
            name="Nonsense",
            slug="nonsense",
            players_per_side=5,
            booking_unit=BookingUnit.MATCH,
        )
        with pytest.raises(DjangoValidationError) as caught:
            incomplete.full_clean()
        assert set(caught.value.message_dict) >= {
            "match_unit",
            "match_unit_count",
            "approx_minutes",
        }
