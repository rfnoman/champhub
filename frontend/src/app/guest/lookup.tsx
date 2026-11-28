"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, MapPin, Navigation } from "lucide-react";

import { createPublicApiClient } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/ui/money";

type GuestBooking = {
  id: string;
  turf_name: string;
  turf_area: string;
  ground_name: string;
  sport_name: string;
  format_name: string;
  start: string;
  end: string;
  price: string;
  status_label: string;
  directions_url: string;
};

/**
 * Phone number and the code from the counter.
 *
 * The code is the secret, not the number: a lookup on a number alone would let anybody
 * who knows one read a stranger's evening plans. The backend answers a wrong number and
 * a wrong code identically — so this component has one failure message, deliberately,
 * rather than being helpful about which half was wrong.
 *
 * Uses the **public** API client: there is no session here by definition.
 */
export function GuestLookup() {
  const t = useTranslations("guest");

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    name: string;
    bookings: GuestBooking[];
  } | null>(null);

  async function look() {
    setBusy(true);
    setError(null);
    const { data, error: apiError } = await createPublicApiClient().POST("/api/v1/guest/bookings", {
      body: { phone, code } as never,
    });
    setBusy(false);
    if (apiError || !data) {
      setError(t("notFound"));
      setResult(null);
      return;
    }
    const payload = data as unknown as {
      guest: { name: string };
      bookings: GuestBooking[];
    };
    setResult({ name: payload.guest.name, bookings: payload.bookings });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="label-sm">{t("lookupHeading")}</CardTitle>
          <p className="text-muted-foreground text-xs">{t("lookupHint")}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-phone">{t("phone")}</Label>
              <Input
                id="guest-phone"
                inputMode="tel"
                placeholder="01711234567"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="w-48"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-code">{t("code")}</Label>
              <Input
                id="guest-code"
                value={code}
                placeholder="ABC234"
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                className="num w-32 tracking-widest uppercase"
              />
            </div>
            <Button
              disabled={busy || !phone.trim() || !code.trim()}
              onClick={look}
              className="self-end"
            >
              {busy ? t("looking") : t("look")}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <section className="flex flex-col gap-3" aria-live="polite">
          <h2 className="font-display text-lg font-bold tracking-tight">
            {t("yours", { name: result.name })}
          </h2>
          {result.bookings.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("none")}</p>
          ) : (
            result.bookings.map((booking) => (
              <Card key={booking.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="font-display font-bold tracking-tight">{booking.turf_name}</p>
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <MapPin className="size-3 shrink-0" aria-hidden />
                      {booking.turf_area} · {booking.ground_name}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-sm">
                      <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                      {/* The server speaks UTC and the turf is in Dhaka; the browser's
                          own locale formatting is right here, because a guest reading
                          this is standing in Bangladesh. */}
                      {new Date(booking.start).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {booking.sport_name} · {booking.format_name} · {booking.status_label}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Money amount={booking.price} />
                    {booking.directions_url && (
                      <Button size="xs" variant="outline" asChild>
                        <a href={booking.directions_url} target="_blank" rel="noreferrer">
                          <Navigation aria-hidden />
                          {t("directions")}
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
          <p className="text-muted-foreground text-xs">{t("joinHint")}</p>
        </section>
      )}
    </div>
  );
}
