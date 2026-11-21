import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getServerApiClient } from "@/lib/api/server";
import type { OwnerTurf } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { InvitationActions } from "../invitation-actions";

export const metadata = { title: "Your turfs · ChampHub Turf" };

/** Review state drives the badge colour: a rejection should not look like an approval. */
function statusTone(status: OwnerTurf["status"]) {
  switch (status) {
    case "approved":
      return "default" as const;
    case "rejected":
    case "suspended":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

export default async function OwnerDashboardPage() {
  const api = await getServerApiClient();
  const [turfs, memberships, identity] = await Promise.all([
    api.GET("/api/v1/me/turfs"),
    api.GET("/api/v1/me/memberships"),
    api.GET("/api/v1/me/identity"),
  ]);

  const t = await getTranslations("owner");
  const ti = await getTranslations("identity");
  const identityStatus = identity.data?.status ?? "draft";
  const mine = turfs.data?.results ?? [];
  const invitations = (memberships.data?.results ?? []).filter(
    (membership) => membership.status === "invited",
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("heading")}</h1>
          <p className="text-muted-foreground text-sm">{t("body")}</p>
        </div>
        <Button asChild size="sm">
          <Link href="/new">{t("register")}</Link>
        </Button>
      </div>

      {/* An unverified owner can still register and run a turf; what they cannot do is
          get one approved once the platform requires it. Saying so here, on the page
          they land on, beats finding out in a rejection. */}
      {identityStatus !== "approved" && (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <CardTitle className="label-sm">{ti("heading")}</CardTitle>
            <Badge variant={identityStatus === "rejected" ? "destructive" : "secondary"}>
              {ti(`status.${identityStatus}`)}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground max-w-prose text-sm">{ti("whyOwner")}</p>
            <Button size="sm" variant="outline" asChild>
              <Link href="/account">{identityStatus === "draft" ? ti("start") : ti("open")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="label-sm">{t("invitations")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <span>
                  {t("invitedAs", {
                    turf: invitation.turf_name,
                    role: invitation.role_label,
                  })}
                </span>
                {/* This was a link to `/owner/invitations/<id>`, a route that was never
                    built — so a staff invitation could be read and not acted on. The
                    API has had accept and leave endpoints since Phase 02; the decision
                    is two buttons, not a page. */}
                <InvitationActions id={invitation.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {mine.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-muted-foreground text-sm">{t("empty")}</p>
            <Button asChild size="sm">
              <Link href="/new">{t("register")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {mine.map((turf) => (
            <li key={turf.id}>
              <Link
                href={`/turfs/${turf.slug}`}
                className="press glass-panel block rounded-2xl p-4 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">{turf.name}</h2>
                    <p className="text-muted-foreground text-xs">
                      {turf.area} · {t("groundCount", { count: turf.ground_count })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {turf.my_role && <Badge variant="outline">{turf.my_role}</Badge>}
                    <Badge variant={statusTone(turf.status)}>{turf.status_label}</Badge>
                  </div>
                </div>
                {turf.status === "rejected" && turf.rejection_reason && (
                  <p className="text-destructive mt-2 text-xs">{turf.rejection_reason}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
