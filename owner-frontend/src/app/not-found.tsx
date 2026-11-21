import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";

/**
 * The 404.
 *
 * Reachable by ordinary means here: a turf whose slug changed, a booking that belongs
 * to another turf, a staff member whose membership was removed while they had the page
 * open. So it is a real screen, not an error state — and the way out is the list of
 * turfs the reader actually holds.
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
            <Link href="/turfs">{t("turfs")}</Link>
          </Button>
        </div>
      </section>
    </PageContainer>
  );
}
