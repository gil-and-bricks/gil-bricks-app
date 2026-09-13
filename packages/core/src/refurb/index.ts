/**
 * THE REFURB TOTAL (R1) — the arithmetic behind the itemised refurb.
 *
 * WHY THIS IS IN CORE. The total is the refurb figure the Deal Score uses, so
 * it is maths, and charter rule 3 says maths lives here and never in a
 * component. The component ticks boxes and formats pounds; this adds up.
 *
 * WHAT THIS FILE DOES NOT KNOW: which items exist, what they are called, or
 * what any of them costs. That list is the operator's, and it lives in the web
 * app's config so it can be changed without touching code. This file is given
 * amounts and hands back a total.
 */

/** One line of the list, as the page holds it. */
export interface RefurbLine {
  /** The item's stable key — only used so a caller can map back. */
  key: string;
  /** Ticked lines count. An unticked line is not a zero, it is absent. */
  ticked: boolean;
  /** Pounds typed against it. A ticked line with nothing typed counts as 0. */
  amount: number;
}

/**
 * The sum of the TICKED lines. Ticking nothing is not zero pounds of work — it
 * is no itemised answer at all, which is why `anyTicked` exists separately and
 * this returns 0 for an empty list rather than pretending.
 */
export function sumRefurbLines(lines: readonly RefurbLine[]): number {
  let total = 0;
  for (const line of lines) {
    if (!line.ticked) continue;
    const n = Number(line.amount);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return Math.round(total);
}

export function anyTicked(lines: readonly RefurbLine[]): boolean {
  return lines.some((l) => l.ticked);
}

/**
 * WHICH NUMBER IS IN CHARGE, and why. Three states, and the third is the one
 * that matters:
 *
 *  - 'typed'      — nothing ticked. The refurb figure is whatever was typed
 *                   into the total, exactly as before this section existed.
 *                   Somebody holding a builder's quote is never made to walk
 *                   through fourteen rows.
 *  - 'itemised'   — lines are ticked and they add up to the stored total. The
 *                   list is in charge and the total is its sum.
 *  - 'superseded' — lines are ticked but the stored total is a DIFFERENT
 *                   number, so something else set it: a builder's quote folded
 *                   into the deal, or a hand-edited link. The stored total
 *                   wins, and the list is kept and shown rather than deleted.
 *
 * That last state is the whole reason this is a function and not an if. A quote
 * arriving must not silently wipe what somebody itemised, and it must not be
 * silently overwritten by a stale list either. It supersedes it, visibly.
 */
export type RefurbMode = 'typed' | 'itemised' | 'superseded';

/** The mode names, so no caller retypes one as a bare string literal. */
export const REFURB_MODE = {
  typed: 'typed',
  itemised: 'itemised',
  superseded: 'superseded',
} as const satisfies Record<RefurbMode, RefurbMode>;

export function refurbMode(lines: readonly RefurbLine[], storedTotal: number | null): RefurbMode {
  if (!anyTicked(lines)) return REFURB_MODE.typed;
  if (storedTotal === null) return REFURB_MODE.itemised;
  return sumRefurbLines(lines) === Math.round(storedTotal) ? REFURB_MODE.itemised : REFURB_MODE.superseded;
}

/**
 * The refurb figure the Deal Score must use, given the list and whatever is
 * stored. One function, so the score can never disagree with what the page
 * shows: 'itemised' returns the sum, the other two return what is stored.
 */
export function refurbTotal(lines: readonly RefurbLine[], storedTotal: number | null): number {
  const mode = refurbMode(lines, storedTotal);
  if (mode === REFURB_MODE.itemised) return sumRefurbLines(lines);
  return storedTotal === null ? 0 : Math.round(storedTotal);
}
