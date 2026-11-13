"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as m from "motion/react-m";

import { RatingBar, ratingTone } from "@/components/player/rating";
import { sportTheme, type ThemedSport } from "@/lib/sport-theme";

/**
 * "Four sports, one profile" — demonstrated rather than claimed.
 *
 * The sentence is cheap to write and hard to believe, so this makes the reader check
 * it: press a sport and the same three bars glide to that sport's skills, the overall
 * rating changes, and the whole panel re-tints. Two presses and you have seen that a
 * cricketer is not being judged by their football.
 *
 * It is also the first thing in the app to use the per-sport colour identity (D73) for
 * its actual purpose. `data-sport` on the wrapper is all it takes: `globals.css`
 * redefines `--sport` beneath it, so `text-sport` and `border-sport` re-tint with no
 * computed class names — which matters, because Tailwind's JIT cannot see an
 * interpolated class.
 *
 * The skills and their values are real. The labels are the `SportSkill` rows from
 * `apps/sports/catalogue.py` and the numbers are the seeded players' own: Rafi's
 * football and badminton, Nabila's cricket and futsal.
 */

type Profile = {
  sport: ThemedSport;
  rating: number;
  format: string;
  skills: { label: string; value: number }[];
};

const PROFILES: Profile[] = [
  {
    sport: "football",
    rating: 66,
    format: "liveFormat",
    skills: [
      { label: "skill_finishing", value: 62 },
      { label: "skill_passing", value: 71 },
      { label: "skill_positioning", value: 66 },
    ],
  },
  {
    sport: "futsal",
    rating: 64,
    format: "fmt_5v5",
    skills: [
      { label: "skill_finishing", value: 68 },
      { label: "skill_closeControl", value: 64 },
      { label: "skill_passing", value: 60 },
    ],
  },
  {
    sport: "cricket",
    rating: 66,
    format: "fmt_box",
    skills: [
      { label: "skill_batting", value: 66 },
      { label: "skill_bowling", value: 61 },
      { label: "skill_fielding", value: 70 },
    ],
  },
  {
    sport: "badminton",
    rating: 57,
    format: "fmt_doubles",
    skills: [
      { label: "skill_smash", value: 60 },
      { label: "skill_netPlay", value: 52 },
      { label: "skill_footwork", value: 58 },
    ],
  },
];

export function SportShowcase() {
  const t = useTranslations("home");
  const [index, setIndex] = useState(0);
  const active = PROFILES[index];

  return (
    <div className="flex flex-col gap-5">
      {/* --------------------------------------------------------------- Picker */}
      {/* Toggle buttons rather than a tablist, because the panel beneath must *not*
          unmount between sports — that is what lets the bars glide from one profile to
          the next instead of snapping. A radix `Tabs` unmounts its inactive content. */}
      <div role="group" aria-label={t("sportsTitle")} className="flex flex-wrap gap-2">
        {PROFILES.map((profile, position) => (
          <m.button
            key={profile.sport}
            type="button"
            aria-pressed={position === index}
            onClick={() => setIndex(position)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 600, damping: 30 }}
            {...sportTheme(profile.sport)}
            className="font-display duration-base ease-out-quint border-border text-muted-foreground aria-pressed:border-sport/50 aria-pressed:text-sport hover:text-foreground focus-visible:ring-sport/50 h-11 rounded-xl border px-4 text-sm font-semibold tracking-tight transition-colors outline-none focus-visible:ring-2 aria-pressed:bg-[color-mix(in_oklch,var(--sport)_10%,transparent)]"
          >
            {t(`sport_${profile.sport}`)}
          </m.button>
        ))}
      </div>

      {/* ---------------------------------------------------------------- Panel */}
      <div
        {...sportTheme(active.sport)}
        className="glass-panel border-sport/25 duration-base ease-out-quint grid gap-6 rounded-3xl p-6 transition-colors sm:grid-cols-[auto_1fr] sm:gap-8 sm:p-7"
      >
        <div className="flex items-center gap-4 sm:flex-col sm:items-start">
          {/* The overall rating re-mounts on each change so its entrance replays. It is
              the one number on the page big enough to read across a room, which is how
              a rating is meant to feel. */}
          <m.span
            key={active.sport}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={`num text-5xl leading-none font-extrabold ${ratingTone(active.rating)}`}
          >
            {active.rating}
          </m.span>
          <div className="flex flex-col gap-0.5">
            <span className="text-sport font-display text-sm font-semibold">
              {t(`sport_${active.sport}`)}
            </span>
            <span className="text-muted-foreground num text-xs">{t(active.format)}</span>
          </div>
        </div>

        {/* Stable keys by position, so React keeps the same three DOM nodes and
            `RatingBar`'s own width transition carries each bar to its new value. The
            labels swap under the glide, which is the point being made: one scale,
            different sport. */}
        <div className="flex flex-col justify-center gap-2.5">
          {active.skills.map((skill, position) => (
            <RatingBar key={position} label={t(skill.label)} value={skill.value} />
          ))}
        </div>
      </div>
    </div>
  );
}
