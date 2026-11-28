"""Seed the sticker catalogue (tasks.md).

Separate from the schema migration so re-running the seed after editing
`apps/ratings/tags.py` is one new `RunPython` rather than an edit to a migration that
has already run everywhere.

The reverse deletes only tags that have never been awarded: a sticker somebody earned is
not a rollback's to take away, and `PlayerTagAward` would cascade with it.
"""

from django.db import migrations

from apps.ratings.tags import TAGS, sync_tags


def seed(apps, schema_editor):
    sync_tags(apps)


def unseed(apps, schema_editor):
    PlayerTag = apps.get_model("ratings", "PlayerTag")
    PlayerTag.objects.filter(key__in=[tag["key"] for tag in TAGS], awards__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("ratings", "0002_player_tags"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
