import { getTranslations } from "next-intl/server";

import { getServerApiClient } from "@/lib/api/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The QR code a player holds up at a turf counter (tasks.md).
 *
 * The manager points their phone's own camera at it and lands on the walk-in form with
 * this player already chosen — so nobody is typing a handle they heard once over a
 * queue. There is no scanner in either app and no camera permission to grant; the code
 * is an ordinary https link, which every phone camera already resolves.
 *
 * The SVG is rendered by the backend and inlined here rather than loaded as an image:
 * the page is server-rendered anyway, so it costs no second request, and `currentColor`
 * means the code inverts with the theme instead of being a black square at night.
 *
 * Shown only on the player's own profile. The code carries nothing private — a handle
 * is public by design (DOMAIN §1b) — but a QR on somebody else's profile would invite
 * exactly the misunderstanding that it is theirs to use.
 */
export async function CounterCode() {
  const t = await getTranslations("counterCode");
  const api = await getServerApiClient();
  const { data } = await api.GET("/api/v1/me/counter-code");

  // 409 when the account has no handle yet: nothing to encode, and the username prompt
  // elsewhere on the page is the thing to do about it.
  if (!data?.svg) return null;

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="label-sm">{t("heading")}</CardTitle>
        <p className="text-muted-foreground text-xs">{t("hint")}</p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-5">
        <div
          className="bg-background text-foreground shrink-0 rounded-xl border p-3"
          // Server-rendered by `apps/players/qr.py` from the player's own handle; there
          // is no user-supplied content in it (a handle is `[a-z0-9_]`, DOMAIN §1b).
          dangerouslySetInnerHTML={{ __html: data.svg }}
          role="img"
          aria-label={t("ariaLabel", { handle: data.handle })}
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold tracking-tight">{data.handle}</p>
          <p className="text-muted-foreground mt-1 text-sm">{t("sayIt")}</p>
        </div>
      </CardContent>
    </Card>
  );
}
