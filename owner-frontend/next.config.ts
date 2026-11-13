import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * Security headers that do not change per response.
 *
 * The content policy is *not* here — it needs a fresh nonce for each page, so it is set
 * in `src/proxy.ts`. Django sets its own equivalents for API responses; these cover the
 * pages an owner actually loads.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The registration form drops a pin on a map, which is the only capability this app
  // asks for. No notifications: an owner's alerts are the player app's job.
  {
    key: "Permissions-Policy",
    value: "geolocation=(self), notifications=(), camera=(), microphone=(), payment=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
  // Nothing here is for a search engine — every page is one turf's private operations.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  // For the self-hosted image only: Next traces the modules actually imported and
  // copies just those, so the container does not ship node_modules. Vercel does its own
  // bundling and does not want this.
  output: process.env.VERCEL ? undefined : "standalone",

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },

  // Cache Components stays off (DECISIONS D14). The reason is even plainer here than in
  // the player app: every page in this one renders one turf's own operational data —
  // today's bookings, what is on the shelf, what the till took — so there is nothing a
  // shared render cache could hold.
  cacheComponents: false,

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Points next-intl at src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
