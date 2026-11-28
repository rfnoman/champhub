"""The seeded sticker catalogue (tasks.md).

What a rating cannot say. A number tells you somebody is a 72; it does not tell you they
never lose their head, or that they will run all evening, or that their father played and
it shows. These are the things people actually say walking off the pitch, so they are the
things worth collecting.

Written in the register they are said in — Dhaka football is bilingual, and "baap ka beta"
is not improved by translating it. The Bangla column is the same joke in Bengali script
rather than a literal rendering, which is why a couple of them are not word-for-word.

Like `apps.sports.catalogue`, this is plain data plus an idempotent `sync_tags` so a
migration and `seed_demo` share one definition and re-running either is safe. Rows removed
from this file are left alone: an award somebody earned is not an edit's to delete.
"""

from __future__ import annotations

from typing import Any

TAGS: list[dict[str, Any]] = [
    {
        "key": "cool_as_cucumber",
        "label": "Cool as a cucumber",
        "label_bn": "ঠান্ডা মাথার খেলোয়াড়",
        "emoji": "🥒",
        "description": "Never rattled. Same player at 0–3 as at 3–0.",
        "tone": "cool",
        "order": 1,
    },
    {
        "key": "strong_as_bricks",
        "label": "Strong as bricks",
        "label_bn": "ইটের মতো শক্ত",
        "emoji": "🧱",
        "description": "You do not get them off the ball. You just do not.",
        "tone": "steel",
        "order": 2,
    },
    {
        "key": "powerful_as_train",
        "label": "Powerful as a train",
        "label_bn": "ট্রেনের মতো গতি",
        "emoji": "🚂",
        "description": "Gets going and nothing in front of them matters.",
        "tone": "fire",
        "order": 3,
    },
    {
        "key": "baap_ka_beta",
        "label": "Baap ka beta",
        "label_bn": "বাপ কা বেটা",
        "emoji": "👑",
        "description": "Born to it. You can tell.",
        "tone": "gold",
        "order": 4,
    },
    {
        "key": "wall",
        "label": "The wall",
        "label_bn": "দেয়াল",
        "emoji": "🧤",
        "description": "Nothing got past. Ask the strikers.",
        "tone": "steel",
        "order": 5,
    },
    {
        "key": "engine",
        "label": "Engine",
        "label_bn": "ইঞ্জিন",
        "emoji": "🫁",
        "description": "Ran the whole match and was still running at the end.",
        "tone": "grass",
        "order": 6,
    },
    {
        "key": "silk_touch",
        "label": "Silk touch",
        "label_bn": "রেশমি টাচ",
        "emoji": "🪄",
        "description": "First touch takes it out of the air and puts it to sleep.",
        "tone": "cool",
        "order": 7,
    },
    {
        "key": "sniper",
        "label": "Sniper",
        "label_bn": "স্নাইপার",
        "emoji": "🎯",
        "description": "Sees the corner before anybody else sees the chance.",
        "tone": "fire",
        "order": 8,
    },
    {
        "key": "captain_material",
        "label": "Captain material",
        "label_bn": "ক্যাপ্টেনের মতো",
        "emoji": "🧭",
        "description": "Organised everyone and nobody minded being organised.",
        "tone": "gold",
        "order": 9,
    },
    {
        "key": "always_shows_up",
        "label": "Always shows up",
        "label_bn": "সবসময় হাজির",
        "emoji": "📅",
        "description": "Said yes, turned up, on time, again.",
        "tone": "grass",
        "order": 10,
    },
    {
        "key": "good_sport",
        "label": "Good sport",
        "label_bn": "খেলোয়াড়সুলভ",
        "emoji": "🤝",
        "description": "Lost well, won well, argued with nobody.",
        "tone": "grass",
        "order": 11,
    },
    {
        "key": "last_minute_hero",
        "label": "Last-minute hero",
        "label_bn": "শেষ মুহূর্তের নায়ক",
        "emoji": "⏱️",
        "description": "The match was over. Then it was not.",
        "tone": "fire",
        "order": 12,
    },
]


def sync_tags(registry=None) -> int:
    """Upsert the catalogue. Idempotent; matched on `key`.

    Takes the migration's historical model registry when a migration calls it, and the
    live models otherwise — the same arrangement `apps.sports.catalogue.sync_catalogue`
    uses, and for the same reason.
    """
    if registry is None:
        from .models import PlayerTag
    else:
        PlayerTag = registry.get_model("ratings", "PlayerTag")

    fields = {field.name for field in PlayerTag._meta.get_fields()}
    for spec in TAGS:
        defaults = {key: value for key, value in spec.items() if key != "key" and key in fields}
        defaults["is_active"] = True
        PlayerTag.objects.update_or_create(key=spec["key"], defaults=defaults)
    return len(TAGS)
