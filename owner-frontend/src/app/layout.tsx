import type { Metadata, Viewport } from "next";
import { cn } from "cn";
import { Archivo, Hind_Siliguri } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";

import { BottomNav } from "@/components/layout/bottom-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { clerkRoutes } from "@/lib/clerk-routes";
import { env } from "@/lib/env";

import { Providers } from "./providers";
import "./globals.css";

/**
 * Bangla needs a real Bengali face. Without one the script falls back to whatever the
 * device has — on low-end Android that is often a font with the wrong conjunct forms,
 * which native readers notice immediately.
 *
 * It is appended to the Latin stack rather than replacing it (see `--font-sans` in
 * globals.css): font fallback is per glyph, so English keeps the system face and only
 * Bengali codepoints reach Hind Siliguri.
 */
const bengali = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "600"],
  variable: "--font-bengali",
  display: "swap",
});

/** The display face (DECISIONS D74): headings, totals, and every numeral. */
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(env(process.env.NEXT_PUBLIC_SITE_URL, "http://localhost:3001")),
  title: "ChampHub Turf",
  description: "Run your turf: bookings, the counter, stock and takings.",
  // Nothing in here is for search engines — every page is one turf's private operations.
  robots: { index: false, follow: false },
};

/**
 * Installed, the app has no browser chrome, so the status bar takes its colour from
 * here. One colour per scheme, so it matches the theme the phone is actually in (D77).
 *
 * `maximum-scale` is deliberately left alone: pinch-zoom is an accessibility feature,
 * and this app is read at a counter in the dark by people who are not looking at it
 * straight on.
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
  // (DECISIONS D78b).
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
          // Reserve the phone tab bar's height below the footer.
          "pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0",
        )}
      >
        {/* ClerkProvider belongs inside <body>, not wrapping <html>.

            The routes are passed explicitly rather than left to
            `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and friends, which production never had:
            empty, Clerk silently uses the Dashboard's answers, and the Dashboard's
            answer is the player app (lib/clerk-routes.ts). The server half is told
            separately, in src/proxy.ts. */}
        <ClerkProvider nonce={nonce} {...clerkRoutes}>
          <NextIntlClientProvider>
            <Providers nonce={nonce}>
              <SiteHeader />
              {/* Full width: each page picks its own column via PageContainer. */}
              <main className="flex w-full flex-1 flex-col">{children}</main>
              <SiteFooter />
              <BottomNav />
            </Providers>
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
