import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRight } from "lucide-react";

import { HeroMatch } from "@/components/marketing/hero-match";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";

/**
 * The public landing page — the whole marketing surface, which until Phase 12 was a
 * heading, a paragraph and two buttons.
 *
 * It renders `bleed`, so the hero can carry the floodlight edge to edge rather than
 * sitting inside the same reading column as a list of bookings.
 */

/**
 * The four seeded sports (DOMAIN §2). Slugs match the Django catalogue, which is what
 * `data-sport` keys off — an unknown slug falls back to the house green rather than
 * rendering untinted, which matters because admins can approve a fifth.
 */
const SPORTS = [
  { slug: "football", icon: "⚽" },
  { slug: "futsal", icon: "🥅" },
  { slug: "cricket", icon: "🏏" },
  { slug: "badminton", icon: "🏸" },
] as const;

export default async function HomePage() {
  const t = await getTranslations("home");

  const steps = [
    { title: t("step1Title"), body: t("step1Body") },
    { title: t("step2Title"), body: t("step2Body") },
    { title: t("step3Title"), body: t("step3Body") },
  ];

  return (
    <PageContainer width="bleed">
      {/* ---------------------------------------------------------------- Hero */}
      <section className="floodlight relative overflow-hidden">
        {/* The centre circle, cropped by the top edge: pitch geometry doing the job a
            decorative blob usually does. */}
        <div
          aria-hidden
          className="border-chalk/8 pointer-events-none absolute -top-[22rem] left-1/2 size-[44rem] -translate-x-1/2 rounded-full border"
        />
        <div
          aria-hidden
          className="border-chalk/10 pointer-events-none absolute -top-[14rem] left-1/2 size-[28rem] -translate-x-1/2 rounded-full border"
        />

        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:py-24 lg:grid-cols-[1.15fr_auto] lg:gap-16">
          <div className="flex flex-col items-start gap-6">
            <span className="text-brand text-sm font-medium">{t("kicker")}</span>
            {/* The page's only <h1>; smoke.spec.ts asserts exactly one is visible. */}
            <h1 className="display-xl max-w-[14ch] text-balance">{t("heading")}</h1>
            <p className="text-muted-foreground max-w-[52ch] text-lg leading-relaxed">
              {t("body")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="brand" size="cta" asChild>
                <Link href="/play">{t("ctaPlay")}</Link>
              </Button>
              <Button variant="outline" size="cta" asChild>
                <Link href="/owner">{t("ctaOwner")}</Link>
              </Button>
            </div>
          </div>

          <HeroMatch />
        </div>
      </section>

      {/* -------------------------------------------------------------- Sports */}
      <section className="border-border/60 border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16">
          <div className="flex flex-col gap-2">
            <h2 className="display-lg">{t("sportsTitle")}</h2>
            <p className="text-muted-foreground max-w-[56ch]">{t("sportsBody")}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SPORTS.map((sport) => (
              <li
                key={sport.slug}
                data-sport={sport.slug}
                className="glass-panel border-sport/25 flex items-center gap-3 rounded-2xl p-5"
              >
                {/* Emoji come from the Django catalogue and the e2e suite matches on
                    them; they are decorative here, so they stay hidden from the reader. */}
                <span aria-hidden className="text-2xl">
                  {sport.icon}
                </span>
                <span className="font-display text-sport text-base font-semibold">
                  {t(`sport_${sport.slug}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* --------------------------------------------------------------- Steps */}
      <section className="border-border/60 border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16">
          <h2 className="display-lg">{t("stepsTitle")}</h2>
          {/* Numbered because this genuinely is a sequence — you cannot fill a match
              you have not booked. */}
          <ol className="grid gap-6 sm:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="flex flex-col gap-2">
                <span className="num text-brand text-sm font-semibold">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span aria-hidden className="chalk-line mb-2 h-px w-full" />
                <h3 className="font-display text-lg font-semibold tracking-tight">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* --------------------------------------------------------------- Owner */}
      <section className="border-border/60 border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-16">
          <h2 className="display-lg">{t("ownerTitle")}</h2>
          <p className="text-muted-foreground max-w-[56ch]">{t("ownerBody")}</p>
          <Button variant="outline" size="touch" asChild className="mt-2">
            <Link href="/owner">
              {t("ctaOwner")}
              <ArrowUpRight aria-hidden />
            </Link>
          </Button>
        </div>
      </section>
    </PageContainer>
  );
}
