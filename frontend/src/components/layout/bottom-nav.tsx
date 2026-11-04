"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "cn";

import { PRIMARY, isActive } from "./nav-items";

/**
 * The mobile tab bar.
 *
 * This closes a functional gap rather than a cosmetic one: for eleven phases the header
 * nav was `hidden … sm:flex`, so below `sm` — on a phone-first, installable app aimed at
 * Bangladesh — the app had no navigation at all beyond in-page links.
 *
 * Phone only (`sm:hidden`); the header nav takes over above that. One of the four
 * surfaces allowed to carry `backdrop-filter` (DECISIONS D75): it is fixed, so the blur
 * never sits inside a scrolling list.
 */
export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("primary")}
      className={cn(
        "glass-chrome fixed inset-x-0 bottom-0 z-40 border-t sm:hidden",
        // Installed on a phone with a home-bar, the bottom of the screen is not the
        // bottom of the usable area.
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {PRIMARY.map((item) => {
          const current = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "press relative flex h-14 flex-col items-center justify-center gap-1",
                  "focus-visible:ring-ring/50 rounded-lg outline-none focus-visible:ring-2",
                  current ? "text-brand" : "text-muted-foreground",
                )}
              >
                {/* The floodlight above the active tab, matching the header's underline. */}
                {current && (
                  <span
                    aria-hidden
                    className="bg-brand shadow-brand/60 absolute inset-x-5 top-0 h-0.5 rounded-full shadow-[0_0_10px]"
                  />
                )}
                <item.icon className="size-5 shrink-0" aria-hidden />
                {/* Bengali labels run 20–30% longer than the English, and five of them in
                    a 390px bar is the tightest layout in the app — hence the small size
                    and the truncation rather than a wrapped two-line tab. */}
                <span className="w-full truncate px-0.5 text-center text-[0.625rem] leading-none">
                  {t(item.key)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
