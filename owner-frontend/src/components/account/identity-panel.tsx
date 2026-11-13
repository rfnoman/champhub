"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, Clock, ShieldAlert, ShieldCheck, Upload } from "lucide-react";

import type { IdentityDocumentType, IdentityVerification } from "@/lib/api/types";
import { useApiClient } from "@/lib/api/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Identity verification, for whoever is signed in (DOMAIN §1a).
 *
 * One panel serves a player and a turf owner, because one account can be both and there
 * is one identity behind it. It is **copied** into both apps rather than shared, like
 * every other component here (DECISIONS D84) — the two copies must stay in step.
 *
 * Three things it is careful about:
 *
 * 1. **The documents never become URLs.** The previews point at this app's
 *    `/api/identity/me/<field>` route, which forwards the session to Django and streams
 *    the bytes back; nothing on the page holds a link anybody else could follow.
 * 2. **Saving and submitting are separate.** Uploading a scan on a phone, over a
 *    Bangladeshi mobile connection, is the slow and failure-prone step. It is its own
 *    button, so a failed submit never means uploading the photograph again.
 * 3. **The server decides what is missing.** Field errors are rendered where the field
 *    is, with the API's own message as the fallback for anything this UI has no wording
 *    for — a 400 should never surface as "something went wrong".
 */
const DOCUMENT_TYPES = [
  "nid",
  "driving_licence",
  "birth_certificate",
  "passport",
] as const satisfies readonly IdentityDocumentType[];

type FieldErrors = Record<string, string[] | undefined>;
type Status = "idle" | "working" | "error";

/** The document previews, served by this app's own authenticated proxy route. */
function filePath(field: "document_front" | "document_back"): string {
  return `/api/identity/me/${field}`;
}

