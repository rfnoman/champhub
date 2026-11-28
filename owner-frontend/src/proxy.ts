import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { clerkCspHosts } from "@/lib/clerk-hosts";
import { clerkRoutes } from "@/lib/clerk-routes";

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (Node runtime only, no `edge`).
 *
 * Two jobs: attach the Clerk session, and set the content policy.
 *
 * Route protection is **not** done here — it happens at the resource, with
 * `await auth.protect()` in the `(signed-in)` layout that every page of this app sits
 * inside, because Clerk deprecated `createRouteMatcher` after the 2025 middleware-bypass
 * disclosures and now recommends gating as close to the data as possible (D12).
 *
 * Locale needs no middleware either: the choice lives in a cookie, not the URL (D13).
 */

/**
 * The content policy, with a fresh nonce per response.
 *
 * It has to be built here rather than in `next.config.ts` because the App Router emits
 * inline `<script>` tags carrying the flight payload on every page. A static policy can
 * only allow those with `'unsafe-inline'`, which is most of what a script policy is for
 * — so instead each response gets a nonce, which Next finds by reading this header back
 * off the request and stamps onto its own scripts.
 *
 * `'strict-dynamic'` is what makes that workable with Clerk: its bundle injects further
 * scripts at runtime, and under `strict-dynamic` a script trusted by nonce may load
 * more. Browsers that do not understand it fall back to the host list after it.
 *
 * `form-action` keeps `'self'`, and `connect-src` does not list the player app: this app
 * talks to the API and to Clerk, and the two crossings to the player app are ordinary
 * navigations, which no directive here governs.
 */
function policy(nonce: string): string {
  const api = env(process.env.NEXT_PUBLIC_API_BASE_URL, "http://127.0.0.1:8000");
  // Derived from the publishable key, never written down: a production instance is
  // served from a custom domain that the `*.clerk.accounts.dev` wildcard does not
  // match, and hardcoding it blocked every Frontend API call in production while
  // every check stayed green (see lib/clerk-hosts.ts).
  const clerk = clerkCspHosts(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return [
    "default-src 'self'",
    // `unsafe-eval` is Clerk's; nothing of ours needs it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' https:`,
    // Next inlines its critical CSS, and styles cannot carry a nonce through Tailwind.
    "style-src 'self' 'unsafe-inline'",
    // Map tiles (the registration pin), turf photos and Clerk avatars, all from hosts
    // we do not control. The API origin is named explicitly for the sake of
    // development: uploaded media is served by Django over plain http on another port
    // there, and `https:` alone blocked every account photo with nothing in the UI to
    // say why. In production the API is https, so this adds nothing.
    `img-src 'self' data: blob: https: ${api}`,
    "font-src 'self' data:",
    `connect-src 'self' ${api} ${clerk}`,
    // Clerk's bot-protection challenge renders in a frame.
    `frame-src 'self' ${clerk} https://challenges.cloudflare.com`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    // Nothing here is meant to be embedded in somebody else's page.
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
}

export default clerkMiddleware(
  (_auth, request: NextRequest) => {
    const nonce = crypto.randomUUID().replaceAll("-", "");
    const csp = policy(nonce);

    // Next reads the policy off the *request* to find the nonce for its own scripts.
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", csp);

    const response = NextResponse.next({ request: { headers } });
    response.headers.set("content-security-policy", csp);
    return response;
  },
  /**
   * `auth.protect()` reads these back out of the request data this middleware
   * encrypts, and they are the *only* way it learns where the sign-in page is: the
   * server half of Clerk never sees `<ClerkProvider>`'s props. Left unset it falls
   * back to the hosted account portal on another origin, which is what production was
   * doing — see lib/clerk-routes.ts.
   */
  { signInUrl: clerkRoutes.signInUrl, signUpUrl: clerkRoutes.signUpUrl },
);

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    // Clerk's own handshake/bridge routes.
    "/__clerk/(.*)",
  ],
};
