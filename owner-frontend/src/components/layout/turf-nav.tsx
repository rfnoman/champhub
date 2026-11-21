"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { playerAppUrl } from "@/lib/links";

import { TURF_TABS, isTabActive } from "./turf-tabs";

/**
 * The desktop navigation for one turf.
 *
 * It was seven `variant="outline"` buttons in a flex row — every destination shouting
 * equally, with no indication of which one you were on. A turf owner moves between
 * these all evening, so it is a tab strip with a current state, and the till gets the
 * emphasis because it is the one used with a queue waiting.
 *
 * Hidden on phones, where the tab bar at the bottom of the screen carries the same
 * destinations from `TURF_TABS`.
 */
export function TurfNav({ slug, isApproved }: { slug: string; isApproved: boolean }) {
  const t = useTranslations("ownerManage");
  const pathname = usePathname();
  const base = `/turfs/${slug}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav
        className="glass-panel hidden flex-wrap items-center gap-0.5 rounded-full p-1 sm:flex"
        aria-label={t("navTurf")}
      >
        {TURF_TABS.map((tab) => {
          const href = `${base}${tab.segment}`;
          const current = isTabActive(pathname, href, tab.segment);
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                "focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
                current
                  ? "bg-brand text-brand-foreground font-semibold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <tab.icon className="size-3.5 shrink-0" aria-hidden />
              {t(tab.key)}
            </Link>
          );
        })}
      </nav>

      {/* The public page lives in the player app, on its own origin, so this is a plain
          anchor rather than a <Link> — there is no client-side route to prefetch. */}
      {isApproved && (
        <Button variant="ghost" size="sm" asChild>
          <a href={`${playerAppUrl()}/turfs/${slug}`} target="_blank" rel="noreferrer">
            {t("viewPublic")}
            <ExternalLink aria-hidden />
          </a>
        </Button>
      )}
      <Button variant="ghost" size="sm" asChild>
        {/* The dashboard, named: `/` is the public landing now and would only bounce a
            signed-in owner back here through a redirect. */}
        <Link href="/turfs">
          <ArrowLeft aria-hidden />
          {t("backToDashboard")}
        </Link>
      </Button>
    </div>
  );
}
