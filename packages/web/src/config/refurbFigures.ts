/**
 * ███ THE OPERATOR'S OWN REFURB FIGURES — THIS FILE IS GIL'S, NOT CLAUDE'S ███
 *
 * WHY EVERY NUMBER BELOW IS `null`.
 * There is no honest source for UK refurb costs in this product. Anything
 * invented here would be a guess shipped under the operator's name, on the one
 * figure that moves a flip or a BRRRR more than any other. So nothing is
 * invented: the structure is built, every figure is empty, and the section says
 * out loud that it is waiting for him. R1 rule 4.
 *
 * ── HOW TO FILL IT IN ────────────────────────────────────────────────────────
 * Replace a `null` with a whole number of pounds. No quotes, no commas, no £.
 *
 *     rewire: 4500,
 *     kitchen: 6000,
 *     bathroom: null,        ← still empty: that row simply offers nothing
 *
 * You do not have to do all fourteen, and you do not have to do any. A row
 * whose figure is `null` shows no suggestion at all — it is just a tick and an
 * empty box, exactly as it is today. Fill in the ones you are confident about
 * and leave the rest.
 *
 * WHAT A FIGURE MEANS ON THE PAGE. It becomes a one-tap suggestion beside that
 * row, under the heading `REFURB_FIGURES_LABEL` below, which names them as
 * YOURS and says to change them. Tapping it types the number into the box; it
 * is not locked, not a default, and never applied without a tap. Nothing is
 * ever calculated from these — they are a starting point a person overwrites.
 *
 * THE KEYS ARE NOT YOURS TO INVENT. Every key here must match an item `key` in
 * `refurb.ts`. A test fails the build if the two ever drift apart, so renaming
 * an item without renaming it here cannot ship.
 *
 * A TYPICAL PROPERTY, IF IT HELPS YOU DECIDE. These read best as "a normal
 * three-bed terrace, whole job, materials and labour" — the number you would
 * say on the phone before seeing it. Anyone doing a two-bed flat or a six-bed
 * HMO will change them, which is the point.
 */

/**
 * Pounds per item, or `null` for "I have not given a figure for this".
 * Keys must match `REFURB_ITEMS` in refurb.ts — enforced by refurb.test.ts.
 */
export const REFURB_FIGURES: Record<string, number | null> = {
  rewire: null,
  plumbing: null,
  heating: null,
  kitchen: null,
  bathroom: null,
  windows: null,
  roof: null,
  plastering: null,
  flooring: null,
  damp: null,
  ripOut: null,
  externals: null,
  decoration: null,
  other: null,
};

/**
 * What the suggestions are called on the page, in his voice. Shown ONLY when at
 * least one figure above is filled in — with none, the page says the honest
 * waiting line from `REFURB.copy.figuresEmpty` instead of naming him at all.
 */
export const REFURB_FIGURES_LABEL = 'Gil’s rough figures — change them to yours';

/** True when the operator has given at least one figure. */
export function hasAnyFigure(): boolean {
  return Object.values(REFURB_FIGURES).some((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
}

/** His figure for one item, or null. Never a fallback, never a guess. */
export function figureFor(key: string): number | null {
  const v = REFURB_FIGURES[key];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}
