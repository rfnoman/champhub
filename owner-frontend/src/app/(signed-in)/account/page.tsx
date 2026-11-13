import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getServerApiClient } from "@/lib/api/server";
import { playerAppUrl } from "@/lib/links";
import { IdentityPanel } from "@/components/account/identity-panel";
import { UsernamePanel } from "@/components/account/username-panel";

export const metadata = { title: "Your account · ChampHub Turf" };

/**
 * The owner's own account: their handle, their photograph and their identity check.
 *
 * Everything else in this app belongs to a turf; this page belongs to the person. An
 * owner is asked for the same four documents a player is, because it is the same
 * account and the same identity (DOMAIN §1a) — and because a venue taking money from
 * strangers should have a verified human behind it.
 *
 * The handle is here for the same reason, and because this is the *only* place an owner
 * can claim one: the player onboarding wizard, which is where a player picks theirs, is
 * in the other app and an owner never runs it (DECISIONS D93).
 */
export default async function AccountPage() {
  const api = await getServerApiClient();
  const [identity, me] = await Promise.all([api.GET("/api/v1/me/identity"), api.GET("/api/v1/me")]);

  if (!identity.data) notFound();

  const t = await getTranslations("identity");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("whyOwner")}</p>
      </div>

      <UsernamePanel username={me.data?.username ?? ""} profileOrigin={playerAppUrl()} />

      <IdentityPanel verification={identity.data} />
    </div>
  );
}
