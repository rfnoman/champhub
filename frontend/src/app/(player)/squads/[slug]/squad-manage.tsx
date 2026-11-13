"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import type { Squad } from "@/lib/api/types";
import { useApiClient } from "@/lib/api/use-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * Leader controls and the member list.
 *
 * The open/closed toggle is here rather than buried in an edit form because it changes
 * how every future match of this squad behaves (DOMAIN §6) — the leader should see it
 * next to the members it affects.
 */
export function SquadManage({ squad }: { squad: Squad }) {
  const t = useTranslations("squadPage");
  const router = useRouter();
  const api = useApiClient();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const isLeader = squad.my_role === "leader";
  const isMember = squad.my_role != null;

  async function run(key: string, call: () => Promise<{ error?: unknown }>) {
    setBusy(key);
    setError(null);
    const { error: apiError } = await call();
    setBusy(null);
    if (apiError) {
      // The API's own sentence where there is one: "no player has that username" is the
      // most likely failure here and the only one the reader can do anything about.
      const body = apiError as Record<string, string[] | string> | null;
      const first = body && typeof body === "object" ? Object.values(body)[0] : null;
      const message = Array.isArray(first) ? first.join(" ") : first;
      setError(message || t("failed"));
      return false;
    }
    router.refresh();
    return true;
  }

  const slugPath = { path: { slug: squad.slug } };

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {isLeader && (
        <Card>
          <CardHeader>
            <CardTitle className="label-sm">{t("settings")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="open-squad">{t("openSquad")}</Label>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t(squad.accepts_public_requests ? "openHint" : "closedHint")}
                </p>
              </div>
              <Switch
                id="open-squad"
                checked={squad.accepts_public_requests}
                disabled={busy === "open"}
                onCheckedChange={(next) =>
                  run("open", () =>
                    api.PATCH("/api/v1/squads/{slug}", {
                      params: slugPath,
                      body: { accepts_public_requests: next } as never,
                    }),
                  )
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inviting by handle (DOMAIN §1b). Any member may propose somebody; the leader's
          invite goes straight out, which is the chain the API already enforces (D1). */}
      {isMember && (
        <Card>
          <CardHeader>
            <CardTitle className="label-sm">{t("invite")}</CardTitle>
            <p className="text-muted-foreground text-xs">{t("inviteHint")}</p>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="squad-invite-handle" className="text-xs">
                {t("inviteByHandle")}
              </Label>
              <Input
                id="squad-invite-handle"
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder={t("handlePlaceholder")}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                maxLength={21}
                className="w-48"
              />
            </div>
            <Button
              size="sm"
              disabled={!handle.trim() || busy === "invite"}
              onClick={async () => {
                const ok = await run("invite", () =>
                  api.POST("/api/v1/squads/{slug}/invite", {
                    params: slugPath,
                    body: { username: handle.trim() } as never,
                  }),
                );
                // Kept on failure: a mistyped handle is worth correcting, not retyping.
                if (ok) setHandle("");
              }}
            >
              {t("sendInvite")}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="label-sm">
            {t("members", { count: squad.members.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {squad.members.map((member) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{member.name}</span>
                <span className="text-muted-foreground block text-xs">
                  {t(`role.${member.role}`)}
                </span>
              </span>
              {isLeader && member.role !== "leader" && member.profile_id && (
                <span className="flex gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy === member.id}
                    onClick={() =>
                      run(member.id, () =>
                        api.POST("/api/v1/squads/{slug}/transfer-leadership", {
                          params: slugPath,
                          body: { player_id: member.profile_id! } as never,
                        }),
                      )
                    }
                  >
                    {t("makeLeader")}
                  </Button>
                  <Button
                    size="xs"
                    variant="destructive"
                    disabled={busy === member.id}
                    onClick={() =>
                      run(member.id, () =>
                        api.POST("/api/v1/squads/{slug}/remove-member", {
                          params: slugPath,
                          body: { player_id: member.profile_id! } as never,
                        }),
                      )
                    }
                  >
                    {t("remove")}
                  </Button>
                </span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {isMember && !isLeader && (
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          disabled={busy === "leave"}
          onClick={() =>
            run("leave", () =>
              api.POST("/api/v1/squads/{slug}/leave", { params: slugPath, body: {} as never }),
            )
          }
        >
          {t("leave")}
        </Button>
      )}
      {isLeader && <p className="text-muted-foreground text-xs">{t("leaderCannotLeave")}</p>}
    </div>
  );
}
