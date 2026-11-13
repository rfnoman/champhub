import type { MetadataRoute } from "next";

/**
 * The web app manifest.
 *
 * This matters more here than in the player app: the counter is run from a phone or a
 * tablet propped on a shelf, all evening, and an installed app opens without browser
 * chrome eating a quarter of the screen. `display: standalone` is the whole point.
 *
 * No `shortcuts`: every useful destination in this app is inside one turf, and a
 * manifest shortcut needs a static URL. The phone tab bar does that job once you are in.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ChampHub Turf — run your ground",
    short_name: "ChampHub Turf",
    description: "Bookings, the counter, stock and takings for your turf.",
    start_url: "/",
    display: "standalone",
    // Landscape is not forced: the till is used in portrait on a phone and landscape on
    // a tablet, and `orientation` would fight whichever one it was not written for.
    background_color: "#07140F",
    theme_color: "#07140F",
    lang: "en",
    dir: "ltr",
    categories: ["business", "productivity", "sports"],
    icons: [
      { src: "/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // A maskable icon is the one Android actually puts on the launcher: without it the
      // icon is letterboxed inside a white circle on most devices.
      { src: "/icons/maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
