import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BookingStatusBadge } from "@/components/booking/booking-status";
import { BookingTime, DhakaMoment } from "@/components/booking/booking-time";
import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { getServerApiClient } from "@/lib/api/server";
import { approxDuration, matchUnitLabel } from "@/lib/match-terms";

import { StaffActions } from "./staff-actions";

export const metadata = { title: "Booking · ChampHub Turf" };

/**
 * One booking, as the turf sees it.
 *
 * In the player app this was the staff half of `/bookings/[bookingId]`, rendered behind
 * an `isStaff` flag the page worked out by fetching the reader's own turfs on every
 * view — a player's page carrying an owner's buttons. Here it is a turf page: it is
 * reached from the day view, it is scoped to the turf in the URL, and it shows the
 * customer's phone number, which is a thing staff need and other players should not see.
 *
 * The API still decides every transition; this only decides what to render.
 */
export default async function TurfBookingPage({
  params,
}: {
  params: Promise<{ slug: string; bookingId: string }>;
}) {
  const { slug, bookingId } = await params;

  const api = await getServerApiClient();
  const { data } = await api.GET("/api/v1/bookings/{id}", {
    params: { path: { id: bookingId } },
  });

  // A booking at another turf is not this turf's business, even for an owner who holds
  // both — the day view is per turf, so the detail page is too.
  if (!data || data.turf_slug !== slug) notFound();

  const t = await getTranslations("ownerBooking");
  const c = await getTranslations("common");
  // Staff need to know what was sold, not only when: this booking bought 10 overs
  // (DECISIONS D102), and the two hours it reserved are an estimate.
  const unit = matchUnitLabel(data);
  const approx = unit
    ? approxDuration(Math.round((Date.parse(data.ends_at) - Date.parse(data.starts_at)) / 60_000))
    : null;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={data.player_name}
        body={[
          `${data.ground_name} · ${data.sport.name} ${data.sport_format.name}`,
          unit && c(unit.key, unit.values),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <BookingStatusBadge status={data.status} label={data.status_label} />
            <Money amount={data.price} className="text-lg font-semibold" />
          </>
        }
      />

      <p className="text-sm">
        <BookingTime start={data.starts_at} end={data.ends_at} />
        {approx && <span className="text-muted-foreground"> · {c(approx.key, approx.values)}</span>}
      </p>

      {data.cancel_reason && (
        <Card>
          <CardContent className="text-destructive py-4 text-sm">{data.cancel_reason}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="label-sm">{t("actions")}</CardTitle>
        </CardHeader>
        <CardContent>
          <StaffActions booking={data} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="label-sm">{t("timeline")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3">
              {data.events.map((event) => (
                <li key={event.id} className="flex items-start gap-3 text-sm">
                  <span aria-hidden className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{event.to_status_label}</span>
                    {event.actor_name && (
                      <span className="text-muted-foreground"> · {event.actor_name}</span>
                    )}
                    {event.note && (
                      <span className="text-muted-foreground block text-xs">{event.note}</span>
                    )}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    <DhakaMoment at={event.created_at} />
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="label-sm">{t("details")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row label={t("player")} value={data.player_name} />
            {data.booked_for_phone && <Row label={t("phone")} value={data.booked_for_phone} />}
            <Row
              label={t("payment")}
              value={
                data.payments.length > 0
                  ? t("paidAmount", { amount: data.payments[0].amount })
                  : t("payAtTurf")
              }
            />
            <Row
              label={t("cancellationPolicy")}
              value={t("freeUntil", { hours: data.cancellation_free_hours })}
            />
            {data.notes && <Row label={t("notes")} value={data.notes} />}
            {data.auto_confirmed && (
              <Badge variant="outline" className="self-start">
                {t("autoConfirmed")}
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <Button variant="outline" size="sm" asChild className="self-start">
        <Link href={`/turfs/${slug}/bookings`}>{t("backToDay")}</Link>
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
