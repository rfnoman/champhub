import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { SectionHeader } from "@/components/layout/section-header";
import { getServerApiClient } from "@/lib/api/server";
import { getOwnerTurf } from "@/lib/api/turfs";

import { TurfCalendar } from "./calendar";

export const metadata = { title: "Bookings · ChampHub Turf" };

/** Dhaka-local YYYY-MM-DD: a turf's day is a local day, not a UTC one. */
function dhakaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
}

export default async function TurfBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string; player?: string }>;
}) {
  const [{ slug }, { date, player }] = await Promise.all([params, searchParams]);
  const day = date ?? dhakaToday();

  const api = await getServerApiClient();
  const [turf, bookings, pending] = await Promise.all([
    getOwnerTurf(slug),
    api.GET("/api/v1/me/turfs/{slug}/bookings", {
      params: { path: { slug }, query: { date: day } },
    }),
    api.GET("/api/v1/me/turfs/{slug}/bookings/pending", { params: { path: { slug } } }),
  ]);

  if (!turf) notFound();
  const t = await getTranslations("turfCalendar");

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title={t("day")} body={t("body")} />
      <TurfCalendar
        turf={turf}
        date={day}
        bookings={bookings.data ?? []}
        pending={pending.data ?? []}
        // Arrives from a scanned QR code via `/counter` — the walk-in form opens with
        // this player already searched for (tasks.md).
        prefillPlayer={player ?? ""}
      />
    </div>
  );
}
