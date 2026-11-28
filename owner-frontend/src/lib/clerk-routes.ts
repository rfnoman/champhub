/**
 * Where this app keeps its own sign-in and sign-up pages, and where an owner lands
 * afterwards.
 *
 * These were only ever `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and friends in
 * `.env.local.example`, which meant local development had them and production did not:
 * the Phase 13 Vercel table never listed them, so the deployed app ran with all four
 * empty. Clerk does not fail on an empty value, it falls back to the Dashboard's own
 * answers, and the result was a production app quietly wired to somebody else's pages:
 *
 *   - `await auth.protect()` in the route-group layouts bounced a signed-out visitor to
 *     the hosted account portal on `accounts.champhub.fit` — a different origin, in
 *     Clerk's default purple, with none of this app's chrome — instead of `/sign-in`,
 *     which exists, is themed, and is what the catch-all route is there for.
 *   - After signing in, the Dashboard's `after_sign_in_url` sent the owner to the
 *     *player* app on `champhub.fit` rather than back to their own turf list, because
 *     the Dashboard has one answer for both apps and it is the player one.
 *
 * So they live in code now. Routes are app structure, not deployment configuration,
 * and the only way a deployment can disagree with the router is if the two are kept in
 * different places. Same reasoning as `clerk-hosts.ts`: one source of truth, so moving
 * the app cannot leave half the configuration behind.
 *
 * Both halves have to be told separately, and neither reads the other:
 *   - the browser gets them as `<ClerkProvider>` props (app/layout.tsx)
 *   - the server gets them as `clerkMiddleware` options (proxy.ts), which is what
 *     `auth.protect()` reads back out of the encrypted request data
 */
export const clerkRoutes = {
  /** This app's own sign-in page — `src/app/sign-in`. */
  signInUrl: "/sign-in",
  /** This app's own sign-up page — `src/app/sign-up`. */
  signUpUrl: "/sign-up",
  /**
   * Where to land when nothing else asked for somewhere specific.
   *
   * `/` is the public front door, which already redirects a signed-in owner on to
   * `/turfs`; sending them there keeps one answer to "where does an owner belong"
   * rather than two that can drift apart. "Fallback" rather than "force" so a
   * `redirect_url` — the one `auth.protect()` adds when it sends somebody here from a
   * page they actually wanted — still wins.
   */
  signInFallbackRedirectUrl: "/",
  signUpFallbackRedirectUrl: "/",
} as const;
