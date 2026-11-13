import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { SectionHeader } from "@/components/layout/section-header";
import { getServerApiClient } from "@/lib/api/server";
import { getOwnerTurf } from "@/lib/api/turfs";

import { CounterPos } from "./counter-pos";

export const metadata = { title: "Counter · ChampHub Turf" };

/** The till. Built for a tablet on a shelf, not a desk. */
export default async function CounterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const api = await getServerApiClient();

  const [turf, stock, categories, sales] = await Promise.all([
    getOwnerTurf(slug),
    api.GET("/api/v1/me/turfs/{slug}/stock", { params: { path: { slug } } }),
    api.GET("/api/v1/product-categories"),
    api.GET("/api/v1/me/turfs/{slug}/counter-sales", { params: { path: { slug } } }),
  ]);

  if (!turf) notFound();
  const t = await getTranslations("counter");

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t("heading")} body={t("body")} />
      <CounterPos
        slug={slug}
        stock={stock.data ?? []}
        categories={categories.data ?? []}
        sales={sales.data ?? []}
      />
    </div>
  );
}
