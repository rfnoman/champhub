"""The QR code a player shows at a counter (tasks.md).

A manager with a queue in front of them should not be typing a handle they have heard
once. The player opens their profile, the manager points a camera at it, and the booking
form opens with that player already chosen.

Two decisions behind that sentence:

* **The code is a plain https link into the owner app**, not an app-specific payload. So
  the *phone's own camera* resolves it — no scanner in our app, no camera permission, no
  QR-reading dependency on the owner side at all. A manager with no ChampHub app
  installed still gets taken to the right page.
* **It carries only the handle**, which is public by design (DOMAIN §1b): it is on the
  profile, it is in search results, and a person hands it out precisely so others can
  name them. A QR that carried a token would be a credential printed on a screen in a
  room full of strangers.

Rendered to SVG server-side with `segno` so neither frontend needs a QR library, and so
the two apps cannot drift into drawing different codes.
"""

from __future__ import annotations

from urllib.parse import quote

import segno
from django.conf import settings


def counter_url(username: str) -> str:
    """The link the code carries: the owner app's walk-in form, player pre-filled."""
    base = (settings.OWNER_APP_BASE_URL or "").rstrip("/")
    return f"{base}/counter?player={quote(username)}"


def counter_qr_svg(username: str, *, scale: int = 6) -> str:
    """An SVG `<svg>` element for this handle, ready to inline.

    `error="m"` (15%) rather than the default: this is read off a phone screen that may
    be scratched, greasy or at an angle, and the extra redundancy costs a few modules.
    `svginline` omits the XML declaration, which is what makes it safe to drop straight
    into a page.
    """
    code = segno.make(counter_url(username), error="m")
    svg = code.svg_inline(scale=scale, border=2, dark="#000", light=None)
    # `currentColor` so the code inverts with the theme — segno will not emit a keyword
    # it cannot parse as a colour, so it is swapped afterwards. A QR drawn in black on
    # the midnight base is a black square.
    return svg.replace('stroke="#000"', 'stroke="currentColor"')
