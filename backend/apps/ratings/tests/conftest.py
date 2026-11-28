"""These tests are about what the hook does, so the hook has to be attached.

`RatingsConfig.ready()` registers it at startup, but other apps' tests clear the
registry to score cards in isolation. Re-registering here (it is idempotent) means a
ratings test passes or fails on its own merits, whatever ran before it.
"""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def rating_hook_registered():
    from apps.ratings.hooks import on_scorecard_locked
    from apps.scoring.hooks import register_scorecard_locked_hook

    register_scorecard_locked_hook(on_scorecard_locked)


@pytest.fixture
def match_with_roster():
    """A played match, and the roster minus the first player.

    The tag tests need a receiver and several distinct givers who were all in the same
    match — the only shape `PlayerTagAward`'s constraints accept.
    """
    from apps.scoring.tests.factories import played_match

    match = played_match(players=4)
    roster = [entry.player for entry in match.players.select_related("player")]
    return match, roster[1:]


@pytest.fixture
def player_profile(match_with_roster):
    """The first player on that roster, with a profile — the one being tagged."""
    from apps.players.services import get_or_create_profile

    match, others = match_with_roster
    receiver = next(
        entry.player
        for entry in match.players.select_related("player")
        if entry.player not in others
    )
    return get_or_create_profile(receiver)
