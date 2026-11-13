import { Suspense } from "react";
import Link from "next/link";
import { SignInButton, Show, UserButton } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { playerAppUrl } from "@/lib/links";

import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";
import { Wordmark } from "./wordmark";

/**
 * The owner app's chrome.
 *
 * Deliberately thinner than the player app's: there is no notification bell, no store
 * and no five-destination nav, because an owner's navigation is per-turf and lives in
 * the tab strip. What belongs up here is who you are signed in as, the two global
 * destinations (every turf, and registering another), and the way back to the player
 * app — an owner is usually a player too.
 *
 * One of the four surfaces allowed to carry `backdrop-filter` (DECISIONS D75). It is
 * sticky, so the blur is over a small fixed area rather than inside a scrolling list.
 */
export async function SiteHeader() {
  const t = await getTranslations();

  return (
    <header className="glass-chrome sticky top-0 z-40 border-b">
      {/* The floodlight, catching the top edge of the chrome. */}
      <div
        aria-hidden
        className="via-brand/40 pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent"
      />
      <div className="page-column flex h-14 items-center gap-1.5 px-4">
        {/* Exactly one visible link whose accessible name is the wordmark — the smoke
            spec asserts it in both languages. */}
        <Wordmark label={t("app.name")} />

        {/* No "all turfs" link: the wordmark already goes there, and the tab strip
            inside a turf carries its own way back. */}
        <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
          <Link href="/new">{t("nav.register")}</Link>
        </Button>
        {/* The one page in this app that belongs to the person rather than to a turf:
            their photograph and their identity check (DOMAIN §1a). */}
        <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
          <Link href="/account">{t("nav.account")}</Link>
        </Button>
        {/* A separate origin, so a plain anchor. */}
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-muted-foreground hidden sm:inline-flex"
        >
          <a href={playerAppUrl()} target="_blank" rel="noreferrer">
            {t("nav.playerApp")}
            <ExternalLink aria-hidden />
          </a>
        </Button>

        <ThemeToggle />
        <LanguageSwitcher />

        {/* <Show> reads auth state, so it needs a Suspense boundary. */}
        <Suspense fallback={<Skeleton className="h-8 w-16" />}>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button size="sm">{t("auth.signIn")}</Button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </Suspense>
      </div>
    </header>
  );
}
