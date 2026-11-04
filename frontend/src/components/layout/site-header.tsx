import Link from "next/link";
import { Suspense } from "react";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { LanguageSwitcher } from "./language-switcher";
import { NavLinks } from "./nav-links";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";

export async function SiteHeader() {
  const t = await getTranslations();

  return (
    /**
     * One of the four surfaces allowed to carry `backdrop-filter` (DECISIONS D75). It is
     * sticky, so the blur is over a small fixed area rather than inside a scrolling list.
     */
    <header className="glass-chrome sticky top-0 z-40 border-b">
      {/* The floodlight, catching the top edge of the chrome. The one piece of
          non-functional light in the interior app — the hero gets the literal version. */}
      <div
        aria-hidden
        className="via-brand/40 pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent"
      />
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-1.5 px-4">
        {/* Must stay exactly one visible link whose accessible name is the wordmark —
            smoke.spec.ts asserts it in both languages. */}
        <Link
          href="/"
          className="font-display text-brand hover:text-brand/85 mr-auto text-lg font-extrabold tracking-tight transition-colors"
        >
          {t("app.name")}
        </Link>

        <NavLinks />

        <ThemeToggle />
        <LanguageSwitcher />

        {/* <Show> reads auth state, so it needs a Suspense boundary. */}
        <Suspense fallback={<Skeleton className="h-8 w-16" />}>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm">
                {t("auth.signIn")}
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm">{t("auth.signUp")}</Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            {/* Inside <Show>, so it only polls for a signed-in reader. */}
            <NotificationBell />
            <UserButton />
          </Show>
        </Suspense>
      </div>
    </header>
  );
}
