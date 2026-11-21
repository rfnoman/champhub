import { ImageResponse } from "next/og";

/**
 * The browser tab icon, drawn rather than committed — for the same reason the launcher
 * icons are (`icons/[size]/route.tsx`): a binary nobody can diff is a binary nobody
 * remembers to regenerate when the mark changes. Until this existed, both apps shipped
 * the Next.js starter's "N", so every ChampHub tab was branded Next.js.
 *
 * It is not simply the launcher icon shrunk. That mark is a letter inside a ring, and at
 * 32px — 16 on a non-retina screen — a 1px ring aliases into a smudge and the letter
 * inside it is too small to read. So the ring is dropped and the letter is what is left:
 * the same T, the same floodlit pitch behind it (D73), legible at the size it is
 * actually rendered.
 *
 * A T where the player app has a C, for the reason the launcher icons differ: one
 * person runs both, and two identical tabs is a sale rung up in the wrong app.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: "#07140F",
        backgroundImage: "radial-gradient(120% 90% at 50% -10%, #11402C 0%, #07140F 70%)",
        // Rounded rather than round: a circle inside a 32px square loses four corners
        // of an already small canvas, and the tab strip clips nothing.
        borderRadius: 7,
        color: "#00E07A",
        fontSize: 27,
        fontWeight: 700,
        // The cap sits optically high in the box without this; the tab is small enough
        // that a pixel of droop reads as a mistake.
        lineHeight: 1,
      }}
    >
      T
    </div>,
    { ...size },
  );
}
