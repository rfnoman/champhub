import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";

/**
 * The 404.
 *
 * There was no `not-found.tsx` anywhere for eleven phases, so a missing turf, an
 * unapproved one, or an admin page reached by a player all got Next's bare default —
 * unstyled, untranslated, and stark white behind a dark app. It is reachable by
 * ordinary means (D-era turf rules hide unapproved turfs with a 404), so it is a real
 * screen, not an error state.
 */
export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <PageContainer>
      <section className="flex flex-1 flex-col items-center justify-center gap-5 py-20 text-center">
        <span className="num text-brand/35 text-7xl font-extrabold">404</span>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("heading")}</h1>
          <p className="text-muted-foreground max-w-[44ch] text-sm leading-relaxed">{t("body")}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="brand" size="touch" asChild>
            <Link href="/play">{t("findMatch")}</Link>
          </Button>
          <Button variant="outline" size="touch" asChild>
            <Link href="/">{t("home")}</Link>
          </Button>
        </div>
      </section>
    </PageContainer>
  );
}
