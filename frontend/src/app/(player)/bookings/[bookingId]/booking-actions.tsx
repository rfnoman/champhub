"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import type { Booking } from "@/lib/api/types";
import { useApiClient } from "@/lib/api/use-api";
import { canCancel } from "@/lib/bookings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * What a player can do to their own booking: cancel it.
 *
 * Confirming, taking payment and marking a no-show used to live here too, behind an
 * `isStaff` flag the page worked out by fetching the reader's turfs on every view. Those
 * are the turf's side of a booking and moved to the owner app with the rest of its
 * operations (DECISIONS D83) — so this page no longer asks who is looking, and the extra
 * request per booking went with it.
 */
export function BookingActions({ booking }: { booking: Booking }) {
  const t = useTranslations("bookingDetail");
  const router = useRouter();
  const api = useApiClient();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function run(key: string, call: () => Promise<{ error?: unknown }>) {
    setBusy(key);
    setError(null);
    const { error: apiError } = await call();
    setBusy(null);
    if (apiError) {
      setError(describe(apiError) ?? t("failed"));
      return;
    }
    router.refresh();
  }

  const path = { path: { id: booking.id } };

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-destructive text-sm whitespace-pre-line">
          {error}
        </p>
      )}

      {canCancel(booking) && (
        <div className="flex flex-wrap items-end gap-2">
          <Input
            aria-label={t("cancelReason")}
            placeholder={t("cancelReasonPlaceholder")}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-w-48 flex-1"
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={busy === "cancel"}
            onClick={() =>
              run("cancel", () =>
                api.POST("/api/v1/bookings/{id}/cancel", {
                  params: path,
                  body: { reason } as never,
                }),
              )
            }
          >
            {t("cancel")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Surface the API's own validation message — it is the useful part. */
function describe(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const parts: string[] = [];
  for (const [field, value] of Object.entries(error as Record<string, unknown>)) {
    const message = Array.isArray(value) ? value.join(" ") : String(value);
    parts.push(field === "detail" || field === "status" ? message : `${field}: ${message}`);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}
