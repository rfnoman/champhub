"""Turning a Google Maps link into a point, and a point back into directions.

An owner registering a turf does not know its latitude. What they *do* have is the
link the Google Maps app produced when they pressed Share on their own venue, and
that link carries the coordinates — so this module reads them out of it.

Google has no single URL shape; it has a decade of them, and a phone shares the one
that is hardest to read. The ones handled here, in the order they are tried:

* ``…/place/Name/@23.74,90.37,17z/data=!3m1!4b1!4d90.3712!3d23.7401`` — the desktop
  place URL. The ``!3d``/``!4d`` pair at the end is the *place's* position; the
  ``@`` triple is where the **camera** was, which can be a block away. The place wins
  when both are present, and that ordering is the whole reason this is not a one-liner.
* ``…/maps/@23.74,90.37,15z`` — a bare camera position, which is all a dropped pin has.
* ``?q=23.74,90.37`` / ``?query=…`` / ``?ll=…`` / ``?daddr=…`` — the query-parameter
  family, including the documented ``api=1`` form.
* ``23.7401, 90.3712`` — not a URL at all. People paste the coordinates themselves, and
  refusing that would be pedantry.
* ``https://maps.app.goo.gl/xxxx`` — carries nothing; the coordinates are only in what
  it redirects to. :func:`resolve_short_link` follows it, and is the one function here
  that touches the network.

`Point` order is ``(longitude, latitude)``; humans write latitude first. Everything in
this module speaks ``(latitude, longitude)`` and the conversion happens in one place,
:func:`point_from`, because getting that backwards puts a Dhanmondi turf in Antarctica
without raising anything.
"""

from __future__ import annotations

import logging
import re
from urllib.parse import parse_qs, unquote, urlparse

import requests
from django.contrib.gis.geos import Point
from django.core.exceptions import ValidationError

logger = logging.getLogger(__name__)

#: Hosts whose links we will follow a redirect for. An allowlist, not a pattern: this
#: function takes a URL from an unauthenticated-ish place and fetches it, so it must
#: never be talked into fetching ``http://169.254.169.254/`` or a private address.
SHORT_LINK_HOSTS = frozenset(
    {
        "maps.app.goo.gl",
        "goo.gl",
        "maps.google.com",
        "www.google.com",
        "google.com",
    }
)

#: Hosts a full Google Maps link may come from. Apple Maps and OpenStreetMap links are
#: refused with a message rather than silently ignored — the owner pasted *something*.
MAP_HOSTS = frozenset(
    {
        "google.com",
        "www.google.com",
        "maps.google.com",
        "maps.app.goo.gl",
        "goo.gl",
        "google.com.bd",
        "www.google.com.bd",
    }
)

SHORT_LINK_TIMEOUT = 6.0

_COORD = r"(-?\d{1,3}(?:\.\d+)?)"

#: `!3d<lat>!4d<lng>` — the place's own position, in Google's protobuf-ish `data=` blob.
_PLACE_DATA = re.compile(rf"!3d{_COORD}!4d{_COORD}")
#: `@<lat>,<lng>,<zoom>z` — where the camera was pointed.
_AT_CAMERA = re.compile(rf"@{_COORD},{_COORD}")
#: A bare `23.7401, 90.3712` paste.
_BARE_PAIR = re.compile(rf"^\s*{_COORD}\s*,\s*{_COORD}\s*$")

#: Query parameters that carry `lat,lng`, most specific first.
_COORD_PARAMS = ("query", "q", "ll", "sll", "daddr", "center", "destination")


def _valid(latitude: float, longitude: float) -> bool:
    """Whether a pair is on Earth — and not at Null Island.

    ``(0, 0)`` is in the Gulf of Guinea and is what a malformed parse produces, so it is
    treated as a failure to read rather than as a location.
    """
    if latitude == 0 and longitude == 0:
        return False
    return -90 <= latitude <= 90 and -180 <= longitude <= 180


def _pair(raw_lat: str, raw_lng: str) -> tuple[float, float] | None:
    try:
        latitude, longitude = float(raw_lat), float(raw_lng)
    except TypeError, ValueError:
        return None
    return (latitude, longitude) if _valid(latitude, longitude) else None


