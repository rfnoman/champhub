import type { ReactNode } from "react";

/**
 * The title row of a page inside a turf.
 *
 * An `<h2>`, not an `<h1>`: the turf's name is the page's heading and is rendered once
 * by `turfs/[slug]/layout.tsx`. This names the section under it — which, with the lit
 * tab in the strip above, is how you know where you are.
 */
export function SectionHeader({
  title,
  body,
  actions,
}: {
  title: string;
  body?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
        {body && <p className="text-muted-foreground text-sm">{body}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
