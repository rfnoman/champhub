import { getTranslations } from "next-intl/server";
import { cn } from "cn";

import type { PublicScorecard, Scorecard } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";

type AnyScorecard = Scorecard | PublicScorecard;

/**
 * The read-only scorecard: result header, both team sheets, and the stats table.
 *
 * Shared by the signed-in match page and the public shareable page, which is the whole
 * reason it takes only the data both have.
 */
export async function ScorecardView({ scorecard }: { scorecard: AnyScorecard }) {
  const t = await getTranslations("scorecard");

  const [teamA, teamB] = ["A", "B"].map((side) =>
    scorecard.teams.find((team) => team.side === side),
  );
  const winner = scorecard.result;

  // Only the stats somebody actually recorded — an empty column helps nobody.
  const used = new Set<string>();
  for (const row of scorecard.rows) {
    for (const [key, value] of Object.entries(row.stats)) {
      if (Number(value) !== 0) used.add(key);
    }
  }
  const columns = scorecard.stat_definitions.filter(
    (definition) => used.has(definition.key) && definition.show_on_profile,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="glass-panel floodlight relative overflow-hidden rounded-3xl p-6 text-center">
        {/* Sentence case: this was a tracked-out all-caps eyebrow, which is the
            commonest tell of a templated page. */}
        <p className="label-sm">
          {scorecard.sport} · {scorecard.turf_name}
        </p>

        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <TeamScore
            name={teamA?.display_name ?? "Team A"}
            score={scorecard.team_a_score}
            won={winner === "A"}
          />
          {/* The centre line, which is what actually separates two sides on a pitch. */}
          <span
            aria-hidden
            className="via-chalk/30 h-16 w-px bg-gradient-to-b from-transparent to-transparent"
          />
          <TeamScore
            name={teamB?.display_name ?? "Team B"}
            score={scorecard.team_b_score}
            won={winner === "B"}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {winner === "draw" && <Badge variant="secondary">{t("draw")}</Badge>}
          {scorecard.verified_by_staff && <Badge variant="default">{t("verifiedByTurf")}</Badge>}
          {scorecard.motm_name && (
            <Badge variant="outline">{t("motm", { name: scorecard.motm_name })}</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[teamA, teamB].map(
          (team) =>
            team && (
              <div key={team.id} className="glass-panel rounded-2xl p-4">
                <h3 className="font-display text-base font-bold tracking-tight">
                  {team.display_name}
                </h3>
                {team.captain_name && (
                  <p className="text-muted-foreground text-xs">
                    {t("captain", { name: team.captain_name })}
                  </p>
                )}
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {team.players.map((player) => (
                    <li key={player.match_player_id} className="truncate">
                      {player.name}
                      {player.is_captain && <span className="text-muted-foreground"> (C)</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ),
        )}
      </div>

      {scorecard.rows.length > 0 && columns.length > 0 && (
        <div className="glass-panel overflow-x-auto rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border/60 border-b text-left">
                <th className="label-sm px-3 py-2.5">{t("player")}</th>
                {columns.map((definition) => (
                  <th
                    key={definition.key}
                    className="label-sm px-3 py-2.5 text-right whitespace-nowrap"
                  >
                    {definition.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scorecard.rows.map((row) => (
                <tr
                  key={String(row.player_id)}
                  className="border-border/60 hover:bg-muted/40 border-b transition-colors last:border-b-0"
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 rounded-full",
                          row.side === "A" ? "bg-brand" : "bg-muted-foreground",
                        )}
                      />
                      <span className="truncate">{row.name}</span>
                      {row.is_motm && (
                        <span title={t("motmShort")} aria-label={t("motmShort")}>
                          ⭐
                        </span>
                      )}
                    </span>
                  </td>
                  {columns.map((definition) => (
                    <td key={definition.key} className="num px-3 py-2 text-right">
                      {row.stats[definition.key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TeamScore({ name, score, won }: { name: string; score: number; won: boolean }) {
  return (
    <div className="flex min-w-24 flex-col items-center">
      <span
        className={cn(
          "num text-6xl leading-none font-extrabold",
          won ? "text-rating-elite" : "text-foreground/70",
        )}
      >
        {score}
      </span>
      <span className="text-muted-foreground mt-2 max-w-28 truncate text-xs">{name}</span>
    </div>
  );
}
