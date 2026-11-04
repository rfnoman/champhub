import { notFound } from "next/navigation";

import { getServerApiClient } from "@/lib/api/server";
import { TurfNav } from "@/components/layout/turf-nav";

import { ManageTurf } from "./manage";

export default async function ManageTurfPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const api = await getServerApiClient();
  const [turf, sports, staff] = await Promise.all([
    api.GET("/api/v1/me/turfs/{slug}", { params: { path: { slug } } }),
    api.GET("/api/v1/sports"),
    api.GET("/api/v1/me/turfs/{slug}/staff", { params: { path: { slug } } }),
  ]);

  if (!turf.data) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display truncate text-2xl font-bold tracking-tight">
            {turf.data.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            {turf.data.area} · {turf.data.address}
          </p>
        </div>
        <TurfNav slug={turf.data.slug} isApproved={turf.data.status === "approved"} />
      </div>

      <ManageTurf turf={turf.data} sports={sports.data ?? []} staff={staff.data ?? []} />
    </div>
  );
}
