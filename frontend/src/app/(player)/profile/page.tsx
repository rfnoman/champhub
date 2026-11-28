import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getServerApiClient } from "@/lib/api/server";
import { ClaimPrompt } from "@/components/player/claim-prompt";
import { CounterCode } from "@/components/player/counter-code";
import { PlayerProfileView } from "@/components/player/player-profile-view";
import { PlayerRecord } from "@/components/ratings/player-record";
import { RecentResults } from "@/components/scoring/recent-results";
import { Button } from "@/components/ui/button";

export const metadata = { title: "My profile · ChampHub" };

export default async function MyProfilePage() {
  const api = await getServerApiClient();
  // The claim offer is on the profile rather than buried in settings: somebody who
  // played at a counter for months opens this page expecting to see that history, and
  // its absence is the question the prompt answers (tasks.md).
  const [profile, claim] = await Promise.all([
    api.GET("/api/v1/me/profile"),
    api.GET("/api/v1/me/account-claim"),
  ]);
  const data = profile.data;

  if (!data) notFound();

  const t = await getTranslations("profile");

  return (
    <PlayerProfileView
      player={data}
      action={
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings">{t("edit")}</Link>
        </Button>
      }
      footer={
        <>
          <ClaimPrompt
            claimable={claim.data?.claimable ?? null}
            claims={claim.data?.claims ?? []}
          />
          <CounterCode />
          <PlayerRecord playerId={String(data.id)} sport={data.sport_cards[0]?.sport.slug} />
          <RecentResults playerId={String(data.id)} />
        </>
      }
    />
  );
}
