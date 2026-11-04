"use client";

import { useTranslations } from "next-intl";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";

/**
 * The unhandled-error boundary.
 *
 * A client component by necessity — Next requires it — so it uses `useTranslations`
 * rather than `getTranslations`. It deliberately shows no stack and no message from the
 * exception: those leak internals to a player and mean nothing to them. Sentry already
 * has the detail (D67).
 *
 * `reset()` re-renders the segment, which is the right first move for the common case
 * here: a failed API call on a flaky mobile connection.
 */
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorPage");

  return (
    <PageContainer>
      <section className="flex flex-1 flex-col items-center justify-center gap-5 py-20 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("heading")}</h1>
          <p className="text-muted-foreground max-w-[44ch] text-sm leading-relaxed">{t("body")}</p>
        </div>
        <Button variant="brand" size="touch" onClick={reset}>
          {t("retry")}
        </Button>
      </section>
    </PageContainer>
  );
}
