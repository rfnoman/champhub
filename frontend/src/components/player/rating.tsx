import { cn } from "cn";

/**
 * Colour band for a 1–99 rating.
 *
 * Deliberately coarse — four bands read at a glance on a crowded match board, where a
 * continuous gradient would not. Tailwind classes are spelled out in full because the
 * JIT compiler cannot see interpolated class names.
 *
 * Phase 12 moved these off ad-hoc Tailwind palette literals (`emerald-600`/`lime-600`)
 * onto `--rating-*` tokens, which are defined per theme in globals.css — so the bands
 * are tuned in one place and are legible on the midnight base as well as on paper. They
 * have to stay *single* token utilities rather than arbitrary values: the test in
 * `__tests__/rating.test.ts` asserts no `[` appears in what this returns.
 */
export function ratingTone(value: number): string {
  if (value >= 80) return "text-rating-elite";
  if (value >= 65) return "text-rating-strong";
  if (value >= 50) return "text-rating-fair";
  return "text-rating-low";
}

function barTone(value: number): string {
  if (value >= 80) return "bg-rating-elite";
  if (value >= 65) return "bg-rating-strong";
  if (value >= 50) return "bg-rating-fair";
  return "bg-rating-low/50";
}

/** One labelled 1–99 bar, used for both skills and shared attributes. */
export function RatingBar({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-muted-foreground w-24 shrink-0 truncate text-xs" title={label}>
        {label}
      </span>
      <div
        className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full"
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={1}
        aria-valuemax={99}
      >
        <div
          className={cn(
            "duration-slow ease-out-quint h-full rounded-full transition-[width]",
            barTone(value),
          )}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="num w-6 shrink-0 text-right text-xs">{value}</span>
    </div>
  );
}
