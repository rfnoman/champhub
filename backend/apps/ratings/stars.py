"""Turning a 1–99 rating into stars (tasks.md).

The engine's number is a 1–99 scale and stays one: it has to move in small steps as
matches land, it is compared against opponents' averages, and a five-point scale would
round away everything that makes it work (DOMAIN §8).

What it does not have to be is the thing a player *reads*. "72" invites a conversation
about why it is not 75; five stars says "good player" and stops. So the conversion lives
here, server-side, and both frontends render what they are given — rather than each app
carrying its own arithmetic and disagreeing about whether 64 is three stars or three and
a half.

Linear, and rounded to the nearest half star, which is the resolution people can actually
see on a row of five icons. 99 → 5.0, 50 → 2.5, 1 → 0.0 (there is no half-star below a
quarter, and a floor of 0.5 would make the bottom of the scale a lie).
"""

from __future__ import annotations

#: The top of the engine's scale (DOMAIN §8).
MAX_RATING = 99
MAX_STARS = 5


def stars_from(rating: int | float | None) -> float:
    """``0.0``–``5.0`` in half steps, or ``0.0`` when there is no rating yet."""
    if not rating or rating <= 0:
        return 0.0
    exact = min(float(rating), MAX_RATING) / MAX_RATING * MAX_STARS
    return round(exact * 2) / 2
