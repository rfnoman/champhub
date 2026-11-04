"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  Package,
  Receipt,
  ScanLine,
  Settings2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";

type Item = { segment: string; key: string; icon: LucideIcon };

/**
 * The navigation for one turf.
 *
 * It was seven `variant="outline"` buttons in a flex row — every destination shouting
 * equally, with no indication of which one you were on. A turf owner moves between
 * these all evening, so it is a tab strip with a current state, and the till gets the
 * emphasis because it is the one used with a queue waiting.
 */
const ITEMS: Item[] = [
  { segment: "", key: "navSettings", icon: Settings2 },
  { segment: "/bookings", key: "viewBookings", icon: CalendarDays },
  { segment: "/counter", key: "openCounter", icon: ScanLine },
  { segment: "/inventory", key: "viewInventory", icon: Package },
  { segment: "/orders", key: "viewOrders", icon: Receipt },
  { segment: "/finance", key: "viewFinance", icon: Wallet },
];

export function TurfNav({ slug, isApproved }: { slug: string; isApproved: boolean }) {
  const t = useTranslations("ownerManage");
  const pathname = usePathname();
  const base = `/owner/${slug}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav
        className="glass-panel flex flex-wrap items-center gap-0.5 rounded-full p-1"
        aria-label={t("navSettings")}
      >
        {ITEMS.map((item) => {
          const href = `${base}${item.segment}`;
          const current = pathname === href;
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
              <item.icon className="size-3.5 shrink-0" aria-hidden />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>

      {isApproved && (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/turfs/${slug}`}>
            {t("viewPublic")}
            <ExternalLink aria-hidden />
          </Link>
        </Button>
      )}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/owner">
          <ArrowLeft aria-hidden />
          {t("backToDashboard")}
        </Link>
      </Button>
    </div>
  );
}
