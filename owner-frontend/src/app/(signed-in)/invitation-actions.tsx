"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useApiClient } from "@/lib/api/use-api";

/**
 * Accept or decline a staff invitation.
 *
 * Declining is `DELETE /me/memberships/{id}` — the same endpoint as leaving a turf,
 * which is what declining an invitation amounts to on the backend. The API enforces who
 * may do either; this only decides what is rendered.
 */
export function InvitationActions({ id }: { id: string }) {
  const t = useTranslations("owner");
  const router = useRouter();
  const api = useApiClient();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, call: () => Promise<{ error?: unknown }>) {
    setBusy(key);
    setError(null);
    const { error: apiError } = await call();
    setBusy(null);
    if (apiError) {
      setError(t("inviteFailed"));
      return;
    }
    router.refresh();
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {error && (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      )}
      <Button
        size="xs"
        disabled={busy !== null}
        onClick={() =>
          run("accept", () =>
            api.POST("/api/v1/me/memberships/{id}/accept", {
              params: { path: { id } },
              body: {} as never,
            }),
          )
        }
      >
        {t("acceptInvite")}
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={busy !== null}
        onClick={() =>
          run("decline", () =>
            api.DELETE("/api/v1/me/memberships/{id}", { params: { path: { id } } }),
          )
        }
      >
        {t("declineInvite")}
      </Button>
    </span>
  );
}
