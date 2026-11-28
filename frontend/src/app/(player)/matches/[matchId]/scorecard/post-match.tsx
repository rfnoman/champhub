"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { cn } from "cn";

import type { MatchDetail, PlayerTag, Scorecard } from "@/lib/api/types";
import { useApiClient } from "@/lib/api/use-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TagSticker } from "@/components/player/tag-sticker";

/**
 * The post-match sheet: one MOTM vote, a quick 1–5 rating for the other players, and
 * the stickers that say what they were actually like to play with (tasks.md).
 *
 * Peer ratings and tags are both anonymous to the recipient (DOMAIN §7) — the copy says
 * so, because a player who thinks the subject will see it rates everybody a 4.
 *
 * `myProfileId` comes from the page rather than being guessed here: the API refuses a
 * self vote or self rating, and the fix for that is not to offer it.
 */
export function PostMatchSheet({
  match,
  scorecard,
  myProfileId,
  catalogue,
  maxTags,
}: {
  match: MatchDetail;
  scorecard: Scorecard;
  myProfileId: string | null;
  /** The stickers on offer, from the server, so the picker cannot offer a retired one. */
  catalogue: PlayerTag[];
  /** How many one person may give one player — the server refuses more. */
  maxTags: number;
}) {
  const t = useTranslations("postMatch");
  const router = useRouter();
  const api = useApiClient();

  const [vote, setVote] = useState<string | null>(
    scorecard.my_motm_vote ? String(scorecard.my_motm_vote) : null,
  );
  // Seeded from what this player already gave, so a reload shows their stars back.
  const [ratings, setRatings] = useState<Record<string, number>>(
    () => scorecard.my_peer_ratings ?? {},
  );
  // Same, for the stickers — saving replaces the set, so a picker that came back empty
  // would quietly offer to take back every tag this player had already given.
  const [tags, setTags] = useState<Record<string, string[]>>(() => scorecard.my_peer_tags ?? {});
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const path = { path: { match_id: match.id } };
  const others = match.roster.filter(
    (entry) => entry.profile_id && String(entry.profile_id) !== myProfileId,
  );

  async function castVote(profileId: string) {
    setBusy(profileId);
    setError(null);
    const { error: apiError } = await api.POST("/api/v1/matches/{match_id}/motm", {
      params: path,
      body: { player_id: profileId } as never,
    });
    setBusy(null);
    if (apiError) {
      setError(t("voteFailed"));
      return;
    }
    setVote(profileId);
    router.refresh();
  }

  async function saveRatings() {
    setBusy("ratings");
    setError(null);
    const { error: apiError } = await api.POST("/api/v1/matches/{match_id}/peer-ratings", {
      params: path,
      body: {
        ratings: Object.entries(ratings).map(([playerId, overall]) => ({
          player_id: playerId,
          overall,
          tags: tags[playerId] ?? [],
        })),
      } as never,
    });
    setBusy(null);
    if (apiError) {
      setError(t("ratingsFailed"));
      return;
    }
    setSaved(true);
    router.refresh();
  }

  // Nobody else played, or the reader is a spectator: there is nothing to rate.
  if (others.length === 0 || !myProfileId) return null;

  return (
    <div className="flex flex-col gap-4" data-testid="post-match">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {scorecard.motm_voting_open && (
        <Card>
          <CardHeader>
            <CardTitle className="label-sm">{t("motmHeading")}</CardTitle>
            <p className="text-muted-foreground text-xs">{t("motmHint")}</p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {others.map((entry) => (
              <Button
                key={entry.id}
                size="sm"
                variant={vote === String(entry.profile_id) ? "default" : "outline"}
                aria-pressed={vote === String(entry.profile_id)}
                disabled={busy !== null}
                onClick={() => castVote(String(entry.profile_id))}
              >
                {entry.name}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="label-sm">{t("ratingsHeading")}</CardTitle>
          <p className="text-muted-foreground text-xs">{t("ratingsHint")}</p>
          {catalogue.length > 0 && <p className="text-muted-foreground text-xs">{t("tagsHint")}</p>}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {others.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-2 border-b pb-3 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate text-sm">{entry.name}</span>
                <span className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const chosen = (ratings[String(entry.profile_id)] ?? 0) >= star;
                    return (
                      <button
                        key={star}
                        type="button"
                        aria-label={t("starLabel", { name: entry.name, stars: star })}
                        aria-pressed={chosen}
                        onClick={() =>
                          setRatings((current) => ({
                            ...current,
                            [String(entry.profile_id)]: star,
                          }))
                        }
                        className="p-1"
                      >
                        <Star
                          aria-hidden
                          className={cn(
                            "size-5",
                            chosen
                              ? "fill-rating-fair text-rating-fair"
                              : "text-muted-foreground/40",
                          )}
                        />
                      </button>
                    );
                  })}
                </span>
              </div>

              {/* The stickers. Only offered once a rating is given: a tag with no stars
                  behind it is a compliment from somebody who could not be bothered to
                  say how the player actually did. */}
              {catalogue.length > 0 && (ratings[String(entry.profile_id)] ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {catalogue.map((tag) => {
                    const id = String(entry.profile_id);
                    const chosen = (tags[id] ?? []).includes(tag.key);
                    const full = (tags[id] ?? []).length >= maxTags;
                    if (full && !chosen) return null;
                    return (
                      <TagSticker
                        key={tag.key}
                        tag={tag}
                        size="sm"
                        pressed={chosen}
                        onClick={() =>
                          setTags((current) => {
                            const mine = current[id] ?? [];
                            return {
                              ...current,
                              [id]: chosen
                                ? mine.filter((key) => key !== tag.key)
                                : [...mine, tag.key],
                            };
                          })
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          <div className="flex items-center gap-3 border-t pt-3">
            <Button
              size="sm"
              disabled={busy !== null || Object.keys(ratings).length === 0}
              onClick={saveRatings}
            >
              {busy === "ratings" ? t("saving") : t("saveRatings")}
            </Button>
            {saved && (
              <span role="status" className="text-muted-foreground text-sm">
                {t("ratingsSaved")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
