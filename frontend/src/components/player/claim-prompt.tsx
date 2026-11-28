"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Clock, History } from "lucide-react";

import type { AccountClaim, Claimable } from "@/lib/api/types";
import { useApiClient } from "@/lib/api/use-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * "This number has bookings on it — are they yours?" (tasks.md)
 *
 * Shown when a newly signed-up account's phone number matches a guest who booked at a
 * counter. The offer never names the guest: a person is told their *own* number has
 * history, which is the only thing they can act on, and naming the guest would turn
 * "is this yours?" into a directory lookup for anybody willing to type numbers.
 *
 * Asking does not move anything. A phone number is unverified (DECISIONS D9), so the
 * claim goes to a platform admin who decides — and the copy says so, because a person
 * who expects their matches to appear immediately will think it is broken.
 */
export function ClaimPrompt({
  claimable,
  claims,
}: {
  claimable: Claimable | null;
  claims: AccountClaim[];
}) {
  const t = useTranslations("claim");
  const router = useRouter();
  const api = useApiClient();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = claims.find((claim) => claim.status === "pending");
  const decided = claims.find(
    (claim) => claim.status === "approved" || claim.status === "rejected",
  );

  if (pending) {
    return (
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="label-sm flex items-center gap-2">
            <Clock className="size-4" aria-hidden />
            {t("pendingHeading")}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          {t("pendingBody", { count: pending.booking_count })}
        </CardContent>
      </Card>
    );
  }

  // Nothing to offer, but a rejection the person has not been told about anywhere else.
  if (!claimable) {
    if (!decided || decided.status !== "rejected") return null;
    return (
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="label-sm">{t("rejectedHeading")}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          {decided.decision_reason || t("rejectedFallback")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-brand/40 w-full max-w-xl">
      <CardHeader>
        <CardTitle className="label-sm flex items-center gap-2">
          <History className="size-4" aria-hidden />
          {t("heading")}
        </CardTitle>
        <p className="text-muted-foreground mt-1 text-xs">
          {t("body", { count: claimable.booking_count, phone: claimable.phone_hint })}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <p className="text-muted-foreground text-xs">{t("reviewNote")}</p>
        <Button
          size="sm"
          className="self-start"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const { error: apiError } = await api.POST("/api/v1/me/account-claim", {
              body: { guest_id: claimable.guest_id } as never,
            });
            setBusy(false);
            if (apiError) {
              setError(t("failed"));
              return;
            }
            router.refresh();
          }}
        >
          {busy ? t("asking") : t("ask")}
        </Button>
      </CardContent>
    </Card>
  );
}
