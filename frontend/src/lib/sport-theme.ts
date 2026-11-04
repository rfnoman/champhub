/**
 * Per-sport colour identity (DECISIONS D73).
 *
 * A football match board and a badminton one are different colours, so you can tell
 * which sport you are looking at without reading. The mechanism is one `data-sport`
 * attribute on a wrapper: `globals.css` redefines `--sport` under it, so a whole subtree
 * re-tints with no JavaScript and no computed class names — which matters because
 * Tailwind's JIT cannot see an interpolated class, the constraint `rating.tsx` already
 * documents.
 *
 * The allowlist is the important part. Sports come from the Django catalogue and admins
 * can approve new ones through the proposal queue, so a fifth sport *will* appear. An
 * unknown slug has to fall back to the house green rather than render untinted.
 */
const THEMED_SPORTS = ["football", "futsal", "cricket", "badminton"] as const;

export type ThemedSport = (typeof THEMED_SPORTS)[number];

export function isThemedSport(slug: string | null | undefined): slug is ThemedSport {
  return THEMED_SPORTS.includes(slug as ThemedSport);
}

/**
 * Spread onto the element that should carry the sport's colour.
 *
 * Returns an empty object for an unknown or missing sport, which leaves `--sport`
 * inherited from `:root` — the brand green — rather than undefined.
 *
 * ```tsx
 * <article {...sportTheme(card.sport.slug)} className="border-sport/40">
 * ```
 */
export function sportTheme(slug: string | null | undefined): { "data-sport"?: ThemedSport } {
  return isThemedSport(slug) ? { "data-sport": slug } : {};
}
