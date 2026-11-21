import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { ArrowUpRight } from "lucide-react";

import { CounterReceipt } from "@/components/marketing/counter-receipt";
import { FloodlitStage } from "@/components/marketing/floodlit-stage";
import { RegisterJourney } from "@/components/marketing/register-journey";
import { TakingsSheet } from "@/components/marketing/takings-sheet";
import { UpkeepBoard } from "@/components/marketing/upkeep-board";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { playerAppUrl } from "@/lib/links";

/**
 * The owner app's public front door.
 *
 * Until this existed, `turf.champhub.fit` was inside the `(signed-in)` group and a
 * stranger who clicked "list your turf" in the player app met a Clerk sign-in box —
 * an invitation to join something they had been told nothing about. The player app
 * sends owners here, so this is where the argument for registering has to be made.
 *
 * It is the one page in this app that search engines should see. The root layout sets
 * `robots: noindex` because every other route is one turf's private operations, and
 * that is still right; this page overrides it for itself alone.
 *
 * A signed-in owner has no use for a sales pitch, so they go straight to their turfs.
 * The redirect also keeps every bookmark of `/` working, which matters because that is
 * where the dashboard used to live.
 */
export const metadata: Metadata = {
  title: "List your turf · ChampHub Turf",
  description:
    "Register your ground, take bookings without the phone calls, sell at the counter, and see what the night made.",
  robots: { index: true, follow: true },
};

export default async function OwnerLandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/turfs");

  const t = await getTranslations("ownerHome");

  return (
    <PageContainer width="bleed">
      {/* ---------------------------------------------------------------- Hero */}
      {/* `dark` rather than a parallel set of tokens, so every `dark:` utility inside
          resolves too. A floodlit pitch on paper-white is a contradiction: the light
          has nothing to be light against and the chalk, which is white, vanishes. */}
      <section className="dark pitch-night text-foreground relative isolate">
        <FloodlitStage>
          <div className="page-column relative grid items-center gap-10 px-4 py-20 sm:py-28 lg:grid-cols-[1.05fr_minmax(0,23rem)] lg:gap-14">
            <div className="flex flex-col items-start gap-6">
              {/* The page's only <h1>; the e2e contract asserts exactly one. */}
              <h1 className="display-2xl max-w-[14ch] text-balance">{t("heading")}</h1>
              <p className="text-muted-foreground max-w-[50ch] text-lg leading-relaxed">
                {t("body")}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="brand" size="cta" asChild>
                  <Link href="/new">{t("ctaRegister")}</Link>
                </Button>
                <Button variant="outline" size="cta" asChild>
                  <Link href="/turfs">{t("ctaSignIn")}</Link>
                </Button>
              </div>
              {/* What an owner wants to know before anything else, and the honest
                  version of it: there is no listing fee, and the commission only
                  applies to money that actually arrived. */}
              <p className="text-muted-foreground max-w-[44ch] text-sm">{t("heroNote")}</p>
            </div>

            <TakingsSheet />
          </div>
        </FloodlitStage>
      </section>

      {/* ------------------------------------------------------------- Register */}
      <section className="border-border/60 border-t">
        <div className="page-column flex flex-col gap-10 px-4 py-16 sm:py-20">
          <div className="flex flex-col gap-2">
            <h2 className="display-lg">{t("registerTitle")}</h2>
            <p className="text-muted-foreground max-w-[56ch]">{t("registerBody")}</p>
          </div>
          <RegisterJourney />
        </div>
      </section>

      {/* -------------------------------------------------------------- Counter */}
      <section className="border-border/60 border-t">
        <div className="page-column grid gap-8 px-4 py-16 sm:py-20 lg:grid-cols-[1fr_26rem] lg:items-center lg:gap-12">
          <div className="flex flex-col items-start gap-4">
            <h2 className="display-lg">{t("counterTitle")}</h2>
            <p className="text-muted-foreground max-w-[52ch]">{t("counterBody")}</p>
            <ul className="text-muted-foreground flex flex-col gap-2 text-sm">
              <li>{t("counterPoint1")}</li>
              <li>{t("counterPoint2")}</li>
              <li>{t("counterPoint3")}</li>
            </ul>
          </div>
          <CounterReceipt />
        </div>
      </section>

      {/* --------------------------------------------------------------- Upkeep */}
      <section className="border-border/60 border-t">
        <div className="page-column grid gap-8 px-4 py-16 sm:py-20 lg:grid-cols-[26rem_1fr] lg:items-center lg:gap-12">
          {/* The panel leads on this one. The counter section put its fragment on the
              right; alternating keeps a long page from reading as a stack of
              identical slabs. */}
          <div className="order-2 lg:order-1">
            <UpkeepBoard />
          </div>
          <div className="order-1 flex flex-col items-start gap-4 lg:order-2">
            <h2 className="display-lg">{t("upkeepTitle")}</h2>
            <p className="text-muted-foreground max-w-[52ch]">{t("upkeepBody")}</p>
            <ul className="text-muted-foreground flex flex-col gap-2 text-sm">
              <li>{t("upkeepPoint1")}</li>
              <li>{t("upkeepPoint2")}</li>
              <li>{t("upkeepPoint3")}</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ CTA */}
      <section className="border-border/60 border-t">
        <div className="page-column flex flex-col items-start gap-5 px-4 py-16 sm:py-20">
          <h2 className="display-lg max-w-[20ch] text-balance">{t("closeTitle")}</h2>
          <p className="text-muted-foreground max-w-[52ch]">{t("closeBody")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="brand" size="cta" asChild>
              <Link href="/new">{t("ctaRegister")}</Link>
            </Button>
            {/* A separate origin (D83), so a plain anchor and never <Link>. */}
            <Button variant="outline" size="touch" asChild>
              <a href={playerAppUrl()}>
                {t("ctaPlayerApp")}
                <ArrowUpRight aria-hidden />
              </a>
            </Button>
          </div>
        </div>
      </section>
    </PageContainer>
  );
}
