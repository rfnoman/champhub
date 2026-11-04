/**
 * The motion feature bundle, in its own module so it can be code-split.
 *
 * `domAnimation` covers animations, variants, exit animations and tap/hover gestures —
 * everything the app actually uses. `domMax` would add layout projection and drag for
 * roughly twice the bytes; if a drag-to-dismiss sheet ever lands, this is the one line
 * that changes, and the cost is recorded in DECISIONS D72.
 */
export { domAnimation as default } from "motion/react";
