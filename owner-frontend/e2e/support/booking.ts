/**
 * The one helper from the player app's booking support this app needs.
 *
 * The rest of that file drives the player-facing booking grid, which does not exist
 * here — a turf's own bookings are made from the walk-in form or arrive through the
 * API.
 */

/** Dhaka-local YYYY-MM-DD, which is what every date control in the app expects. */
export function dhakaDate(offsetDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );
}
