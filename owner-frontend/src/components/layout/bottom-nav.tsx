"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutGrid, PlusCircle } from "lucide-react";
import { cn } from "cn";

import { TURF_TABS, isTabActive, turfSlugFrom } from "./turf-tabs";

type Tab = { href: string; label: string; icon: typeof LayoutGrid; current: boolean };

/**
 * The phone tab bar.
 *
 * It is context-sensitive, which the player app's is not: inside a turf it carries that
 * turf's five operational destinations, and everywhere else the two global ones. That is
 * the whole point of a separate owner app on a phone — a cashier at the counter spends
 * the evening between the till, the day's bookings and the stock table, and should never
 * have to go back out to a dashboard to get between them.
 *
 * The slug is read from the pathname rather than passed down: this renders once in the
 * root layout, above every route that knows which turf it is.
 *
 * Phone only (`sm:hidden`); the header and the turf tab strip take over above that. One
 * of the four surfaces allowed to carry `backdrop-filter` (DECISIONS D75): it is fixed,
 * so the blur never sits inside a scrolling list.
 */
export function BottomNav() {
  const t = useTranslations("ownerManage");
  const nav = useTranslations("nav");
  const pathname = usePathname();
  const slug = turfSlugFrom(pathname);

  // The landing page is the one public route in this app, and the only people who see
  // it are signed out (a signed-in owner is redirected to their turfs). A tab bar
  // offering them "your turfs" is addressing somebody who is not there yet; the page
  // makes its own case and carries its own calls to action.
  if (pathname === "/") return null;

  const tabs: Tab[] = slug
    ? TURF_TABS.filter((tab) => tab.mobile).map((tab) => {
        const href = `/turfs/${slug}${tab.segment}`;
        return {
          href,
          label: t(tab.key),
          icon: tab.icon,
          current: isTabActive(pathname, href, tab.segment),
        };
      })
    : [
        {
          href: "/turfs",
          label: nav("turfs"),
          icon: LayoutGrid,
          current: pathname === "/turfs",
        },
        { href: "/new", label: nav("register"), icon: PlusCircle, current: pathname === "/new" },
      ];

  return (
    <nav
      aria-label={slug ? t("navTurf") : nav("primary")}
      className={cn(
        "glass-chrome fixed inset-x-0 bottom-0 z-40 border-t sm:hidden",
        // Installed on a phone with a home-bar, the bottom of the screen is not the
        // bottom of the usable area.
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {tabs.map((tab) => (
          <li key={tab.href} className="flex-1">
            <Link
              href={tab.href}
              aria-current={tab.current ? "page" : undefined}
              className={cn(
                "press relative flex h-14 flex-col items-center justify-center gap-1",
                "focus-visible:ring-ring/50 rounded-lg outline-none focus-visible:ring-2",
                tab.current ? "text-brand" : "text-muted-foreground",
              )}
            >
              {/* The floodlight above the active tab, matching the header's underline. */}
              {tab.current && (
                <span
                  aria-hidden
                  className="bg-brand shadow-brand/60 absolute inset-x-5 top-0 h-0.5 rounded-full shadow-[0_0_10px]"
                />
              )}
              <tab.icon className="size-5 shrink-0" aria-hidden />
              {/* Bengali labels run 20–30% longer than the English, and five of them in
                  a 390px bar is the tightest layout here — hence the small size and the
                  truncation rather than a wrapped two-line tab. */}
              <span className="w-full truncate px-0.5 text-center text-[0.625rem] leading-none">
                {tab.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
