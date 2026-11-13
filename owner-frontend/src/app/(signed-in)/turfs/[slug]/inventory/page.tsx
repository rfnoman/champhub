import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { SectionHeader } from "@/components/layout/section-header";
import { Button } from "@/components/ui/button";
import { getServerApiClient } from "@/lib/api/server";
import { getOwnerTurf } from "@/lib/api/turfs";

import { InventoryBoard } from "./inventory-board";

export const metadata = { title: "Inventory · ChampHub Turf" };

/** The owner's shelf: what is on it, what is running out, and what moved. */
export default async function InventoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const api = await getServerApiClient();

  const [turf, stock, categories, log] = await Promise.all([
    getOwnerTurf(slug),
    api.GET("/api/v1/me/turfs/{slug}/stock", { params: { path: { slug } } }),
    api.GET("/api/v1/product-categories"),
    api.GET("/api/v1/me/turfs/{slug}/stock-log", { params: { path: { slug } } }),
  ]);

  if (!turf) notFound();
  const t = await getTranslations("inventory");

  return (
    <div className="flex flex-col gap-6">
      {/* Rentals is the one destination not in the tab strip — it belongs to the shelf,
          so this is where it is reached from. */}
      <SectionHeader
        title={t("heading")}
        body={t("body")}
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href={`/turfs/${slug}/rentals`}>{t("rentals")}</Link>
          </Button>
        }
      />
      <InventoryBoard
        slug={slug}
        stock={stock.data ?? []}
        categories={categories.data ?? []}
        log={log.data ?? []}
      />
    </div>
  );
}
