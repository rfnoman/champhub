import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { SectionHeader } from "@/components/layout/section-header";
import { OrderQueue } from "@/components/store/order-queue";
import { getServerApiClient } from "@/lib/api/server";
import { getOwnerTurf } from "@/lib/api/turfs";

export const metadata = { title: "Orders · ChampHub Turf" };

/** Orders waiting at this turf's counter, beside its bookings. */
export default async function TurfOrdersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const api = await getServerApiClient();

  const [turf, orders] = await Promise.all([
    getOwnerTurf(slug),
    api.GET("/api/v1/me/turfs/{slug}/orders", { params: { path: { slug } } }),
  ]);

  if (!turf) notFound();
  const t = await getTranslations("orderQueue");

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title={t("heading")} body={t("turfBody")} />
      <OrderQueue orders={orders.data ?? []} />
    </div>
  );
}
