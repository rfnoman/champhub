import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { SectionHeader } from "@/components/layout/section-header";
import { Button } from "@/components/ui/button";
import { getServerApiClient } from "@/lib/api/server";
import { getOwnerTurf } from "@/lib/api/turfs";

import { RentalBoard } from "./rental-board";

export const metadata = { title: "Rentals · ChampHub Turf" };

/** What is out, and who has it (DOMAIN §9). */
export default async function RentalsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const api = await getServerApiClient();

  const [turf, rentals, stock, bookings] = await Promise.all([
    getOwnerTurf(slug),
    api.GET("/api/v1/me/turfs/{slug}/rentals", { params: { path: { slug } } }),
    api.GET("/api/v1/me/turfs/{slug}/stock", { params: { path: { slug } } }),
    api.GET("/api/v1/me/turfs/{slug}/bookings", { params: { path: { slug } } }),
  ]);

  if (!turf) notFound();
  const t = await getTranslations("rentals");

  return (
    <div className="flex flex-col gap-6">
      {/* Rentals has no tab of its own, so it keeps a way back to the shelf. */}
      <SectionHeader
        title={t("heading")}
        actions={
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/turfs/${slug}/inventory`}>{t("backToInventory")}</Link>
          </Button>
        }
      />
      <RentalBoard
        slug={slug}
        rentals={rentals.data ?? []}
        stock={(stock.data ?? []).filter((item) => item.product.kind === "rental")}
        bookings={bookings.data ?? []}
      />
    </div>
  );
}
