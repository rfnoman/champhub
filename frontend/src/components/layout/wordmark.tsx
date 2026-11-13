import Link from "next/link";

/**
 * The wordmark, and the one piece of chrome allowed to be silly (DECISIONS D82).
 *
 * Two moving parts, both of them deliberate:
 *
 * - A **ball** sitting on the baseline just past the word, which hops when the link is
 *   hovered or focused. It is `aria-hidden`, so the link's accessible name stays exactly
 *   the wordmark — `smoke.spec.ts` asserts that in both languages.
 * - A **sticker tilt** on the word, which leans further into the hop.
 *
 * The ball trails the word rather than leading it, and the tilt pivots on the word's
 * first baseline corner, so the first letter stays welded to the left edge of the page
 * column that the header, content and footer all share (`align.spec.ts`). A ball in
 * front would have pushed the wordmark ~0.9rem inside that column.
 *
 * The tilt is applied to the word as a single element rather than per letter. A
 * letter-by-letter bob is the obvious playful move and it is the wrong one here: it needs
 * one inline-block span per character, which shatters Bengali conjuncts (the spans break
 * shaping across the cluster) and lets some engines spell the accessible name out as
 * "C h a m p H u b". One rotated box is language-neutral and costs nothing.
 *
 * Nothing plays on load. D72 gives the page exactly one unprompted sequence — the
 * floodlights — and a logo that bounces at every navigation is the kind of charm that
 * wears out by the third visit. This waits to be touched.
 */
export function Wordmark({ label }: { label: string }) {
  return (
    <Link href="/" className="group/wordmark mr-auto inline-flex items-baseline gap-1 rounded-sm">
      <span className="wordmark-text group-hover/wordmark:scale-[1.04] group-hover/wordmark:-rotate-[5deg] group-focus-visible/wordmark:scale-[1.04] group-focus-visible/wordmark:-rotate-[5deg]">
        {label}
      </span>
      <span
        aria-hidden
        className="wordmark-ball group-hover/wordmark:ball-hop group-focus-visible/wordmark:ball-hop"
      />
    </Link>
  );
}
