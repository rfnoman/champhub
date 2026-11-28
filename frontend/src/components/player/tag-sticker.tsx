import { cn } from "cn";

/** The tones `PlayerTag.tone` can take, spelled out because the JIT cannot see interpolation. */
const TONES: Record<string, string> = {
  cool: "bg-tone-cool-bg text-tone-cool-ink",
  fire: "bg-tone-fire-bg text-tone-fire-ink",
  steel: "bg-tone-steel-bg text-tone-steel-ink",
  gold: "bg-tone-gold-bg text-tone-gold-ink",
  grass: "bg-tone-grass-bg text-tone-grass-ink",
};

export type StickerTag = {
  key: string;
  label: string;
  emoji: string;
  tone: string;
  description?: string;
  count?: number;
};

/**
 * A sticker somebody gave a player: emoji, the phrase, and how many times.
 *
 * Drawn as a peeling sticker rather than a flat chip — a slight rotation, a soft shadow
 * and a ring, so a wall of them reads as a collection of things people *gave* you and
 * not as a row of filter pills. The rotation is derived from the key, so a given tag
 * always leans the same way and the page does not rearrange itself on re-render.
 *
 * `count` is what makes it worth collecting: one person calling you cool as a cucumber
 * is an opinion, seven is a reputation.
 */
export function TagSticker({
  tag,
  size = "md",
  pressed,
  onClick,
  className,
}: {
  tag: StickerTag;
  size?: "sm" | "md";
  /** Set when this is a picker toggle rather than a display sticker. */
  pressed?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  // Deterministic lean: -2, -1, 0, 1 or 2 degrees from the key's characters.
  const lean = ([...tag.key].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5) - 2;
  const interactive = onClick !== undefined;

  const body = (
    <>
      <span aria-hidden className={size === "sm" ? "text-sm" : "text-base"}>
        {tag.emoji}
      </span>
      <span className="truncate font-semibold">{tag.label}</span>
      {tag.count != null && tag.count > 1 && (
        <span className="num opacity-70">&times;{tag.count}</span>
      )}
    </>
  );

  const classes = cn(
    "inline-flex max-w-full items-center gap-1.5 rounded-full ring-1 ring-black/5",
    "shadow-sm transition-transform",
    size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
    TONES[tag.tone] ?? TONES.cool,
    interactive && "press cursor-pointer hover:-translate-y-0.5",
    // An unpicked sticker in the picker is faded, so what you have chosen is obvious at
    // a glance rather than needing the ring to be read.
    interactive && !pressed && "opacity-45 saturate-50",
    className,
  );

  if (!interactive) {
    return (
      <span className={classes} style={{ transform: `rotate(${lean}deg)` }} title={tag.description}>
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={classes}
      style={{ transform: `rotate(${lean}deg)` }}
      title={tag.description}
    >
      {body}
    </button>
  );
}
