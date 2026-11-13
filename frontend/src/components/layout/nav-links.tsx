"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Ellipsis } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ownerAppUrl } from "@/lib/links";

import { PRIMARY, SECONDARY, isActive } from "./nav-items";

/**
 * The desktop nav: five destinations and an overflow menu.
 *
 * It was nine ghost buttons in a row, with no indication of where you were. Five plus
 * overflow fits the bar, and the current item is marked — which is most of what a nav
 * is for.
 *
 * A client component only because it needs `usePathname`; the links themselves are
 * still plain `<Link>`s, so navigation is unaffected.
 */
export function NavLinks() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-0.5 sm:flex" aria-label={t("primary")}>
      {PRIMARY.map((item) => {
        const current = isActive(pathname, item.href);
        return (
          <Button
            key={item.href}
            variant="ghost"
            size="sm"
            asChild
            className={cn(
              "relative",
              current && "text-foreground font-semibold",
              !current && "text-muted-foreground",
            )}
          >
            <Link href={item.href} aria-current={current ? "page" : undefined}>
              {t(item.key)}
              {/* The floodlit underline. One lit element in the bar, so "where am I"
                  is answered by light rather than by a filled pill. */}
              {current && (
                <span
                  aria-hidden
                  className="bg-brand shadow-brand/50 absolute inset-x-2.5 -bottom-px h-0.5 rounded-full shadow-[0_0_8px]"
                />
              )}
            </Link>
          </Button>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("more")}
            className="text-muted-foreground"
          >
            <Ellipsis className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {SECONDARY.map((item) => (
            <DropdownMenuItem key={item.key} asChild>
              {/* The owner app is a separate deployment (DECISIONS D83), so its entry
                  is an anchor to another origin — a <Link> would try to route to it. */}
              {item.external ? (
                <a href={ownerAppUrl()} target="_blank" rel="noreferrer">
                  <item.icon className="size-4" aria-hidden />
                  {t(item.key)}
                </a>
              ) : (
                <Link href={item.href}>
                  <item.icon className="size-4" aria-hidden />
                  {t(item.key)}
                </Link>
              )}
            </DropdownMenuItem>
          ))}
          {/* `/me` dumps the raw backend session — useful while building, not something
              to put in front of players. Development only (Phase 11 step 6). */}
          {process.env.NODE_ENV !== "production" && (
            <DropdownMenuItem asChild>
              <Link href="/me">{t("debug")}</Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
