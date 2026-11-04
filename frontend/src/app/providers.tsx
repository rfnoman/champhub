"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { LazyMotion, MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { getQueryClient } from "@/lib/query/get-query-client";

/**
 * Motion features, fetched after hydration (DECISIONS D72).
 *
 * The import form is the whole decision. `features={domAnimation}` as a static import
 * reads as lazy and defers nothing — it lands in the same chunk, ~21 kB gzipped. Only
 * the function form actually splits it: ~5–7 kB stays synchronous and the rest arrives
 * once the page is interactive, so nothing is added to the render-blocking path.
 */
const loadFeatures = () => import("@/components/motion/features").then((m) => m.default);

export function Providers({ children, nonce }: { children: ReactNode; nonce?: string }) {
  const queryClient = getQueryClient();

  return (
    /**
     * `nonce` is load-bearing, and its absence fails silently (D78b). next-themes works
     * by injecting an inline <script> that sets the class before first paint — that is
     * the entire no-flash mechanism — and `src/proxy.ts` sets `script-src` with a nonce
     * and no `'unsafe-inline'`. Without this prop the browser blocks the script and the
     * app is stuck in light mode, with lint, typecheck, build and all 143 e2e tests
     * still green.
     */
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      <QueryClientProvider client={queryClient}>
        {/* `strict` makes a stray `motion.div` throw in development, which is what stops
            the full 34 kB bundle creeping back in across 141 files. */}
        <LazyMotion strict features={loadFeatures}>
          <MotionConfig reducedMotion="user">
            {children}
            <Toaster />
            {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
          </MotionConfig>
        </LazyMotion>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
