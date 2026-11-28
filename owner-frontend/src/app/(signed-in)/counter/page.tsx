import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getServerApiClient } from "@/lib/api/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Counter · ChampHub Turf" };

/**
 * Where a player's QR code lands (tasks.md).
 *
 * The code on a player's profile is a plain https link to here with their handle on it,
 * so the manager's **own phone camera** resolves it — no scanner in this app, no camera
 * permission, and it works for a manager who has never installed anything.
 *
 * This page's only job is to work out *which turf* and get out of the way. A manager
 * with one turf never sees it: they are redirected straight to that turf's bookings
 * page with the player already chosen, which is the whole point of pointing a camera at
 * something. A manager with several has to say which counter they are standing at, and
 * nothing else.
 */
export default async function CounterPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string }>;
}) {
  // `searchParams` is a promise in Next 16.
  const { player } = await searchParams;
  const handle = (player ?? "").trim();

  const api = await getServerApiClient();
  const { data } = await api.GET("/api/v1/me/turfs");
  // The list endpoint is paginated (CLAUDE.md), so the rows are under `results`.
  const turfs = (data?.results ?? []).filter((turf) => turf.status === "approved");

  const query = handle ? `?player=${encodeURIComponent(handle)}` : "";

  // Nothing to choose between: go where they were trying to go.
  if (turfs.length === 1) {
    redirect(`/turfs/${turfs[0].slug}/bookings${query}`);
  }

  const t = await getTranslations("counterScan");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">
          {handle ? t("bodyFor", { handle }) : t("body")}
        </p>
      </header>

      {turfs.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            {t("noTurfs")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="label-sm">{t("whichTurf")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {turfs.map((turf) => (
              <Button key={turf.id} variant="outline" className="justify-start" asChild>
                <Link href={`/turfs/${turf.slug}/bookings${query}`}>
                  {turf.name}
                  <span className="text-muted-foreground ml-2 text-xs">{turf.area}</span>
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
