import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * The page's content column.
 *
 * For eleven phases this lived in `<main>` in the root layout, which capped *every*
 * screen — player, owner and admin — at `max-w-5xl` with no way out. That had two costs:
 * no page could go full-bleed for a hero, and the screens that genuinely needed room
 * (a 765-line turf settings page, three stock tables) were squeezed into the same column
 * as a list of bookings.
 *
 * So `<main>` is now full width and the column moved here, with the route-group layouts
 * choosing a width once for everything inside them.
 *
 * - `default` — the reading column the app was built in, unchanged.
 * - `wide` — owner and admin, where tables and settings panels need the room.
 * - `bleed` — no column at all; the page draws edge to edge and handles its own
 *   padding. Note this is a *container* choice, not a `100vw` trick: `w-screen` inside
 *   a centred parent overflows horizontally once a scrollbar exists, and there is a
 *   launch-journey assertion that the Bangla app does not scroll sideways at 390px.
 */
export function PageContainer({
  children,
  width = "default",
  className,
}: {
  children: ReactNode;
  width?: "default" | "wide" | "bleed";
  className?: string;
}) {
  if (width === "bleed") {
    return <div className={cn("flex w-full flex-1 flex-col", className)}>{children}</div>;
  }

  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-8",
        width === "wide" ? "max-w-7xl" : "max-w-5xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
