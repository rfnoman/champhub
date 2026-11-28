/**
 * How a format is sold, in words (DECISIONS D102).
 *
 * Most grounds are sold by the clock, and an hour is an hour. Cricket and badminton are
 * not: nobody buys ninety minutes of cricket, they buy a 10-over match — so those
 * formats carry a unit ("overs"), a count (10) and an approximate length (120 minutes).
 *
 * The length is the span the booking reserves, but it is shown as an **estimate**: a
 * ten-over match that runs twenty minutes long is a normal evening, and a UI that
 * printed "18:00–20:00" as the thing being bought would be making a promise the sport
 * cannot keep. Hence `approxDuration`, and hence "about 2 hrs" rather than "2:00".
 *
 * The matching keys live in `common` in both message catalogues; this module only
 * decides *which* key, so a Bangla reader gets "প্রায় ২ ঘণ্টা" from the same call.
 */

import type { MatchUnit } from "@/lib/api/types";

/** Whatever carries match terms: a ground's format row, or a booking that bought one. */
export type MatchTerms = {
  booking_unit?: string;
  match_unit?: MatchUnit | "";
  match_unit_count?: number | null;
  /** The slot length for this format on this ground. Absent on a booking. */
  minutes?: number | null;
};

/**
 * Sold as a match rather than by the hour, and complete enough to say so.
 *
 * A booking carries the unit it was sold in but no `booking_unit` — the snapshot *is*
 * the answer — so the unit and count are what decide, and `"time"` is only ever an
 * explicit "no" from a ground's format row.
 */
export function isPerMatch(terms: MatchTerms | null | undefined): boolean {
  if (!terms || terms.booking_unit === "time") return false;
  return Boolean(terms.match_unit && terms.match_unit_count);
}

/**
 * The `common` key and ICU values for "10 overs".
 *
 * Returns `null` for a format sold by the clock, which is the caller's signal to show
 * the time window it already shows.
 */
export function matchUnitLabel(
  terms: MatchTerms | null | undefined,
): { key: string; values: { count: number } } | null {
  if (!isPerMatch(terms)) return null;
  return {
    key: `matchUnit.${terms!.match_unit}`,
    values: { count: terms!.match_unit_count as number },
  };
}

/**
 * The `common` key and ICU values for "about 2 hrs" / "about 45 min" / "about 1 hr 15 min".
 *
 * Whole hours read as hours — "about 120 min" is how a spreadsheet talks, not how a
 * player asks for the pitch.
 */
export function approxDuration(minutes: number | null | undefined): {
  key: string;
  values: { hours?: number; minutes?: number };
} | null {
  if (!minutes || minutes <= 0) return null;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return { key: "approxMinutes", values: { minutes: rest } };
  if (rest === 0) return { key: "approxHours", values: { hours } };
  return { key: "approxHoursMinutes", values: { hours, minutes: rest } };
}
