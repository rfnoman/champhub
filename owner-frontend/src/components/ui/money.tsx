import { useLocale } from "next-intl";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/i18n/formats";

/**
 * An amount of money.
 *
 * No `"use client"`: `useLocale` works in both Server and Client Components, so a server
 * page renders this without shipping any JavaScript for it, and a client component uses
 * the same one.
 */
export function Money({
  amount,
  className,
}: {
  amount: string | number | null | undefined;
  className?: string;
}) {
  const locale = useLocale();
  return (
    /* `num` rather than `num`: what a price wants is figures that
       line up as the amount changes, not a typewriter face — and until Phase 12
       `--font-mono` pointed at a font that was never loaded, so this fell through to
       the browser default monospace (DECISIONS D74). */
    <span className={cn("num", className)}>{formatMoney(amount, locale)}</span>
  );
}