def parse_map_link(raw: str) -> tuple[float, float] | None:
    """``(latitude, longitude)`` out of a Google Maps link, or ``None``.

    Pure and offline: a short link that has to be followed returns ``None`` here, and
    the caller decides whether reaching out is appropriate (:func:`resolve_short_link`).
    """
    if not raw or not raw.strip():
        return None
    text = unquote(raw.strip())

    bare = _BARE_PAIR.match(text)
    if bare:
        return _pair(*bare.groups())

    # The place's position beats the camera's: on a shared place link the two differ,
    # and only one of them is the turf.
    place = _PLACE_DATA.search(text)
    if place:
        found = _pair(*place.groups())
        if found:
            return found

    camera = _AT_CAMERA.search(text)
    if camera:
        found = _pair(*camera.groups())
        if found:
            return found

    try:
        params = parse_qs(urlparse(text).query)
    except ValueError:
        return None
    for key in _COORD_PARAMS:
        for value in params.get(key, []):
            pair = _BARE_PAIR.match(value)
            if pair:
                found = _pair(*pair.groups())
                if found:
                    return found
    return None


def is_short_link(raw: str) -> bool:
    """Whether this link has to be followed before it can say anything.

    ``maps.app.goo.gl/xyz`` is the share sheet's output and the commonest thing an owner
    will paste. A long ``google.com/maps`` URL that simply failed to parse is *not* a
    short link — following it would be a pointless request.
    """
    if not raw:
        return False
    host = (urlparse(raw.strip()).hostname or "").lower()
    return host in {"maps.app.goo.gl", "goo.gl"}


def resolve_short_link(raw: str, *, timeout: float = SHORT_LINK_TIMEOUT) -> str | None:
    """Follow a Maps short link and return the URL it lands on, or ``None``.

    The one function here that makes a network request, so it is deliberately narrow:
    only the hosts in :data:`SHORT_LINK_HOSTS`, only ``https``, a short timeout, and
    every failure swallowed into ``None`` — an owner whose paste could not be expanded
    should be asked to drag the pin, not shown a traceback from Google.
    """
    url = (raw or "").strip()
    if not is_short_link(url):
        return None
    try:
        response = requests.get(
            url,
            timeout=timeout,
            allow_redirects=True,
            headers={"User-Agent": "ChampHub/1.0 (+https://champhub.com.bd)"},
        )
    except requests.RequestException as exc:
        logger.info("Could not expand map short link", extra={"error": str(exc)})
        return None

    final = response.url or ""
    host = (urlparse(final).hostname or "").lower()
    if host not in SHORT_LINK_HOSTS:
        logger.info("Map short link left Google", extra={"host": host})
        return None
    return final


def coordinates_from(raw: str, *, follow: bool = True) -> tuple[float, float] | None:
    """Read a link, expanding a short one first when ``follow``."""
    direct = parse_map_link(raw)
    if direct:
        return direct
    if follow and is_short_link(raw):
        expanded = resolve_short_link(raw)
        if expanded:
            return parse_map_link(expanded)
    return None


def point_from(raw: str, *, follow: bool = True) -> Point:
    """A link in, a PostGIS point out. Raises ``ValidationError`` when unreadable.

    The single place ``(latitude, longitude)`` becomes ``(x, y)``.
    """
    found = coordinates_from(raw, follow=follow)
    if not found:
        raise ValidationError(
            {
                "map_url": (
                    "That does not look like a Google Maps link with a location in it. "
                    "Open the turf in Google Maps, press Share, copy the link, and paste "
                    "it here — or drag the pin on the map instead."
                )
            }
        )
    latitude, longitude = found
    return Point(longitude, latitude, srid=4326)


def directions_url(latitude: float | None, longitude: float | None) -> str:
    """A Google Maps link that opens *directions* to the turf, not just a view of it.

    ``dir/?api=1&destination=…`` is Google's documented cross-platform form: it opens
    the native app on a phone and the site on a desktop, and lands on the route rather
    than on a map the player then has to tap twice to navigate from.
    """
    if latitude is None or longitude is None:
        return ""
    return f"https://www.google.com/maps/dir/?api=1&destination={latitude},{longitude}"
