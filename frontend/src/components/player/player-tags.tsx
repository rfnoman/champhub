import { getTranslations } from "next-intl/server";

import { getServerApiClient } from "@/lib/api/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { TagSticker } from "./tag-sticker";

/**
 * The stickers a player has collected (tasks.md).
 *
 * What the rating cannot say. A number puts somebody on a scale; "cool as a cucumber,
 * ×7" says what they are like to play with, which is what people actually want to know
 * before asking a stranger to fill a match.
 *
 * Fetched here rather than threaded through the profile serializer: it is a `GROUP BY`
 * over every tag a player has ever been given, it is not needed by the match board or
 * the roster, and a section that can fail independently should.
 *
 * Nothing says who gave what — the awards are anonymous to the recipient, exactly like
 * the peer ratings they arrive with (DOMAIN §7).
 */
export async function PlayerTags({ playerId }: { playerId: string }) {
  const t = await getTranslations("playerTags");
  const api = await getServerApiClient();
  const { data } = await api.GET("/api/v1/players/{player_id}/tags", {
    params: { path: { player_id: playerId } },
  });

  const tags = data ?? [];
  if (tags.length === 0) return null;

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="label-sm">{t("heading")}</CardTitle>
        <p className="text-muted-foreground text-xs">{t("hint")}</p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {tags.map((tag) => (
          <TagSticker key={tag.key} tag={tag} />
        ))}
      </CardContent>
    </Card>
  );
}
