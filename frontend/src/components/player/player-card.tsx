import { getTranslations } from "next-intl/server";
import { cn } from "cn";

import type { PlayerCardProfile, PlayerSportCard } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { sportTheme } from "@/lib/sport-theme";

import { RatingBar, ratingTone } from "./rating";

/**
 * The FIFA-style card for one (player, sport).
 *
 * Built as a reusable server component because every later phase renders it: the match
 * board (Phase 04), scorecards (Phase 05), player search and leaderboards (Phase 06).
 * It therefore takes only the data in {@link PlayerCardProfile} — the shape both
 * `/me/profile` and `/players/{id}` return — and never fetches anything itself.
 *
 * `compact` drops the skill bars and record, for list contexts.
 *
 * This is the app's signature object, so Phase 12 spends its boldness here and keeps
 * the screens around it quiet: the rating is set at display scale in Archivo, a penalty
 * arc crops the corner behind it, and the whole card is tinted by the sport it belongs
 * to — a badminton card is visibly not a football one.
 */
export async function PlayerSportCardView({
  player,
  card,
  compact = false,
  className,
}: {
  player: Pick<PlayerCardProfile, "name" | "photo_url" | "area">;
  card: PlayerSportCard;
  compact?: boolean;
  className?: string;
}) {
  const t = await getTranslations("playerCard");
  // Two different facts, and merging them reads wrong: a player can have unlocked a
  // sport by playing a locked match (`is_verified`) while their rating is still finding
  // its level (`is_provisional`, the first few matches).
  const verified = card.is_verified;
  const provisional = card.is_provisional;
  // Only the top band earns the sheen. If every card shimmered it would say nothing.
  const elite = card.overall >= 80;

  return (
    <article
      {...sportTheme(card.sport.slug)}
      className={cn(
        // Capped width: a stat bar stretched across a 1200px column reads as a
        // progress indicator, not a rating. Full width below `sm`.
        "glass-panel border-sport/25 relative w-full max-w-xl overflow-hidden rounded-3xl",
        className,
      )}
      aria-label={t("ariaLabel", { name: player.name, sport: card.sport.name })}
    >
      {/* The floodlight, in this sport's colour, so the card reads before it is read. */}
      <div
        aria-hidden
        className="from-sport/20 pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b to-transparent"
      />
      {/* The penalty arc, cropped by the corner the rating sits in. Pitch geometry
          rather than an abstract blob, and it only appears here because this is the one
          place a card has a focal point to frame. */}
      <div
        aria-hidden
        className="border-sport/25 pointer-events-none absolute -top-20 -left-16 size-44 rounded-full border"
      />
      {elite && (
        <div
          aria-hidden
          className="via-sport/12 pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent to-transparent"
        />
      )}

      <div className="relative flex items-start gap-4 p-5">
        <div className="flex shrink-0 flex-col items-center">
          <span
            className={cn(
              "num text-[3.25rem] leading-[0.85] font-extrabold",
              ratingTone(card.overall),
            )}
          >
            {card.overall}
          </span>
          {/* Sentence case, not a tracked-out all-caps eyebrow — that treatment was
              here before and it is the commonest tell of a templated page. */}
          <span className="label-sm mt-1.5">{t("overall")}</span>
          {card.positions.length > 0 && (
            <span className="font-display border-sport/30 text-sport mt-3 rounded-full border px-2.5 py-0.5 text-xs font-semibold">
              {card.positions.join(" / ")}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display truncate text-lg leading-tight font-bold tracking-tight">
                {player.name}
              </h3>
              <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                <span aria-hidden>{card.sport.icon}</span>
                <span>{card.sport.name}</span>
                {player.area ? <span>· {player.area}</span> : null}
              </p>
            </div>
            <span className="flex shrink-0 flex-col items-end gap-1">
              {verified ? (
                <Badge variant="secondary" className="text-[0.625rem]">
                  {t("verified")}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[0.625rem]">
                  {t("unverified")}
                </Badge>
              )}
              {provisional && (
                <Badge variant="outline" className="text-[0.625rem]">
                  {t("provisional")}
                </Badge>
              )}
            </span>
          </div>

          {!compact && card.skills.length > 0 && (
            <div className="mt-4 flex flex-col gap-1.5">
              {card.skills.map((skill) => (
                <RatingBar key={skill.key} label={skill.label} value={skill.value} />
              ))}
            </div>
          )}
        </div>
      </div>

      {!compact && (
        <dl className="border-border/60 relative grid grid-cols-4 border-t">
          {(
            [
              ["matches", card.matches_played],
              ["wins", card.wins],
              ["losses", card.losses],
              ["motm", card.motm_awards],
            ] as const
          ).map(([key, value], index) => (
            <div
              key={key}
              className={cn(
                "flex flex-col items-center gap-0.5 px-1 py-3",
                // A chalk line between figures, not a box around each.
                index > 0 && "border-border/60 border-l",
              )}
            >
              <dd className="num text-lg font-bold">{value}</dd>
              <dt className="label-sm text-[0.6875rem]">{t(key)}</dt>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

/**
 * The shared attributes (DOMAIN §3) — they belong to the player, not a sport, so they
 * sit beside the sport cards rather than inside them.
 */
export async function PlayerAttributes({
  player,
  className,
}: {
  player: Pick<PlayerCardProfile, "attributes">;
  className?: string;
}) {
  const t = await getTranslations("playerCard");

  if (player.attributes.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("noAttributes")}</p>;
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {player.attributes.map((attribute) => (
        <RatingBar key={attribute.key} label={attribute.label} value={attribute.value} />
      ))}
    </div>
  );
}
