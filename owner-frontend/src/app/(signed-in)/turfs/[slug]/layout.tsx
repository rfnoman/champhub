import { notFound } from "next/navigation";

import { TurfNav } from "@/components/layout/turf-nav";
import { Badge } from "@/components/ui/badge";
import { getOwnerTurf } from "@/lib/api/turfs";
import type { OwnerTurf } from "@/lib/api/types";

/** Review state drives the badge colour: a rejection should not look like an approval. */
function statusTone(status: OwnerTurf["status"]) {
  switch (status) {
    case "approved":
      return "default" as const;
    case "rejected":
    case "suspended":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

/**
 * The frame every page of one turf sits in: which turf, what state it is in, and the
 * tab strip between its destinations.
 *
 * In the player app each of these pages repeated that header itself — six copies of the
 * turf name as an `<h1>`, and a different ad-hoc "back to the turf" button on each. A
 * layout renders it once, which is also what makes the tab strip persist across
 * navigations instead of being re-mounted by every page.
 *
 * The turf is fetched here *and* by the page inside; `getOwnerTurf` is memoised per
 * request, so that is one call.
 */
export default async function TurfLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const turf = await getOwnerTurf(slug);
  if (!turf) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-display truncate text-2xl font-bold tracking-tight">{turf.name}</h1>
            <Badge variant={statusTone(turf.status)}>{turf.status_label}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {turf.area} · {turf.address}
          </p>
        </div>
        <TurfNav slug={turf.slug} isApproved={turf.status === "approved"} />
      </div>

      {children}
    </div>
  );
}
