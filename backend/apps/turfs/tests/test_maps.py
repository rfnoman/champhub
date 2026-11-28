"""Reading a Google Maps link (tasks.md).

The shapes here are real ones: each was produced by sharing a place out of Google Maps
on Android, iOS or the desktop site, which is the only way to know what to parse.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from django.core.exceptions import ValidationError

from apps.turfs.maps import (
    coordinates_from,
    directions_url,
    is_short_link,
    parse_map_link,
    point_from,
    resolve_short_link,
)

#: Bashundhara, where the demo turf is.
LAT, LNG = 23.8193, 90.4269


def close(found, latitude=LAT, longitude=LNG):
    assert found is not None
    return abs(found[0] - latitude) < 0.001 and abs(found[1] - longitude) < 0.001


class TestParseMapLink:
    def test_desktop_place_link_prefers_the_place_over_the_camera(self):
        """`!3d/!4d` is the venue; `@` is where the map happened to be looking."""
        url = (
            "https://www.google.com/maps/place/Bashundhara+Sports+Complex/"
            "@23.7501,90.3901,15z/data=!3m1!4b1!4m6!3m5!1s0x3755b8:0x9f!8m2!"
            f"3d{LAT}!4d{LNG}!16s%2Fg%2F11c5"
        )
        assert close(parse_map_link(url))

    def test_dropped_pin_uses_the_camera_position(self):
        assert close(parse_map_link(f"https://www.google.com/maps/@{LAT},{LNG},17z"))

    def test_documented_api_form(self):
        assert close(parse_map_link(f"https://www.google.com/maps/search/?api=1&query={LAT},{LNG}"))

    @pytest.mark.parametrize("key", ["q", "ll", "daddr", "center", "destination"])
    def test_every_coordinate_parameter(self, key):
        assert close(parse_map_link(f"https://maps.google.com/?{key}={LAT},{LNG}"))

    def test_url_encoded_query(self):
        assert close(parse_map_link(f"https://www.google.com/maps?q={LAT}%2C{LNG}"))

    def test_a_bare_pasted_pair_is_accepted(self):
        """People paste the numbers. Refusing that would be pedantry."""
        assert close(parse_map_link(f"{LAT}, {LNG}"))
        assert close(parse_map_link(f"{LAT},{LNG}"))

    def test_negative_coordinates(self):
        assert close(
            parse_map_link("https://www.google.com/maps/@-33.8688,151.2093,15z"), -33.8688, 151.2093
        )

    @pytest.mark.parametrize(
        "raw",
        [
            "",
            "   ",
            "not a link at all",
            "https://champhub.com.bd/turfs/bashundhara",
            "https://maps.app.goo.gl/abcdef",  # a short link carries nothing itself
            "https://www.google.com/maps/place/Some+Turf",  # no coordinates in it
        ],
    )
    def test_unreadable_links_return_none(self, raw):
        assert parse_map_link(raw) is None

    def test_null_island_is_treated_as_a_failed_parse(self):
        """`0,0` is in the Gulf of Guinea and is what a bad parse produces."""
        assert parse_map_link("https://www.google.com/maps/@0,0,15z") is None

    def test_out_of_range_is_refused(self):
        assert parse_map_link("https://www.google.com/maps/@91.5,200.2,15z") is None


class TestShortLinks:
    def test_only_the_share_sheet_hosts_count_as_short(self):
        assert is_short_link("https://maps.app.goo.gl/abc123")
        assert is_short_link("https://goo.gl/maps/abc123")
        assert not is_short_link(f"https://www.google.com/maps/@{LAT},{LNG},15z")
        assert not is_short_link("")

    def test_following_a_short_link_reads_where_it_lands(self):
        expanded = f"https://www.google.com/maps/place/Turf/@{LAT},{LNG},17z"
        with patch("apps.turfs.maps.requests.get") as get:
            get.return_value.url = expanded
            assert close(coordinates_from("https://maps.app.goo.gl/abc123"))
        assert get.call_count == 1

    def test_a_long_link_never_touches_the_network(self):
        with patch("apps.turfs.maps.requests.get") as get:
            coordinates_from(f"https://www.google.com/maps/@{LAT},{LNG},15z")
        get.assert_not_called()

    def test_a_redirect_that_leaves_google_is_refused(self):
        """The allowlist is what stops this from becoming a fetch-anything endpoint."""
        with patch("apps.turfs.maps.requests.get") as get:
            get.return_value.url = "http://169.254.169.254/latest/meta-data/"
            assert resolve_short_link("https://maps.app.goo.gl/abc123") is None

    def test_a_network_failure_is_not_an_exception(self):
        import requests as requests_module

        with patch("apps.turfs.maps.requests.get", side_effect=requests_module.Timeout()):
            assert resolve_short_link("https://maps.app.goo.gl/abc123") is None

    def test_follow_can_be_turned_off(self):
        with patch("apps.turfs.maps.requests.get") as get:
            assert coordinates_from("https://maps.app.goo.gl/abc", follow=False) is None
        get.assert_not_called()


class TestPointFrom:
    def test_longitude_first(self):
        """PostGIS takes `(x, y)`; the swap happens in exactly one place."""
        point = point_from(f"{LAT}, {LNG}")
        assert (round(point.x, 4), round(point.y, 4)) == (round(LNG, 4), round(LAT, 4))
        assert point.srid == 4326

    def test_an_unreadable_link_raises_something_an_owner_can_act_on(self):
        with pytest.raises(ValidationError) as caught:
            point_from("https://example.com/somewhere")
        assert "map_url" in caught.value.message_dict
        assert "Google Maps" in caught.value.message_dict["map_url"][0]


class TestDirectionsUrl:
    def test_it_opens_a_route_rather_than_a_view(self):
        assert directions_url(LAT, LNG) == (
            f"https://www.google.com/maps/dir/?api=1&destination={LAT},{LNG}"
        )

    def test_no_location_means_no_link(self):
        assert directions_url(None, None) == ""
        assert directions_url(LAT, None) == ""
