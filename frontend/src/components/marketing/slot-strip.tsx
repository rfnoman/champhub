"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as m from "motion/react-m";

import { Money } from "@/components/ui/money";

/**
 * The hero's bold object: tonight at one real turf, and you can touch it.
 *
 * A marketing hero usually shows a picture of the thing. The most characteristic
 * moment in this product's world is not a pitch — it is the arithmetic a captain does
 * at 6pm on a Friday: nine o'clock is peak and nearly full, eleven is cheaper and
 * empty, and somebody has to decide. So the hero *is* that decision. Press an hour and
 * the price, the band, the roster and the count to fill all change together, which is
 * the entire product explained in two taps and no sign-in.
 *
 * Everything here is real. The turf, the ground and the prices are the seeded
 * Dhanmondi Arena (`apps/turfs/demo.py`): a weekend 7v7 on the Main Pitch is ৳3,000
 * peak and ৳2,200 after ten, and "Peak"/"Night" are that ground's own `PriceRule`
 * labels. Capacity is `players_per_side × 2` (DOMAIN §6), so a 7-a-side holds 14 and
 * the per-player figure is derived rather than invented.
 *
 * Deliberately *not* here: a call to action. The hero already has two, and a third
 * inside the card — "Hold 21:00" for a visitor who is about to meet a sign-in wall —
 * would be both a muddle and a small lie. The card is the thing you read; the CTA
 * below the headline is the thing you press.
 */

/** 7-a-side: `players_per_side × 2` (DOMAIN §6). */
const CAPACITY = 14;

/**
 * Tonight, 18:00 to 23:00. `roster: null` means the slot is gone — the exclusion
 * constraint on `(ground, time_range)` means those hours are simply not offerable,
 * which is why they are struck through rather than merely dimmed.
 */
const SLOTS = [
  { time: "18:00", price: "3000.00", band: "peak", roster: null },
  { time: "19:00", price: "3000.00", band: "peak", roster: null },
  { time: "20:00", price: "3000.00", band: "peak", roster: 11 },
  { time: "21:00", price: "3000.00", band: "peak", roster: 9 },
  { time: "22:00", price: "2200.00", band: "night", roster: 4 },
  { time: "23:00", price: "2200.00", band: "night", roster: 2 },
] as const;

/** 21:00 — peak, and five short. The slot the product exists for. */
const INITIAL = 3;

/** One stagger step for the roster wave, in seconds. */
const STEP = 0.022;

