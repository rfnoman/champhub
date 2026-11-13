import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getServerApiClient } from "@/lib/api/server";
import { IdentityPanel } from "@/components/account/identity-panel";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Identity · ChampHub" };

/**
 * A page of its own rather than another card on `/settings`.
 *
 * It is the link the approval and rejection notifications point at (`/settings/identity`),
 * and the settings page is already four panels long — an identity check buried under the
 * self-assessment sliders is one nobody finishes.
 */
export default async function IdentityPage() {
  const api = await getServerApiClient();
  const { data } = await api.GET("/api/v1/me/identity");

  if (!data) notFound();

  const t = await getTranslations("identity");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("heading")}</h1>
          <p className="text-muted-foreground text-sm">{t("why")}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings">{t("backToSettings")}</Link>
        </Button>
      </div>

      <IdentityPanel verification={data} />
    </div>
  );
}
