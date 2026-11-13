import { notFound } from "next/navigation";

import { getServerApiClient } from "@/lib/api/server";
import { PlayerProfileView } from "@/components/player/player-profile-view";
import { PlayerRecord } from "@/components/ratings/player-record";
import { RecentResults } from "@/components/scoring/recent-results";

/**
 * Another player's public card, by id **or** by handle.
 *
 * `/players/0f3c…` is the id form that search and rosters link to; `/players/@rafiq` is
 * the one a person types or pastes into a group chat (DOMAIN §1b). One route serves
 * both because they are the same page, and the segment says which it is — nothing else
 * in this app starts with an `@`.
 *
 * `discoverable` gates player *search* only — either link always resolves (DOMAIN §3),
 * which is what makes a shared profile URL useful.
 */
export default async function PlayerPage({ params }: { params: Promise<{ playerId: string }> }) {
  // `params` is a promise in Next 16.
  const { playerId } = await params;

  const api = await getServerApiClient();
  const handle = decodeURIComponent(playerId).startsWith("@")
    ? decodeURIComponent(playerId).slice(1)
    : null;

  const { data } = handle
    ? await api.GET("/api/v1/players/by-username/{username}", {
        params: { path: { username: handle } },
      })
    : await api.GET("/api/v1/players/{player_id}", {
        params: { path: { player_id: playerId } },
      });

  if (!data) notFound();

  return (
    <PlayerProfileView
      player={data}
      footer={
        <>
          <PlayerRecord playerId={String(data.id)} sport={data.sport_cards[0]?.sport.slug} />
          <RecentResults playerId={String(data.id)} />
        </>
      }
    />
  );
}