export function SlotStrip() {
  const t = useTranslations("home");
  const [index, setIndex] = useState(INITIAL);

  const slot = SLOTS[index];
  const joined = slot.roster ?? 0;
  const needed = CAPACITY - joined;
  // Rounded to the taka: nobody splits a ground hire to the paisa, and `Money`
  // would faithfully render the 214.29 that 3000/14 produces.
  const perPlayer = Math.round(Number(slot.price) / CAPACITY);

  return (
    <div className="glass-panel relative w-full overflow-hidden rounded-3xl p-5 sm:max-w-sm">
      {/* The floodlight falling across the top edge of the card. */}
      <div
        aria-hidden
        className="from-brand/20 pointer-events-none absolute inset-x-0 -top-16 h-32 bg-gradient-to-b to-transparent blur-2xl"
      />

      <div className="relative flex flex-col gap-4">
        {/* ------------------------------------------------------------ Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-brand flex items-center gap-1.5 text-xs font-medium">
              <span className="bg-brand size-1.5 animate-pulse rounded-full" aria-hidden />
              {t("liveTitle")}
            </span>
            <span className="font-display truncate text-xl font-bold tracking-tight">
              {t("turf_dhanmondi")}
            </span>
            <span className="text-muted-foreground truncate text-sm">{t("ground_mainPitch")}</span>
          </div>
          <span className="glass-panel num shrink-0 rounded-full px-2.5 py-1 text-xs">
            {t("liveFormat")}
          </span>
        </div>

        {/* ------------------------------------------------------------- Slots */}
        {/* Dividers rather than gaps, for two reasons: six evenly divided cells read as
            a timetable instead of six chips, and the lit indicator can then travel in
            multiples of its own width — `x: "100%"` is exactly one cell — which is how
            this animates without layout projection, a feature the app deliberately does
            not ship (DECISIONS D72). A gap would put the maths out by a fraction. */}
        <div
          role="group"
          aria-label={t("slotsLabel", { turf: t("turf_dhanmondi") })}
          className="divide-chalk/15 border-chalk/15 relative grid grid-cols-6 divide-x rounded-xl border"
        >
          {/* The indicator sits behind the labels and slides between cells. */}
          <m.span
            aria-hidden
            className="bg-brand/18 ring-brand/45 pointer-events-none absolute inset-y-px left-0 w-1/6 rounded-[0.6rem] ring-1 ring-inset"
            animate={{ x: `${index * 100}%` }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          />

          {SLOTS.map((option, position) => {
            const taken = option.roster === null;
            return (
              <m.button
                key={option.time}
                type="button"
                disabled={taken}
                aria-pressed={position === index}
                aria-label={
                  taken
                    ? t("slotTaken", { time: option.time })
                    : t("slotOpen", { time: option.time, needed: CAPACITY - option.roster })
                }
                onClick={() => setIndex(position)}
                whileHover={taken ? undefined : { y: -2 }}
                whileTap={taken ? undefined : { scale: 0.94 }}
                transition={{ type: "spring", stiffness: 600, damping: 30 }}
                className="num focus-visible:ring-brand/60 relative py-2.5 text-center text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-not-allowed sm:text-sm"
              >
                <span
                  aria-hidden
                  className={
                    taken
                      ? "decoration-chalk/50 text-muted-foreground/60 line-through"
                      : position === index
                        ? "text-brand font-semibold"
                        : "text-foreground/80"
                  }
                >
                  {option.time}
                </span>
              </m.button>
            );
          })}
        </div>

        {/* ------------------------------------------------------------ Roster */}
        {/* Fourteen fixed dots whose *state* changes, rather than a list that unmounts
            and remounts. A per-index delay turns the change into a wave across the row,
            which is the roster filling — the gesture this card is here to show. Colour
            is left to CSS, since `var(--brand)` is not a value motion can interpolate;
            the same split as the press physics in D79. */}
        <div className="flex items-center gap-1.5">
          <div className="flex flex-1 items-center gap-[3px]" aria-hidden>
            {Array.from({ length: CAPACITY }, (_, dot) => {
              const taken = dot < joined;
              return (
                <m.span
                  key={dot}
                  animate={{ scale: taken ? 1 : 0.58 }}
                  transition={{
                    delay: dot * STEP,
                    type: "spring",
                    stiffness: 520,
                    damping: 26,
                  }}
                  data-taken={taken || undefined}
                  className="duration-base ease-out-quint border-muted-foreground/40 h-6 flex-1 rounded-full border border-dashed transition-colors data-taken:border-solid data-taken:border-transparent data-taken:bg-[color-mix(in_oklch,var(--brand)_32%,transparent)]"
                />
              );
            })}
          </div>
        </div>

        {/* The count re-mounts on each change, so its entrance animation replays —
            a swap, with no exit to wait for and no AnimatePresence to manage. */}
        <m.p
          key={slot.time}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="text-muted-foreground text-sm"
        >
          {t("rosterState", { joined, needed })}
        </m.p>

        <span aria-hidden className="chalk-line h-px w-full" />

        {/* ------------------------------------------------------------- Price */}
        <m.div
          key={`${slot.time}-price`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-end justify-between gap-3"
        >
          <span className="flex items-baseline gap-2">
            <Money amount={slot.price} className="text-xl font-bold" />
            <span className="text-muted-foreground text-xs">
              {slot.band === "night" ? t("bandNight") : t("bandPeak")}
            </span>
          </span>
          <span className="flex flex-col items-end">
            <Money amount={perPlayer} className="text-sm font-semibold" />
            <span className="text-muted-foreground text-xs">{t("perPlayer")}</span>
          </span>
        </m.div>
      </div>
    </div>
  );
}
