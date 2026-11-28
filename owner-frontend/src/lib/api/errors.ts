/**
 * Turn a DRF error body into something an owner can act on.
 *
 * The backend's validation messages are the useful part — "price rules leave 21:00–22:00
 * uncovered", "that does not look like a Google Maps link" — and flattening them to
 * "something went wrong" sends the owner back to guess. Field names are kept because
 * they say *which* input to fix.
 *
 * Lives here rather than in a component because both the registration form and the turf
 * settings page need it, and two copies drift.
 */
export function describe(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const parts: string[] = [];
  for (const [field, value] of Object.entries(error as Record<string, unknown>)) {
    const message = Array.isArray(value) ? value.join(" ") : String(value);
    parts.push(field === "detail" ? message : `${field}: ${message}`);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}
