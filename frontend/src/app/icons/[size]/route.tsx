import { ImageResponse } from "next/og";

/**
 * The launcher icons, drawn rather than committed.
 *
 * Three PNGs would otherwise be binaries in the repo that nobody can diff and everybody
 * forgets to regenerate when the mark changes. Drawing them from one definition keeps
 * the 192, the 512 and the maskable variant in step by construction.
 *
 * The maskable one is not just a bigger icon: Android crops it to whatever shape the
 * launcher uses, so the mark has to sit inside the middle 80% — the "safe zone" — with
 * the brand colour bled to the edges.
 */
const SIZES: Record<string, { pixels: number; maskable: boolean }> = {
  "192.png": { pixels: 192, maskable: false },
  "512.png": { pixels: 512, maskable: false },
  "maskable.png": { pixels: 512, maskable: true },
};

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const spec = SIZES[size];
  if (!spec) return new Response("Not found", { status: 404 });

  const { pixels, maskable } = spec;
  // Inside the safe zone for a maskable icon, edge-to-edge otherwise.
  const scale = maskable ? 0.6 : 0.78;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        // The midnight pitch, with the floodlight falling from above (D73). Phase 12
        // inverted this: the icon used to be a white ring on brand green while the app
        // behind it was greyscale, so neither matched the other.
        background: "#07140F",
        backgroundImage: "radial-gradient(120% 90% at 50% -10%, #11402C 0%, #07140F 70%)",
        borderRadius: maskable ? 0 : pixels * 0.22,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: pixels * scale,
          height: pixels * scale,
          borderRadius: "100%",
          border: `${Math.round(pixels * 0.045)}px solid #00E07A`,
          color: "#00E07A",
          fontSize: pixels * scale * 0.52,
          fontWeight: 700,
          letterSpacing: -pixels * 0.01,
        }}
      >
        T
      </div>
    </div>,
    { width: pixels, height: pixels },
  );
}
