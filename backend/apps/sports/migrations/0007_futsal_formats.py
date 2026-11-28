"""Futsal gains 6v6, 7v7 and 8v8, and 4v4 sorts before 5v5 (tasks.md).

``sync_catalogue`` matches formats on ``(sport, slug)``, so the three new rows are
created and the two existing ones have their ``order`` corrected in place — no ground's
``sport_formats`` selection is disturbed.

Reversing this is a no-op rather than a delete: a ground may have been sold a 7v7 futsal
slot by then, and a booking that references a format cannot have that format removed from
under it.
"""

from django.db import migrations

from apps.sports.catalogue import sync_catalogue


def resync(apps, schema_editor):
    sync_catalogue(apps)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("sports", "0006_per_match_formats"),
    ]

    operations = [migrations.RunPython(resync, noop)]
