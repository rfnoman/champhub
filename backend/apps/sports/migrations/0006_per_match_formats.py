"""Re-sync the catalogue so cricket and badminton are sold per match (DECISIONS D102).

0005 added the columns; the rows that need them were written by 0002 against a schema
that did not have them yet, so a database migrated from before today still describes a
10-over match as an hour of cricket. ``sync_catalogue`` is idempotent and matches on the
natural keys, so re-running it here updates those rows in place — it is the same call
0002 makes, and the same one ``seed_demo`` makes.
"""

from django.db import migrations

from apps.sports.catalogue import sync_catalogue


def resync(apps, schema_editor):
    sync_catalogue(apps)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("sports", "0005_sportformat_approx_minutes_sportformat_booking_unit_and_more"),
    ]

    operations = [migrations.RunPython(resync, noop)]
