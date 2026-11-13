import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { fetchClientConfig } from "@/lib/api/config-queries";
import { getServerApiClient } from "@/lib/api/server";
import { playerAppOrigin } from "@/lib/links";

import { ReminderSettings } from "@/components/fitness/reminder-settings";
import { UsernamePanel } from "@/components/account/username-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings · ChampHub" };

export default async function SettingsPage() {
  const api = await getServerApiClient();
  const [profile, attributes, sports, config, reminders, identity, me] = await Promise.all([
    api.GET("/api/v1/me/profile"),
    api.GET("/api/v1/attributes"),
    api.GET("/api/v1/sports"),
    fetchClientConfig(),
    api.GET("/api/v1/me/reminders"),
    api.GET("/api/v1/me/identity"),
    api.GET("/api/v1/me"),
  ]);

  if (!profile.data) notFound();

  const t = await getTranslations("settings");
  const ti = await getTranslations("identity");
  const status = identity.data?.status ?? "draft";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("body")}</p>
      </div>
      {/* The handle lives above the profile fields because it is the one thing on this
          page other people use to find this player (DOMAIN §1b). */}
      <UsernamePanel username={me.data?.username ?? ""} profileOrigin={playerAppOrigin()} />

      <SettingsForm
        profile={profile.data}
        attributes={attributes.data ?? []}
        sports={sports.data ?? []}
        ratingCap={config.self_assessed_rating_cap}
        defaultRating={config.onboarding_default_rating}
        defaultWeightKg={config.default_player_weight_kg}
      />

      {reminders.data && (
        <ReminderSettings preference={reminders.data} vapidPublicKey={config.vapid_public_key} />
      )}

      {/* The check itself lives on its own page — this is the entry point and the
          status, which is the part somebody comes to settings looking for. */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <CardTitle className="label-sm">{ti("heading")}</CardTitle>
          <Badge
            variant={
              status === "approved" ? "brand" : status === "rejected" ? "destructive" : "secondary"
            }
          >
            {ti(`status.${status}`)}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground max-w-prose text-sm">{ti("why")}</p>
          <Button size="sm" variant="outline" asChild>
            <Link href="/settings/identity">
              <ShieldCheck aria-hidden />
              {status === "draft" ? ti("start") : ti("open")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
