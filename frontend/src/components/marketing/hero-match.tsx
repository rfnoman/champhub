"use client";

import { useTranslations } from "next-intl";
import * as m from "motion/react-m";

import { Money } from "@/components/ui/money";

/**
 * The one orchestrated, non-user-triggered motion sequence in the entire app.
 *
 * It is spent here because the hero has to show what the product *is*, and the most
 * characteristic thing in this world is not a feature list — it is a seven-a-side at
 * Banani filling up two hours before kickoff. So the hero's bold object is a live match
 * card with the roster filling in, and everything around it stays still.
 *
 * Everywhere else, motion only answers something the player did (DECISIONS D72).
 */

const FILLED = 4;
const TOTAL = 7;

/** One stagger step, in seconds. */
const STEP = 0.09;

export function HeroMatch() {
  const t = useTranslations("home");

  return (
    <m.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="glass-panel relative w-full max-w-sm overflow-hidden rounded-3xl p-5"
    >
      {/* The floodlight falling across the card. */}
      <div
        aria-hidden
        className="from-brand/18 pointer-events-none absolute inset-x-0 -top-16 h-32 bg-gradient-to-b to-transparent blur-xl"
      />

      <div className="relative flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-brand flex items-center gap-1.5 text-xs font-medium">
              <span className="bg-brand size-1.5 animate-pulse rounded-full" aria-hidden />
              {t("liveTitle")}
            </span>
            <span className="font-display text-xl font-bold tracking-tight">{t("liveWhen")}</span>
            <span className="text-muted-foreground text-sm">{t("liveWhere")}</span>
          </div>
          <span className="glass-panel num rounded-full px-2.5 py-1 text-xs">
            {t("liveFormat")}
          </span>
        </div>

        {/* The roster filling. Each avatar lands one after another, which is the single
            thing on the page that moves on its own — it is the product in one gesture. */}
        <div className="flex items-center gap-1.5" aria-hidden>
          {Array.from({ length: TOTAL }, (_, index) => {
            const taken = index < FILLED;
            return (
              <m.span
                key={index}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  delay: 0.45 + index * STEP,
                  type: "spring",
                  stiffness: 520,
                  damping: 26,
                }}
                className={
                  taken
                    ? "bg-brand/25 ring-brand/50 size-8 flex-1 rounded-full ring-1"
                    : "border-muted-foreground/35 size-8 flex-1 rounded-full border border-dashed"
                }
              />
            );
          })}
        </div>

        <div className="flex items-end justify-between gap-3">
          <span className="text-muted-foreground text-sm">
            {t("liveSpots", { count: TOTAL - FILLED })}
          </span>
          <span className="flex flex-col items-end">
            <Money amount="450.00" className="num text-lg font-bold" />
            <span className="text-muted-foreground text-xs">{t("livePrice")}</span>
          </span>
        </div>
      </div>
    </m.div>
  );
}
