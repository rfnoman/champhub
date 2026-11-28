import type { Metadata, Viewport } from "next";
import { cn } from "cn";
import { Archivo, Hind_Siliguri } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";

import { BottomNav } from "@/components/layout/bottom-nav";
import { InstallPrompt } from "@/components/layout/install-prompt";
import { RegisterServiceWorker } from "@/components/layout/register-service-worker";
import { clerkRoutes } from "@/lib/clerk-routes";
import { env } from "@/lib/env";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

import { Providers } from "./providers";
import "./globals.css";

/**
 * Bangla needs a real Bengali face. Without one the script falls back to whatever the
 * device has — on low-end Android that is often a font with the wrong conjunct forms,
 * which native readers notice immediately.
 *
 * It is appended to the Latin stack rather than replacing it (see `--font-sans` in
 * globals.css): font fallback is per glyph, so English keeps the system face and only
 * Bengali codepoints reach Hind Siliguri. The weights are the two the UI actually uses.
 */
const bengali = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "600"],
  variable: "--font-bengali",
  display: "swap",
});

/**
 * The display face (DECISIONS D74): headings, the scoreline, and every numeral.
 *
 * Weight axis only. Archivo is also variable on width 62–125, which was the original
 * attraction — one file giving both stadium-wide and data-condensed — but the latin
 * subset costs 90.1 kB with the width axis against 34.9 kB without, and on a budget
 * measured over slow 3G that is not a defensible trade for one axis. The wide/condensed
 * contrast comes from weight and tracking instead.
 *
 * Latin only: Archivo has no Bengali coverage, so Bangla headings fall through to Hind
 * Siliguri exactly as body text does.
 */
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute URLs for Open Graph images: a shared scorecard link is previewed by
  // Messenger and WhatsApp from their own servers, where a relative path means nothing.
  metadataBase: new URL(env(process.env.NEXT_PUBLIC_SITE_URL, "http://localhost:3000")),
  title: "ChampHub",
  description: "Book sports turfs in Bangladesh, fill your match, build your profile.",
};

/**
 * Installed, the app has no browser chrome, so the status bar takes its colour from
 * here. `maximum-scale` is deliberately left alone: pinch-zoom is an accessibility
 * feature and blocking it on a phone-first app would be a mistake.
 *
 * One colour per scheme, so the status bar matches the theme the phone is actually in
 * (D77). It was a single hard-coded `#16a34a` for eleven phases — a green that existed
 * only here, in the manifest and in the icon route, while the app itself was greyscale.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07140F" },
    { media: "(prefers-color-scheme: light)", color: "#F7F9F7" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Locale comes from the cookie, resolved in src/i18n/request.ts (no URL prefix, D13).
  const locale = await getLocale();

  // Clerk renders its own <script src>, which `strict-dynamic` blocks unless it carries
  // the same nonce `src/proxy.ts` minted for this response. Next stamps its own scripts
  // automatically; Clerk has to be told — and so does next-themes, whose inline no-flash
  // script is blocked outright without it, silently and with every check still green
  // (D78b).
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang={locale}
      className={`${bengali.variable} ${archivo.variable}`}
      suppressHydrationWarning
    >
      <body
        className={cn(
          "bg-background text-foreground flex min-h-dvh flex-col antialiased",
          // Reserve the mobile tab bar's height below the footer. On <main> it left
          // the footer underneath the bar, which is where the bar actually sits.
          "pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0",
        )}
      >
        {/* ClerkProvider belongs inside <body>, not wrapping <html>.

            The routes are passed explicitly rather than left to
            `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and friends, which production never had:
            empty, Clerk silently uses the Dashboard's answers and sends a player who
            has just signed in to the marketing page (lib/clerk-routes.ts). The server
            half is told separately, in src/proxy.ts. */}
        <ClerkProvider nonce={nonce} {...clerkRoutes}>
          <NextIntlClientProvider>
            <Providers nonce={nonce}>
              <RegisterServiceWorker />
              <SiteHeader />
              {/* Full width: each route group picks its own column via PageContainer,
                  so owner tables and the marketing hero are no longer forced into the
                  same max-w-5xl as a list of bookings. */}
              <main className="flex w-full flex-1 flex-col">
                <div className="mx-auto w-full max-w-5xl px-4 empty:hidden">
                  <InstallPrompt />
                </div>
                {children}
              </main>
              <SiteFooter />
              <BottomNav />
            </Providers>
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
