"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AtSign, Check, Copy, Loader2 } from "lucide-react";

import { useApiClient } from "@/lib/api/use-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The @handle, for whoever is signed in (DOMAIN §1b).
 *
 * One panel for a player and for a turf owner, because a handle belongs to the account
 * and one account can be both — the same reasoning as the identity panel next to it.
 * **Copied** into both apps rather than shared (DECISIONS D84): the two copies must
 * stay in step.
 *
 * Three things it is careful about:
 *
 * 1. **It shows what would actually be stored.** The check endpoint answers with the
 *    normalised handle, so typing `@Rafiq_Hasan` reports on `rafiq_hasan` — the value
 *    the save would write — rather than echoing something that cannot exist.
 * 2. **The server's refusal is the message.** Length, shape and reserved words are all
 *    decided in one place, and this renders whatever sentence comes back instead of
 *    keeping a second, drifting copy of the rules in TypeScript.
 * 3. **A handle is for giving away**, so the profile link is here with a copy button.
 *    Pasting `/players/@rafiq_hasan` into a group chat is the whole point of having one.
 */
type Status = "idle" | "saving" | "saved" | "error";

/** The last answer from the check endpoint, tagged with the term it was asked about. */
type CheckResult = { term: string; username: string; available: boolean; reason: string };

export function UsernamePanel({
  username,
  /**
   * Absolute origin of the **player** app, where profiles live.
   *
   * An owner's handle resolves to a player profile, because it is one account with
   * several roles (DOMAIN §1) — so the link crosses apps and is an absolute URL
   * (`playerAppUrl()`, DECISIONS D83), never a route in this one.
   */
  profileOrigin,
}: {
  username: string;
  profileOrigin: string;
}) {
  const t = useTranslations("username");
  const router = useRouter();
  const api = useApiClient();

  const [value, setValue] = useState(username);
  // The handle as the server last confirmed it: what the share link points at, which is
  // not the same as what is half-typed in the input.
  const [saved, setSaved] = useState(username);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [copied, setCopied] = useState(false);

  const typed = value.trim().replace(/^@+/, "").toLowerCase();
  const pristine = !typed || typed === saved;

  useEffect(() => {
    if (pristine) return;

    let cancelled = false;
    // Debounced: a handle is short, and one request per keystroke would be most of them.
    const timer = setTimeout(async () => {
      const { data } = await api.GET("/api/v1/usernames/check", {
        params: { query: { username: typed } as never },
      });
      if (cancelled || !data) return;
      setResult({
        term: typed,
        username: data.username,
        available: data.available,
        reason: data.reason ?? "",
      });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, typed, pristine]);

  // Derived rather than stored, so a stale answer can never be shown as a fresh one:
  // anything the endpoint has not answered *for this exact term* reads as "checking".
  const check: "idle" | "checking" | "ok" | "bad" = pristine
    ? "idle"
    : result?.term !== typed
      ? "checking"
      : result.available
        ? "ok"
        : "bad";

  async function save() {
    setStatus("saving");
    setError(null);

    const { data, error: apiError } = await api.PUT("/api/v1/me/username", {
      body: { username: typed } as never,
    });

    if (apiError || !data) {
      setStatus("error");
      // The API names the field it is unhappy about; anything else is one sentence.
      const body = apiError as { username?: string[] } | undefined;
      setError(body?.username?.[0] ?? t("saveFailed"));
      return;
    }

    const stored = data.username || typed;
    setSaved(stored);
    setValue(stored);
    setStatus("saved");
    router.refresh();
  }

  const profileLink = `${profileOrigin}/players/@${saved}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(profileLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A browser that refuses clipboard access leaves the link on screen to select.
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="label-sm">{t("heading")}</CardTitle>
        <p className="text-muted-foreground text-xs">{t("body")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">{t("label")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <AtSign
                aria-hidden
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              />
              <Input
                id="username"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setStatus("idle");
                  setError(null);
                }}
                className="w-56 pl-8"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={21}
                aria-describedby="username-hint"
              />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={check !== "ok" || status === "saving"}
            >
              {status === "saving" ? t("saving") : saved ? t("change") : t("claim")}
            </Button>
          </div>

          <p id="username-hint" className="text-muted-foreground text-xs">
            {check === "checking" && (
              <span className="inline-flex items-center gap-1">
                <Loader2 aria-hidden className="size-3 animate-spin" />
                {t("checking")}
              </span>
            )}
            {check === "ok" && (
              <span className="text-brand inline-flex items-center gap-1">
                <Check aria-hidden className="size-3" />
                {t("available", { username: result?.username ?? typed })}
              </span>
            )}
            {check === "bad" && (
              <span className="text-destructive">{result?.reason || t("unavailable")}</span>
            )}
            {check === "idle" && t("rules")}
          </p>

          {error && (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          )}
          {status === "saved" && (
            <p role="status" className="text-muted-foreground text-xs">
              {t("saved", { handle: `@${saved}` })}
            </p>
          )}
        </div>

        {saved && (
          <div className="flex flex-col gap-1.5 border-t pt-4">
            <Label htmlFor="profile-link">{t("shareLabel")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="profile-link"
                readOnly
                value={profileLink}
                className="w-full max-w-sm font-mono text-xs"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button type="button" size="sm" variant="outline" onClick={copyLink}>
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied ? t("copied") : t("copy")}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">{t("shareHint")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
