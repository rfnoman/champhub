import { useTranslations } from "next-intl";
import { ExternalLink, MapPin, Navigation } from "lucide-react";

import { Button } from "@/components/ui/button";

import { TurfMap } from "./turf-map";

/**
 * Where a turf is, and the one tap that gets a player there.
 *
 * The map alone was a picture: it showed the pin and offered no way to act on it, so a
 * player heading out had to re-find the venue in Google Maps by name — which on a Dhaka
 * turf with three similarly-named neighbours is a wrong turn waiting to happen.
 *
 * Two links, and they are not the same link. **Directions** is the one that matters and
 * gets the emphasis: `dir/?api=1` opens the native app already routing. **View on Google
 * Maps** only appears when the owner shared their venue's own Maps page, which carries
 * the photos, reviews and opening hours a bare coordinate cannot.
 *
 * Both are plain anchors with `target="_blank"` — they leave the app for a different
 * origin, so there is no client-side route for `<Link>` to prefetch (CLAUDE.md).
 */
export function TurfLocation({
  name,
  area,
  address,
  latitude,
  longitude,
  directionsUrl,
  mapUrl,
}: {
  name: string;
  area: string;
  address: string;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  directionsUrl: string | null | undefined;
  mapUrl: string | null | undefined;
}) {
  const t = useTranslations("turfs");
  if (latitude == null || longitude == null) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-tight">{t("gettingThere")}</h2>
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{address}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {directionsUrl && (
            <Button size="sm" asChild>
              <a href={directionsUrl} target="_blank" rel="noreferrer">
                <Navigation aria-hidden />
                {t("directions")}
              </a>
            </Button>
          )}
          {mapUrl && (
            <Button size="sm" variant="outline" asChild>
              <a href={mapUrl} target="_blank" rel="noreferrer">
                {t("viewOnGoogleMaps")}
                <ExternalLink aria-hidden />
              </a>
            </Button>
          )}
        </div>
      </div>

      <TurfMap
        center={[latitude, longitude]}
        zoom={16}
        markers={[
          {
            id: `${latitude},${longitude}`,
            latitude,
            longitude,
            label: name,
            sublabel: area,
            // Tapping the pin is the other obvious way to ask for directions.
            href: directionsUrl || undefined,
          },
        ]}
      />
      <p className="text-muted-foreground text-xs">{t("directionsHint")}</p>
    </section>
  );
}
