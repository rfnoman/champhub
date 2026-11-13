import { getTranslations } from "next-intl/server";
import { cn } from "cn";

import { sportTheme } from "@/lib/sport-theme";

/**
 * Tonight across Dhaka, sliding past — the floor of the hero.
 *
 * A marketplace is worth joining in proportion to how busy it looks, and the honest way
 * to show that is the listings themselves rather than a row of invented totals. The
 * five turfs are the seeded ones (`apps/turfs/demo.py`) and the formats are real
 * `SportFormat` rows, so nothing here claims a scale the product does not have.
 *
 * No JavaScript: the track is one CSS animation (`ticker-track`), and the list is
 * written twice so -50% is a seam-free loop. The second copy is hidden from assistive
 * technology — a screen reader should hear tonight's slots once, not twice — and the
 * track pauses on hover and on focus-within.
 */

/** Each entry carries its sport so the state pill is tinted by it (DECISIONS D73). */
const TONIGHT = [
  { turf: "turf_dhanmondi", sport: "football", format: "liveFormat", at: "21:00", needed: 5 },
  { turf: "turf_mirpur", sport: "cricket", format: "fmt_box", at: "20:00", needed: 3 },
  { turf: "turf_banani", sport: "futsal", format: "fmt_5v5", at: "19:00", needed: 0 },
  { turf: "turf_uttara", sport: "football", format: "fmt_11v11", at: "17:00", needed: 7 },
  { turf: "turf_bashundhara", sport: "badminton", format: "fmt_doubles", at: "20:00", needed: 1 },
  { turf: "turf_dhanmondi", sport: "badminton", format: "fmt_doubles", at: "22:00", needed: 2 },
] as const;

export async function AvailabilityTicker() {
  const t = await getTranslations("home");

  /**
   * One listing. Weight and colour do the separating rather than a string of middle
   * dots: the time is the lit numeral, the turf is the name, the format is quiet, and
   * the state is the only tinted thing in the row.
   */
  const entry = (item: (typeof TONIGHT)[number], copy: number, index: number) => (
    <li
      key={`${copy}-${index}`}
      {...sportTheme(item.sport)}
      className="border-chalk/12 flex shrink-0 items-baseline gap-2.5 border-r pr-5 pl-5 text-sm whitespace-nowrap"
    >
      <span className="num text-brand font-semibold">{item.at}</span>
      <span className="font-medium">{t(item.turf)}</span>
      <span className="text-muted-foreground">{t(item.format)}</span>
      <span
        className={cn(
          "num rounded-full px-2 py-0.5 text-xs",
          item.needed === 0
            ? "text-flare bg-[color-mix(in_oklch,var(--flare)_14%,transparent)]"
            : "text-sport bg-[color-mix(in_oklch,var(--sport)_16%,transparent)]",
        )}
      >
        {item.needed === 0 ? t("tickerFull") : t("tickerNeeded", { needed: item.needed })}
      </span>
    </li>
  );

  return (
    <div
      className="border-chalk/12 relative overflow-hidden border-t"
      aria-label={t("tickerLabel")}
      role="region"
    >
      {/* The list runs out under a fade at both edges rather than stopping at a hard
          crop, which is what makes it read as a longer list passing by. */}
      <div
        aria-hidden
        className="from-pitch pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r to-transparent"
      />
      <div
        aria-hidden
        className="from-pitch pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l to-transparent"
      />

      <div className="ticker-track flex w-max py-3">
        <ul className="flex">{TONIGHT.map((item, index) => entry(item, 0, index))}</ul>
        <ul className="flex" aria-hidden>
          {TONIGHT.map((item, index) => entry(item, 1, index))}
        </ul>
      </div>
    </div>
  );
}
