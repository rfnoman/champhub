import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import type { MatchSummary } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { ratingTone } from "@/components/player/rating";
import { Money } from "@/components/ui/money";
import { formatWhen } from "@/i18n/formats";
import { sportTheme } from "@/lib/sport-theme";

/**
 * One match on the board (DOMAIN §6).
 *
 * The brief's shape: "Mirpur Turf · Ground 2 · Fri 9:00 PM · 7v7 · Need 3 · Avg 68" —
 * the four things a player decides on before opening anything. Phase 12 keeps the four
 * facts and drops the middot run: a meta string joined with dots is a list pretending
 * to be a sentence, and the one thing a player actually scans for — how close this
 * match is to being a game — now has a meter instead of a number in a row of numbers.
 *
 * No `"use client"` and no `async`: next-intl's `useTranslations`/`useLocale` work in
 * both trees, so this renders inside the server-rendered match page *and* inside the
 * client-filtered board. It used to be `async`, which is why the board had to keep a
 * duplicate copy of it.
 */
export function MatchCard({ match }: { match: MatchSummary }) {
  const t = useTranslations("board");
  const locale = useLocale();

  const when = formatWhen(match.starts_at, locale, "full");
  const filled = match.capacity > 0 ? (match.roster_count / match.capacity) * 100 : 0;
  const full = match.needed <= 0;

  return (
    <Link
      {...sportTheme(match.sport.slug)}
      href={`/matches/${match.id}`}
      className="press glass-panel hover:border-sport/40 group/match flex flex-col gap-3 rounded-2xl p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display truncate text-base font-bold tracking-tight">
            <span aria-hidden className="mr-1.5">
              {match.sport.icon}
            </span>
            {match.turf_name}
          </h3>
          <p className="text-muted-foreground truncate text-xs">
            {match.ground_name} · {match.area}
            {match.distance_km != null && ` · ${t("kmAway", { km: match.distance_km })}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-sm font-semibold">{when}</p>
          <p className="text-muted-foreground text-xs">{match.sport_format.name}</p>
        </div>
      </div>

      {/* How full the match is, which is the question the board exists to answer. */}
      <div className="flex items-center gap-3">
        <div
          className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full"
          role="meter"
          aria-label={t("rosterOf", { count: match.roster_count, capacity: match.capacity })}
          aria-valuenow={match.roster_count}
          aria-valuemin={0}
          aria-valuemax={match.capacity}
        >
          <div
            className="bg-sport-vivid duration-slow ease-out-quint h-full rounded-full transition-[width]"
            style={{ width: `${Math.min(100, filled)}%` }}
          />
        </div>
        <span className="num text-muted-foreground shrink-0 text-xs">
          {t("rosterOf", { count: match.roster_count, capacity: match.capacity })}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={full ? "secondary" : "default"}>
            {t("needed", { count: match.needed })}
          </Badge>
          {match.squad && <Badge variant="secondary">{match.squad.name}</Badge>}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {match.average_rating != null ? (
            <span className={ratingTone(match.average_rating)}>
              {t("avgRating", { rating: match.average_rating })}
            </span>
          ) : (
            <span className="text-muted-foreground">{t("unrated")}</span>
          )}
          <Money amount={match.price} className="text-sm font-semibold" />
        </div>
      </div>
    </Link>
  );
}
