/**
 * The floodlit pitch the owner landing opens on.
 *
 * The player app draws this inline in its own `page.tsx`; here it is a component
 * because the owner page has more to say above the fold and a hundred lines of
 * gradient maths in the middle of it would bury the copy. The design system is copied
 * between the two apps rather than shared (DECISIONS D83), so this is a sibling of
 * that markup, not an import of it — change the light in one and change it in the
 * other.
 *
 * Why it is lit from the right: the player app's masts stand at 24% and 78%, and the
 * two landing pages are seen one after the other by the same person clicking "list
 * your turf". Same stadium, walked round to the other side — the owner's end, where
 * the counter is.
 */
export function FloodlitStage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden">
      {/* The bloom: what the lamps do to the air above the pitch. */}
      <div
        aria-hidden
        className="flood-beam pointer-events-none absolute inset-x-0 -top-32 h-[34rem]"
        style={{
          background:
            "radial-gradient(58% 70% at 64% 0%, color-mix(in oklch, var(--glow) 24%, transparent), transparent 70%)",
        }}
      />

      {/* The masts. A cone has a source and a wash does not, which is the whole
          difference between "floodlit" and "gradient behind some text".

          The blur must sit on a *parent* of the clipped element: CSS applies `filter`
          before `clip-path`, so one div carrying both gets its soft edges sliced back
          off and renders as a hard green triangle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-[70%] h-[48rem] w-[34rem] -translate-x-1/2 blur-[44px]"
      >
        <div
          className="flood-beam size-full"
          style={{
            clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0 100%)",
            background:
              "linear-gradient(to bottom, color-mix(in oklch, var(--glow) 42%, transparent), transparent 68%)",
          }}
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-[28%] h-[48rem] w-[32rem] -translate-x-1/2 blur-[44px]"
      >
        <div
          className="flood-beam size-full"
          style={{
            animationDelay: "170ms",
            clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0 100%)",
            background:
              "linear-gradient(to bottom, color-mix(in oklch, var(--glow) 30%, transparent), transparent 68%)",
          }}
        />
      </div>

      {/* Where the beams land. Grass under a mast is a bright ellipse, not an even
          wash, and the falloff between the two pools is what sells it. */}
      <div
        aria-hidden
        className="flood-beam pointer-events-none absolute inset-x-0 top-0 h-full"
        style={{
          animationDelay: "90ms",
          background:
            "radial-gradient(40% 48% at 70% 46%, color-mix(in oklch, var(--glow) 14%, transparent), transparent 72%), radial-gradient(36% 44% at 26% 44%, color-mix(in oklch, var(--glow) 11%, transparent), transparent 72%)",
        }}
      />

      {/* The markings, chalked on as the light finds them. `pathLength="1"` normalises
          every path so one dash length draws a corner arc and a touchline alike.
          This is the corner of a pitch rather than the centre circle the player app
          draws — the end you stand at when you are running the place, not playing on
          it. */}
      <svg
        aria-hidden
        viewBox="0 0 1200 620"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        className="text-chalk pointer-events-none absolute inset-0 size-full"
      >
        {/* The goal area, seen from behind the line. */}
        <path
          d="M 980 620 L 980 400 L 1200 400"
          pathLength={1}
          vectorEffect="non-scaling-stroke"
          className="chalk-mark opacity-15"
        />
        <path
          d="M 1090 620 L 1090 520 L 1200 520"
          pathLength={1}
          vectorEffect="non-scaling-stroke"
          className="chalk-mark opacity-20"
          style={{ animationDelay: "320ms" }}
        />
        {/* The penalty arc, cut off by the touchline exactly as it is on grass. */}
        <path
          d="M 980 330 A 110 110 0 0 0 980 470"
          pathLength={1}
          vectorEffect="non-scaling-stroke"
          className="chalk-mark opacity-15"
          style={{ animationDelay: "440ms" }}
        />
        <circle cx="1062" cy="400" r="4" fill="currentColor" stroke="none" className="opacity-20" />
      </svg>

      {children}
    </div>
  );
}
