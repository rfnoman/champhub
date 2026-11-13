import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRight } from "lucide-react";

import { AvailabilityTicker } from "@/components/marketing/availability-ticker";
import { MatchJourney } from "@/components/marketing/match-journey";
import { OwnerCounter } from "@/components/marketing/owner-counter";
import { SlotStrip } from "@/components/marketing/slot-strip";
import { SportShowcase } from "@/components/marketing/sport-showcase";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { ownerAppUrl } from "@/lib/links";

/**
 * The public landing page.
 *
 * It renders `bleed`, so the hero carries the floodlight edge to edge rather than
 * sitting inside the same reading column as a list of bookings. The `.page-column`
 * inside the hero is what keeps the wordmark, the headline and the footer on one
 * vertical — `e2e/align.spec.ts` measures exactly that.
 *
 * The hero is the one place in the app with a dark surface regardless of theme (see
 * `pitch-night` in globals.css). A floodlit pitch on paper-white is a contradiction:
 * the light has nothing to be light against, and the chalk markings — which are white —
 * vanish. Everything below the ticker is theme-aware as usual.
 */
export default async function HomePage() {
  const t = await getTranslations("home");

  return (
    <PageContainer width="bleed">
      {/* ---------------------------------------------------------------- Hero */}
      {/* `dark` rather than a parallel set of tokens, so every `dark:` utility inside
          resolves too — `@custom-variant dark (&:is(.dark *))`. Hand-overriding
          `--background` would re-tint the surfaces and leave `Button`'s
          `dark:border-input` branch on its light-mode value. */}
      <section className="dark pitch-night text-foreground relative isolate">
        <div className="relative overflow-hidden">
          {/* ---- The floodlights. One orchestrated sequence, in CSS so it starts at
                   first paint rather than waiting for the motion chunk (D72). ---- */}

          {/* The bloom: what the lamps do to the air above the pitch. */}
          <div
            aria-hidden
            className="flood-beam pointer-events-none absolute inset-x-0 -top-32 h-[34rem]"
            style={{
              background:
                "radial-gradient(60% 70% at 50% 0%, color-mix(in oklch, var(--glow) 24%, transparent), transparent 70%)",
            }}
          />
          {/* Two masts. The beams are what make this read as floodlit rather than
              gradient-washed — a cone has a source, and a wash does not.

              The blur has to live on a *parent* of the clipped element. CSS applies
              `filter` before `clip-path`, so a single div carrying both gets its soft
              edges sliced straight back off and renders as a hard green triangle. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 left-[24%] h-[48rem] w-[34rem] -translate-x-1/2 blur-[44px]"
          >
            <div
              className="flood-beam size-full"
              style={{
                clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0 100%)",
                background:
                  "linear-gradient(to bottom, color-mix(in oklch, var(--glow) 42%, transparent), transparent 68%)",
              }}
            />
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 left-[78%] h-[48rem] w-[32rem] -translate-x-1/2 blur-[44px]"
          >
            <div
              className="flood-beam size-full"
              style={{
                animationDelay: "170ms",
                clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0 100%)",
                background:
                  "linear-gradient(to bottom, color-mix(in oklch, var(--glow) 32%, transparent), transparent 68%)",
              }}
            />
          </div>

          {/* Where the beams land. Grass under a mast is a bright ellipse, not an
              even wash, and the falloff between the two pools is what sells it. */}
          <div
            aria-hidden
            className="flood-beam pointer-events-none absolute inset-x-0 top-0 h-full"
            style={{
              animationDelay: "90ms",
              background:
                "radial-gradient(42% 50% at 24% 48%, color-mix(in oklch, var(--glow) 14%, transparent), transparent 72%), radial-gradient(38% 46% at 78% 42%, color-mix(in oklch, var(--glow) 12%, transparent), transparent 72%)",
            }}
          />

          {/* ---- The markings, chalked on as the light finds them. ----
                  `pathLength="1"` normalises every path, so one dash length draws a
                  circle and a straight line alike; `non-scaling-stroke` keeps them
                  true hairlines after `slice` has scaled the viewBox. The centre of a
                  pitch is one object — line, circle, spot — which is why that is all
                  there is. */}
          <svg
            aria-hidden
            viewBox="0 0 1200 620"
            preserveAspectRatio="xMidYMid slice"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            className="text-chalk pointer-events-none absolute inset-0 size-full"
          >
            <line
              x1="0"
              y1="310"
              x2="1200"
              y2="310"
              pathLength={1}
              vectorEffect="non-scaling-stroke"
              className="chalk-mark opacity-15"
            />
            <circle
              cx="770"
              cy="310"
              r="175"
              pathLength={1}
              vectorEffect="non-scaling-stroke"
              className="chalk-mark opacity-20"
              style={{ animationDelay: "420ms" }}
            />
            <circle
              cx="770"
              cy="310"
              r="4"
              fill="currentColor"
              stroke="none"
              className="opacity-20"
            />
          </svg>

          {/* -------------------------------------------------------- Hero content */}
          <div className="page-column relative grid items-center gap-10 px-4 py-20 sm:py-28 lg:grid-cols-[1.05fr_minmax(0,23rem)] lg:gap-14">
            <div className="flex flex-col items-start gap-6">
              {/* The page's only <h1>; smoke.spec.ts asserts exactly one is visible.
                  No eyebrow above it — the light is the thing that introduces the
                  headline, and a tracked label over every heading is the commonest
                  tell of a templated page. */}
              <h1 className="display-2xl max-w-[13ch] text-balance">{t("heading")}</h1>
              <p className="text-muted-foreground max-w-[50ch] text-lg leading-relaxed">
                {t("body")}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="brand" size="cta" asChild>
                  <Link href="/play">{t("ctaPlay")}</Link>
                </Button>
                {/* The owner app is its own deployment (DECISIONS D83), so both of
                    this page's owner calls to action cross origins. */}
                <Button variant="outline" size="cta" asChild>
                  <a href={ownerAppUrl()}>{t("ctaOwner")}</a>
                </Button>
              </div>
              {/* Two facts a first-time visitor actually wants, rather than a third
                  call to action. The two hours is `BOOKING_CONFIRM_WINDOW_HOURS`. */}
              <p className="text-muted-foreground max-w-[42ch] text-sm">{t("heroNote")}</p>
            </div>

            <SlotStrip />
          </div>
        </div>

        {/* The hero's floor: tonight, across Dhaka, going past. */}
        <AvailabilityTicker />
      </section>

      {/* -------------------------------------------------------------- Sports */}
      <section className="border-border/60 border-t">
        <div className="page-column flex flex-col gap-8 px-4 py-16 sm:py-20">
          <div className="flex flex-col gap-2">
            <h2 className="display-lg">{t("sportsTitle")}</h2>
            <p className="text-muted-foreground max-w-[56ch]">{t("sportsBody")}</p>
          </div>
          <SportShowcase />
        </div>
      </section>

      {/* --------------------------------------------------------------- Steps */}
      <section className="border-border/60 border-t">
        <div className="page-column flex flex-col gap-10 px-4 py-16 sm:py-20">
          <h2 className="display-lg">{t("stepsTitle")}</h2>
          <MatchJourney />
        </div>
      </section>

      {/* --------------------------------------------------------------- Owner */}
      <section className="border-border/60 border-t">
        <div className="page-column grid gap-8 px-4 py-16 sm:py-20 lg:grid-cols-[1fr_26rem] lg:items-center lg:gap-12">
          <div className="flex flex-col items-start gap-4">
            <h2 className="display-lg">{t("ownerTitle")}</h2>
            <p className="text-muted-foreground max-w-[52ch]">{t("ownerBody")}</p>
            <Button variant="outline" size="touch" asChild className="mt-2">
              <a href={ownerAppUrl()}>
                {t("ctaOwner")}
                <ArrowUpRight aria-hidden />
              </a>
            </Button>
          </div>
          <OwnerCounter />
        </div>
      </section>
    </PageContainer>
  );
}
