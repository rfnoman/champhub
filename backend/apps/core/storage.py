"""Where files go, when "where" is a security question.

Most uploads in this product are photographs meant to be looked at: a turf, a player,
a product. They live in the default store, which is world-readable on purpose.

Identity documents are the exception, and the difference is not a detail — a public ACL
on a scan of somebody's NID is a data breach with a URL. Everything here exists to keep
those two kinds of file in two different places, and to make the private one awkward to
serve by accident: the storage it returns has no base URL, so asking a document for its
`.url` raises instead of handing out a link.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from django.core.files.storage import FileSystemStorage, storages
from django.utils.translation import gettext_lazy as _


class PrivateFileSystemStorage(FileSystemStorage):
    """A local store with no public URL, and one that refuses to invent one.

    `FileSystemStorage` falls back to `MEDIA_URL` when no `base_url` is configured, so
    "leave it unset" would quietly produce `/media/identity/<file>` — a link that is
    wrong rather than absent, and the kind of wrong that works the day somebody points a
    web server at the wrong directory. Raising is the honest answer: nothing in this
    codebase may hand out a link to an identity document.
    """

    def url(self, name):
        raise ValueError(
            _("Identity documents are not served by URL. Stream them through the API instead.")
        )


def private_storage():
    """The private store (``settings.STORAGES["private"]``).

    A callable rather than the storage object itself, because a model field evaluates it
    lazily — settings are not loaded when `models.py` is imported, and a migration that
    captured a configured storage instance would pin development's filesystem paths into
    the migration file forever.
    """
    return storages["private"]


def identity_upload_path(instance, filename: str) -> str:
    """``identity/<user id>/<random>.<ext>``.

    The original filename is thrown away rather than slugified. "nid-front.jpg" tells an
    attacker who finds a listing what they have found, and people name these files
    things like "my passport scan.jpg"; a random name says nothing. The account id in
    the path is for support — it makes an orphaned object traceable to a person who can
    be told about it.
    """
    suffix = Path(filename).suffix.lower()[:10]
    return f"identity/{instance.user_id}/{uuid.uuid4().hex}{suffix}"
