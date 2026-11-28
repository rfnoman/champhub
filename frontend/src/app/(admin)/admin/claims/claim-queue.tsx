"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import type { AdminAccountClaim } from "@/lib/api/types";
import { useApiClient } from "@/lib/api/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * One claim, with the three facts a reviewer actually decides on: the number the
 * account gave Clerk, the number the counter wrote down, and which turfs the guest
 * played at.
 *
 * The guest's full number is shown **here and nowhere else**, which is the rule identity
 * documents follow (DOMAIN §1a) — a reviewer comparing two numbers cannot do it against
 * four digits, and everybody else gets the mask.
 *
 * Rejecting requires a reason because the person reads it, and the useful rejection is
 * "go to the turf and have the staff vouch for you", not "no".
 */
export function ClaimQueue({
  claims,
  readOnly,
}: {
  claims: AdminAccountClaim[];
  readOnly: boolean;
}) {
  const t = useTranslations("adminClaims");

  if (claims.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("empty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {claims.map((claim) => (
        <li key={claim.id}>
          <ClaimRow claim={claim} readOnly={readOnly} />
        </li>
      ))}
    </ul>
  );
}

function ClaimRow({ claim, readOnly }: { claim: AdminAccountClaim; readOnly: boolean }) {
  const t = useTranslations("adminClaims");
  const router = useRouter();
  const api = useApiClient();

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The reviewer's shortcut — `claim.numbers_match`: when the two are the same number,
  // the only remaining question is whether the person is who they say. Decided by the
  // backend, because Clerk keeps what the person typed and the guest row is normalised,
  // so comparing the two strings here would say "different" exactly when it matters.

  async function decide(decision: "approve" | "reject") {
    setBusy(decision);
    setError(null);
    const { error: apiError } = await api.POST(
      "/api/v1/admin/account-claims/{claim_id}/{decision}",
      {
        params: { path: { claim_id: claim.id, decision } },
        body: { reason } as never,
      },
    );
    setBusy(null);
    if (apiError) {
      setError(t("failed"));
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="label-sm">
              {claim.claimant_name || claim.claimant_email}
            </CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              {claim.claimant_handle} · {claim.claimant_email}
            </p>
          </div>
          <Badge variant={claim.status === "pending" ? "secondary" : "default"}>
            {claim.status_label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs">{t("accountPhone")}</dt>
            <dd className="num">{claim.claimant_phone || t("noPhone")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">{t("guestPhone")}</dt>
            <dd className="num">
              {claim.guest_phone}{" "}
              {claim.numbers_match && (
                <span className="text-rating-elite text-xs font-medium">{t("sameNumber")}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">{t("guestName")}</dt>
            <dd>{claim.guest_name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">{t("bookings")}</dt>
            <dd>{t("bookingCount", { count: claim.booking_count })}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground text-xs">{t("turfs")}</dt>
            <dd>{claim.turfs.join(", ") || "—"}</dd>
          </div>
        </dl>

        {claim.message && <p className="border-l-2 pl-3 text-sm italic">{claim.message}</p>}
        {claim.decision_reason && (
          <p className="text-muted-foreground text-xs">{claim.decision_reason}</p>
        )}

        {!readOnly && claim.status === "pending" && (
          <div className="flex flex-col gap-2 border-t pt-3">
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`reason-${claim.id}`} className="text-xs">
                {t("reason")}
              </Label>
              <Input
                id={`reason-${claim.id}`}
                value={reason}
                placeholder={t("reasonPlaceholder")}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy !== null} onClick={() => decide("approve")}>
                {busy === "approve" ? t("working") : t("approve")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null || !reason.trim()}
                onClick={() => decide("reject")}
              >
                {t("reject")}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">{t("approveWarning")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
