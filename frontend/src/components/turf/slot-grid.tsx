"use client";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "cn";

import type { Slot } from "@/lib/api/types";
import { Money } from "@/components/ui/money";
import { approxDuration, matchUnitLabel, type MatchTerms } from "@/lib/match-terms";

/**
 * A day's slots for one ground.
 *
 * Unavailable slots are rendered, not hidden: a greyed-out 7pm tells a player the turf
 * is busy, where a gap would read as "closed". `onSelect` is what Phase 03 hangs the
 * booking flow on; without it the grid is a read-only price board.
 *
 * `terms` is how the chosen format is sold (DECISIONS D102). For cricket and badminton
 * a tile is one **match** — "10 overs", priced per match, with the clock reduced to the
 * estimate it actually is.
 */
export function SlotGrid({
  slots,
  selected,
  onSelect,
  terms,
  className,
}: {
  slots: Slot[];
  selected?: string;
  onSelect?: (slot: Slot) => void;
  terms?: MatchTerms;
  className?: string;
}) {
  const t = useTranslations("turfs");
  const c = useTranslations("common");
  const format = useFormatter();
  const unit = matchUnitLabel(terms);
  const approx = unit ? approxDuration(terms?.minutes) : null;

  const grouped = useMemo(() => {
    // Slots that run past midnight belong to the evening they started in, so grouping
    // is by the label the player reads rather than by calendar date.
    return slots.map((slot) => ({
      slot,
      time: format.dateTime(new Date(slot.start), {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Dhaka",
      }),
    }));
  }, [slots, format]);

  if (slots.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("noSlots")}</p>;
  }

  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4", className)}>
      {grouped.map(({ slot, time }) => {
        const isSelected = selected === slot.start;
        const interactive = Boolean(onSelect) && slot.available;

        return (
          <button
            key={slot.start}
            type="button"
            // A stable hook for tests and for Phase 04's deep links into a slot. The
            // visible text is all prices and times, which match each other far too
            // easily to select on.
            data-slot-start={slot.start}
            data-slot-available={slot.available ? "true" : "false"}
            disabled={!interactive}
            aria-pressed={interactive ? isSelected : undefined}
            onClick={() => onSelect?.(slot)}
            title={slot.available ? undefined : t(`slotReason.${slot.reason || "closed"}`)}
            className={cn(
              "press relative flex flex-col items-start gap-0.5 overflow-hidden rounded-xl border px-3 py-2.5 text-left",
              // Minimum 44px even at the smallest text size: this is the control the
              // whole booking flow turns on, tapped on a phone, often outdoors.
              "min-h-11",
              isSelected && "border-brand bg-brand/12 shadow-[0_0_0_1px_var(--brand)]",
              !isSelected &&
                slot.available &&
                "border-border hover:border-brand/40 hover:bg-muted/50",
              // Hatched like ground that is out of play, rather than merely dimmed —
              // the one place the chalk vocabulary carries a state instead of a divide.
              !slot.available &&
                "text-muted-foreground border-border/50 cursor-not-allowed bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,var(--muted)_5px,var(--muted)_7px)]",
              !interactive && slot.available && "cursor-default",
            )}
          >
            <span className="num text-sm font-semibold">{time}</span>
            {unit && (
              /* What is being bought comes before what it costs: a cricket tile is a
                 match, and the hours are only roughly how long it will take. */
              <span className="text-xs leading-tight font-medium">
                {c(unit.key, unit.values)}
                {approx && (
                  <span className="text-muted-foreground font-normal">
                    {" · "}
                    {c(approx.key, approx.values)}
                  </span>
                )}
              </span>
            )}
            <span className="flex w-full items-center justify-between gap-1 text-xs">
              <Money amount={slot.price} className="font-sans" />
              {slot.label && <span className="text-muted-foreground">{slot.label}</span>}
            </span>
            {!slot.available && (
              /* Sentence case: the all-caps version of this was shouting a refusal. */
              <span className="text-[0.6875rem]">{t(`slotReason.${slot.reason || "closed"}`)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
