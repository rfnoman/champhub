import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import { approxDuration, isPerMatch, matchUnitLabel } from "../match-terms";

/** What the API can send as a `match_unit` (schema: MatchUnitEnum). */
const UNITS = ["overs", "games", "sets", "innings", "rounds"] as const;

const cricket = {
  booking_unit: "match",
  match_unit: "overs",
  match_unit_count: 10,
  minutes: 120,
} as const;

const football = {
  booking_unit: "time",
  match_unit: "",
  match_unit_count: null,
  minutes: 60,
} as const;

describe("isPerMatch", () => {
  it("recognises a ground's per-match format", () => {
    expect(isPerMatch(cricket)).toBe(true);
  });

  it("says no to a format sold by the clock", () => {
    expect(isPerMatch(football)).toBe(false);
  });

  it("recognises a booking, which carries no booking_unit", () => {
    expect(isPerMatch({ match_unit: "games", match_unit_count: 3 })).toBe(true);
    expect(isPerMatch({ match_unit: "", match_unit_count: null })).toBe(false);
  });

  it("refuses an incomplete format rather than rendering half a label", () => {
    expect(isPerMatch({ booking_unit: "match", match_unit: "overs" })).toBe(false);
    expect(isPerMatch(undefined)).toBe(false);
  });
});

describe("matchUnitLabel", () => {
  it("names the key and the count", () => {
    expect(matchUnitLabel(cricket)).toEqual({ key: "matchUnit.overs", values: { count: 10 } });
  });

  it("is null for an hourly format, which has a time window to show instead", () => {
    expect(matchUnitLabel(football)).toBeNull();
  });

  it("has a message for every unit the API can send", () => {
    // The key is built at runtime, so the static message scan cannot see it.
    const messages = en.common.matchUnit as Record<string, string>;
    expect(UNITS.filter((unit) => !messages[unit])).toEqual([]);
  });
});

describe("approxDuration", () => {
  it("reads whole hours as hours", () => {
    expect(approxDuration(120)).toEqual({ key: "approxHours", values: { hours: 2 } });
    expect(approxDuration(60)).toEqual({ key: "approxHours", values: { hours: 1 } });
  });

  it("reads under an hour as minutes", () => {
    expect(approxDuration(45)).toEqual({ key: "approxMinutes", values: { minutes: 45 } });
  });

  it("splits the awkward ones", () => {
    expect(approxDuration(75)).toEqual({
      key: "approxHoursMinutes",
      values: { hours: 1, minutes: 15 },
    });
  });

  it("has nothing to say about no duration", () => {
    expect(approxDuration(0)).toBeNull();
    expect(approxDuration(null)).toBeNull();
    expect(approxDuration(undefined)).toBeNull();
  });

  it("every key it can return exists in the catalogue", () => {
    const messages = en.common as Record<string, unknown>;
    for (const minutes of [45, 60, 75]) {
      expect(typeof messages[approxDuration(minutes)!.key]).toBe("string");
    }
  });
});
