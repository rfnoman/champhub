import { Star } from "lucide-react";
import { cn } from "cn";

/**
 * A rating as five stars.
 *
 * The engine works in 1–99 and keeps doing so — it has to move in small steps as matches
 * land, and it is compared against opponents' averages (DOMAIN §8). But "72" invites an
 * argument about why it is not 75, and five stars says "good player" and stops. The
 * conversion is the backend's (`apps/ratings/stars.py`), so this component renders a
 * number it is given rather than doing arithmetic both apps would have to agree on.
 *
 * Half stars are drawn by clipping a filled star to half its width and laying it over an
 * empty one — one icon, two layers, no half-star asset to keep in step with the whole one.
 *
 * The whole row is one `meter` to a screen reader, announced as "3.5 out of 5", because
 * five separate images called "star" is not a rating.
 */
export function Stars({
  value,
  size = "md",
  showValue = false,
  label,
  className,
}: {
  /** 0–5, in half steps. */
  value: number;
  size?: "sm" | "md" | "lg";
  /** Print the number beside the stars, for a profile headline. */
  showValue?: boolean;
  /** What is being rated, for the accessible name. */
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  const box = size === "lg" ? "size-6" : size === "sm" ? "size-3.5" : "size-4.5";

  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      role="meter"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuetext={`${clamped} / 5`}
    >
      <span className="inline-flex gap-0.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((index) => {
          // How much of *this* star is filled: 1, 0.5 or 0.
          const fill = Math.max(0, Math.min(1, clamped - index));
          return (
            <span key={index} className={cn("relative inline-block shrink-0", box)}>
              <Star className={cn(box, "text-muted-foreground/30 absolute inset-0")} />
              {fill > 0 && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${fill * 100}%` }}
                >
                  <Star className={cn(box, "fill-rating-fair-vivid text-rating-fair-vivid")} />
                </span>
              )}
            </span>
          );
        })}
      </span>
      {showValue && (
        <span className="num text-muted-foreground text-xs font-medium">{clamped.toFixed(1)}</span>
      )}
    </span>
  );
}
