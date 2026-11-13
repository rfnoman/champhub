"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import type { AdminIdentityVerification } from "@/lib/api/types";
import { useApiClient } from "@/lib/api/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * The identity review queue (DOMAIN §1a).
 *
 * A review is a comparison: the photograph of the person, the scan of the document, and
 * the number typed in beside them. All three are on the card, because an admin who has
 * to open two tabs to compare them will stop comparing them.
 *
 * The document images come through `/api/identity/<id>/<field>`, this app's own route,
 * which forwards the admin's session to Django — there is no URL for these files and
 * every read is logged against the admin who made it (DECISIONS D89). That is also why
 * they are `loading="lazy"`: a queue of twenty should not log forty document reads for
 * the nineteen nobody looked at.
 */
export function IdentityReviewQueue({ checks }: { checks: AdminIdentityVerification[] }) {
  const t = useTranslations("adminIdentity");
  const router = useRouter();
  const api = useApiClient();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function run(id: string, call: () => Promise<{ error?: unknown }>) {
    setBusy(id);
    setError(null);
    const { error: apiError } = await call();
    setBusy(null);
    if (apiError) {
      setError(t("actionFailed"));
      return;
    }
    router.refresh();
  }

  if (checks.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {checks.map((check) => (
        <Card key={check.id}>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base">{check.person}</CardTitle>
              <p className="text-muted-foreground mt-1 text-xs">
                {check.email}
                {check.phone ? ` · ${check.phone}` : ""}
              </p>
            </div>
            <Badge
              variant={
                check.status === "approved"
                  ? "brand"
                  : check.status === "rejected"
                    ? "destructive"
                    : "secondary"
              }
            >
              {t(`status.${check.status}`)}
            </Badge>
          </CardHeader>

          <CardContent className="flex flex-col gap-3">
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{t("document")}</dt>
                <dd>{check.document_type_label}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{t("number")}</dt>
                <dd className="font-mono">{check.document_number}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-3">
              {check.photo_url && (
                <figure className="flex flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote media host. */}
                  <img
                    src={check.photo_url}
                    alt={t("photoOf", { person: check.person })}
                    loading="lazy"
                    className="border-border h-28 w-28 rounded-lg border object-cover"
                  />
                  <figcaption className="text-muted-foreground text-xs">{t("photo")}</figcaption>
                </figure>
              )}
              {check.has_document_front && (
                <DocumentFigure
                  href={`/api/identity/${check.id}/document_front`}
                  caption={t("front")}
                  alt={t("frontOf", { person: check.person })}
                />
              )}
              {check.has_document_back && (
                <DocumentFigure
                  href={`/api/identity/${check.id}/document_back`}
                  caption={t("back")}
                  alt={t("backOf", { person: check.person })}
                />
              )}
            </div>

            {check.review_note && (
              <p className="text-muted-foreground text-xs">
                {t("lastNote", { note: check.review_note })}
              </p>
            )}

            <div className="flex flex-col gap-2 border-t pt-3">
              <Input
                aria-label={t("reason")}
                placeholder={t("reasonPlaceholder")}
                value={reasons[check.id] ?? ""}
                onChange={(event) =>
                  setReasons((current) => ({ ...current, [check.id]: event.target.value }))
                }
              />
              <div className="flex flex-wrap items-center gap-2">
                {check.status === "submitted" && (
                  <>
                    <Button
                      size="sm"
                      disabled={busy === check.id}
                      onClick={() =>
                        run(check.id, () =>
                          api.POST("/api/v1/admin/identity-verifications/{id}/approve", {
                            params: { path: { id: check.id } },
                            body: { reason: reasons[check.id] ?? "" } as never,
                          }),
                        )
                      }
                    >
                      {t("approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy === check.id || !reasons[check.id]}
                      onClick={() =>
                        run(check.id, () =>
                          api.POST("/api/v1/admin/identity-verifications/{id}/reject", {
                            params: { path: { id: check.id } },
                            body: { reason: reasons[check.id] ?? "" } as never,
                          }),
                        )
                      }
                    >
                      {t("reject")}
                    </Button>
                  </>
                )}
                {check.status === "approved" && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy === check.id || !reasons[check.id]}
                    onClick={() =>
                      run(check.id, () =>
                        api.POST("/api/v1/admin/identity-verifications/{id}/revoke", {
                          params: { path: { id: check.id } },
                          body: { reason: reasons[check.id] ?? "" } as never,
                        }),
                      )
                    }
                  >
                    {t("revoke")}
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground text-xs">{t("reasonHint")}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DocumentFigure({ href, caption, alt }: { href: string; caption: string; alt: string }) {
  return (
    <figure className="flex flex-col gap-1">
      <a href={href} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element -- streamed by a route handler, not a static asset. */}
        <img
          src={href}
          alt={alt}
          loading="lazy"
          className="border-border h-28 rounded-lg border object-contain"
        />
      </a>
      <figcaption className="text-muted-foreground text-xs">{caption}</figcaption>
    </figure>
  );
}
