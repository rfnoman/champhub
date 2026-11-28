import { ChevronDown } from "lucide-react";
import { cn } from "cn";

import { Card } from "@/components/ui/card";

/**
 * A card that opens and closes: a title, a line explaining what the section is for, a
 * summary of its current state while shut, and the controls inside.
 *
 * Built on `<details>`/`<summary>` rather than a Radix accordion for two reasons. The
 * accessibility is free and correct — a disclosure triangle is what this is, the browser
 * already handles the keyboard and `aria-expanded`, and screen readers announce it
 * without a single `aria-` attribute from us. And `<details>` keeps its children
 * *mounted* when closed, where Radix unmounts them: these sections hold half-filled
 * forms, and a manager who collapses one to glance at another expects their typing to
 * still be there.
 *
 * `summary` is the point of the whole thing. A shut section that only says "Opening
 * hours" tells an owner nothing, so it says "Open 7 days · 6:00 am – 11:00 pm" and the
 * owner opens it only when that is wrong.
 */
export function Disclosure({
  title,
  hint,
  summary,
  badge,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  /** What this section is for, in one line. Shown open or shut. */
  hint: string;
  /** The current state in a few words, so a shut section still informs. */
  summary?: React.ReactNode;
  /** Anything that needs attention — a count, a warning. */
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden p-0", className)}>
      <details open={defaultOpen} className="group">
        <summary
          className={cn(
            "press flex cursor-pointer list-none items-start gap-3 p-4",
            "hover:bg-muted/40 focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
            // Safari still draws its own triangle without this.
            "[&::-webkit-details-marker]:hidden",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="label-sm">{title}</h2>
              {badge}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
            {summary && (
              // Hidden once open: the controls below say the same thing in more detail,
              // and repeating it just pushes them further down the screen.
              <p className="mt-1.5 text-xs font-medium group-open:hidden">{summary}</p>
            )}
          </div>
          <ChevronDown
            className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="flex flex-col gap-4 border-t px-4 py-4">{children}</div>
      </details>
    </Card>
  );
}
