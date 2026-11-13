import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { SectionHeader } from "@/components/layout/section-header";
import { getServerApiClient } from "@/lib/api/server";
import { getOwnerTurf } from "@/lib/api/turfs";

import { ManageTurf } from "./manage";

export const metadata = { title: "Turf settings · ChampHub Turf" };

export default async function ManageTurfPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // The turf comes from the same memoised call the layout used, so this is two
  // requests rather than three.
  const api = await getServerApiClient();
  const [turf, sports, staff] = await Promise.all([
    getOwnerTurf(slug),
    api.GET("/api/v1/sports"),
    api.GET("/api/v1/me/turfs/{slug}/staff", { params: { path: { slug } } }),
  ]);

  if (!turf) notFound();
  const t = await getTranslations("ownerManage");

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title={t("navSettings")} body={t("settingsBody")} />
      <ManageTurf turf={turf} sports={sports.data ?? []} staff={staff.data ?? []} />
    </div>
  );
}