export function IdentityPanel({ verification }: { verification: IdentityVerification }) {
  const t = useTranslations("identity");
  const router = useRouter();
  const api = useApiClient();

  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [documentType, setDocumentType] = useState<string>(verification.document_type ?? "");
  const [documentNumber, setDocumentNumber] = useState("");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  // Bumped after a successful save so the two file inputs remount empty. Clearing the
  // React state alone leaves the browser still showing "passport.png" next to a slot
  // that now reads "on file", which looks like the upload did not take.
  const [savedCount, setSavedCount] = useState(0);

  const editable = verification.is_editable;
  const verified = verification.status === "approved";

  /** Render a 400 body as field errors; anything else as one message on the form. */
  function handleFailure(error: unknown) {
    setStatus("error");
    if (error && typeof error === "object") {
      const body = error as Record<string, unknown>;
      const mapped: FieldErrors = {};
      for (const [field, value] of Object.entries(body)) {
        mapped[field] = Array.isArray(value) ? value.map(String) : [String(value)];
      }
      setErrors(mapped);
      return;
    }
    setErrors({ form: [t("saveFailed")] });
  }

  /**
   * Our wording for the fields we know about, the server's message for anything else.
   *
   * The fallback is the point: the API validates more than this form knows about, and a
   * 400 nobody translated should still arrive as a sentence rather than as "error".
   */
  function messageFor(field: string): string | null {
    const reported = errors[field]?.[0];
    if (!reported) return null;
    const ours: Record<string, string> = {
      photo: t("missing.photo"),
      document_type: t("missing.documentType"),
      document_number: t("missing.documentNumber"),
      document_front: t("missing.documentFront"),
    };
    return ours[field] ?? reported;
  }

  async function uploadPhoto(file: File) {
    setStatus("working");
    setErrors({});
    const body = new FormData();
    body.append("photo", file);
    const { error } = await api.PATCH("/api/v1/me", { body: body as never });
    if (error) return handleFailure(error);
    setStatus("idle");
    router.refresh();
  }

  async function saveDocuments() {
    setStatus("working");
    setErrors({});
    const body = new FormData();
    if (documentType) body.append("document_type", documentType);
    if (documentNumber.trim()) body.append("document_number", documentNumber.trim());
    if (front) body.append("document_front", front);
    if (back) body.append("document_back", back);

    const { error } = await api.PATCH("/api/v1/me/identity", { body: body as never });
    if (error) return handleFailure(error);
    setStatus("idle");
    setFront(null);
    setBack(null);
    setDocumentNumber("");
    setSavedCount((count) => count + 1);
    router.refresh();
  }

  async function submit() {
    setStatus("working");
    setErrors({});
    const { error } = await api.POST("/api/v1/me/identity/submit", {});
    if (error) return handleFailure(error);
    setStatus("idle");
    router.refresh();
  }

  return (
    <Card data-testid="identity-panel">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="label-sm">{t("panelHeading")}</CardTitle>
          <p className="text-muted-foreground mt-1 text-xs">{t("body")}</p>
        </div>
        <StatusBadge status={verification.status} />
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {verification.status === "submitted" && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Clock className="size-4 shrink-0" aria-hidden />
            {t("submittedNote")}
          </p>
        )}

        {verification.status === "rejected" && verification.review_note && (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong className="font-semibold">{t("rejectedHeading")}</strong>{" "}
              {verification.review_note}
            </span>
          </p>
        )}

        {verified && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <BadgeCheck className="text-brand size-4 shrink-0" aria-hidden />
            {t("approvedNote", {
              document: t(`types.${verification.document_type}`),
              number: verification.document_number,
            })}
          </p>
        )}

        {/* The photograph. Account-level, so it is the same one in both apps. */}
        <section className="flex flex-wrap items-center gap-4">
          {verification.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- Clerk/S3 host, not a known loader.
            <img
              src={verification.photo_url}
              alt=""
              className="border-border size-16 rounded-full border object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="bg-muted text-muted-foreground flex size-16 items-center justify-center rounded-full"
            >
              <Upload className="size-5" />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-medium">{t("photoHeading")}</span>
            <span className="text-muted-foreground text-xs">{t("photoHint")}</span>
            <div>
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label={t("photoHeading")}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadPhoto(file);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={status === "working"}
                onClick={() => photoInput.current?.click()}
              >
                {verification.has_photo ? t("photoChange") : t("photoAdd")}
              </Button>
            </div>
            <FieldError message={messageFor("photo")} />
          </div>
        </section>

        {/* The document itself. Frozen once it is with a reviewer. */}
        <section className="flex flex-col gap-4 border-t pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="identity-type">{t("type")}</Label>
              <select
                id="identity-type"
                value={documentType}
                disabled={!editable || status === "working"}
                onChange={(event) => setDocumentType(event.target.value)}
                className="field-select border-input bg-background h-9 rounded-lg border px-2.5 text-sm disabled:opacity-50"
              >
                <option value="">{t("typePlaceholder")}</option>
                {DOCUMENT_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {t(`types.${option}`)}
                  </option>
                ))}
              </select>
              <FieldError message={messageFor("document_type")} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="identity-number">{t("number")}</Label>
              <Input
                id="identity-number"
                value={documentNumber}
                disabled={!editable || status === "working"}
                placeholder={verification.document_number || t("numberPlaceholder")}
                onChange={(event) => setDocumentNumber(event.target.value)}
                maxLength={60}
                inputMode="numeric"
              />
              <p className="text-muted-foreground text-xs">{t("numberHint")}</p>
              <FieldError message={messageFor("document_number")} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <DocumentSlot
              key={`front-${savedCount}`}
              field="document_front"
              label={t("front")}
              hint={t("frontHint")}
              uploaded={verification.has_document_front}
              chosen={front}
              editable={editable}
              onChoose={setFront}
              viewLabel={t("view")}
              emptyLabel={t("choose")}
              onFileLabel={editable ? t("replace") : t("onFile")}
              error={messageFor("document_front")}
            />
            <DocumentSlot
              key={`back-${savedCount}`}
              field="document_back"
              label={t("back")}
              hint={t("backHint")}
              uploaded={verification.has_document_back}
              chosen={back}
              editable={editable}
              onChoose={setBack}
              viewLabel={t("view")}
              emptyLabel={t("choose")}
              onFileLabel={editable ? t("replace") : t("onFile")}
              error={messageFor("document_back")}
            />
          </div>

          <FieldError
            message={messageFor("form") ?? messageFor("status") ?? messageFor("detail")}
          />

          {editable && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  status === "working" || (!documentType && !documentNumber && !front && !back)
                }
                onClick={() => void saveDocuments()}
              >
                {status === "working" ? t("saving") : t("save")}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={status === "working"}
                onClick={() => void submit()}
              >
                <ShieldCheck aria-hidden />
                {t("submit")}
              </Button>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: IdentityVerification["status"] }) {
  const t = useTranslations("identity");
  const variant =
    status === "approved" ? "brand" : status === "rejected" ? "destructive" : "secondary";
  return <Badge variant={variant}>{t(`status.${status}`)}</Badge>;
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive text-xs">
      {message}
    </p>
  );
}

/**
 * One document slot: the file input, what is currently on record, and a way to look at
 * it. The wording has four cases and they are easy to get wrong — "choose a new one to
 * replace it" next to a disabled input reads as a bug.
 */
function DocumentSlot({
  field,
  label,
  hint,
  uploaded,
  chosen,
  editable,
  onChoose,
  viewLabel,
  emptyLabel,
  onFileLabel,
  error,
}: {
  field: "document_front" | "document_back";
  label: string;
  hint: string;
  uploaded: boolean;
  chosen: File | null;
  editable: boolean;
  onChoose: (file: File | null) => void;
  viewLabel: string;
  emptyLabel: string;
  onFileLabel: string;
  error: string | null;
}) {
  const inputId = `identity-${field}`;
  const state = chosen ? chosen.name : uploaded ? onFileLabel : editable ? hint : emptyLabel;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      {editable && (
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="file:bg-muted file:text-foreground text-muted-foreground w-full text-xs file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-xs file:font-medium"
          onChange={(event) => onChoose(event.target.files?.[0] ?? null)}
        />
      )}
      <p className="text-muted-foreground text-xs">{state}</p>
      {uploaded && (
        <a
          href={filePath(field)}
          target="_blank"
          rel="noreferrer"
          className="text-brand text-xs underline underline-offset-2"
        >
          {viewLabel}
        </a>
      )}
      <FieldError message={error} />
    </div>
  );
}
