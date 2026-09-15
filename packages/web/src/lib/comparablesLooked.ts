/**
 * C1 — WHAT COUNTS AS HAVING LOOKED AT THE COMPARABLES.
 *
 * ── WHY THERE IS A BAR AT ALL ───────────────────────────────────────────────
 * Every end value, every refinance figure and every flip margin rests on which
 * sold properties the subject was compared against. Shown before the list has
 * been seen, the figure reads as a fact about the house; it is arithmetic over
 * a set a person could have pruned in ten seconds. So it waits.
 *
 * ── WHERE THE BAR IS, AND WHY EXACTLY THERE ─────────────────────────────────
 * THE FIFTH COMPARABLE HAS BEEN ON SCREEN — or the last one, where there are
 * fewer than five.
 *
 * FIVE IS NOT A NUMBER PICKED FOR THIS. It is `COMPARABLE_RULES.minComparables`,
 * the same figure, from the same place, that decides whether a valuation may
 * exist AT ALL: below five the middle of the set is an accident of which four
 * houses happened to sell, so the product widens once and then refuses. The bar
 * for having looked is therefore the bar for there being anything to look at.
 * Change one and the other moves with it, which is the point.
 *
 *   • It cannot be satisfied without the evidence actually being in front of
 *     you: five rows is most of a phone screen.
 *   • It costs nothing extra. The valuation sits below the comparables, so
 *     reaching it means passing them — the gate charges for a journey somebody
 *     was making anyway, which is what keeps it from being a hoop.
 *   • THE END OF A LONG LIST WAS REJECTED, and it was the first thing tried. On
 *     a real Pontypridd terrace the default filters returned FIFTY comparables;
 *     demanding the fiftieth be scrolled past is an endurance test, not
 *     attention, and somebody who has satisfied themselves after six rows would
 *     be made to scroll forty-four more for nothing.
 *   • The top of the section would be no bar at all: a heading scrolls past
 *     before anything has been read. A tick box WOULD be a hoop, and a bad one,
 *     because it punishes the person whose set is already clean.
 *   • A timer was rejected outright. Any number is arbitrary, it can be
 *     satisfied by walking away from the desk, and it teaches waiting rather
 *     than looking.
 *
 * TOUCHING THE FILTERS OR A TICK ALSO COUNTS. Somebody changing the radius or
 * unticking a sale is plainly working the evidence, and it would be absurd to
 * withhold a figure from them because they had not yet scrolled to the bottom.
 *
 * ── AND IT FAILS OPEN ───────────────────────────────────────────────────────
 * Where the browser cannot tell us what is on screen, the gate opens. A figure
 * withheld because OUR instrument is missing is a worse failure than a figure
 * shown a moment early: the person gets nothing, and no explanation that is
 * true. The honest reading is that we do not know, and not knowing is not
 * evidence that they have not looked.
 */

/** The three things the gate knows. Nothing else may be consulted. */
export interface LookedSignals {
  /** The fifth comparable — or the last, where there are fewer — has been seen. */
  endOfListSeen: boolean;
  /** A filter was changed, or a sale was ticked or unticked. */
  worked: boolean;
  /** False where the browser gives us no way to tell — the gate then opens. */
  canObserve: boolean;
}

export function hasLooked(x: LookedSignals): boolean {
  if (!x.canObserve) return true;
  return x.endOfListSeen || x.worked;
}

/**
 * WHICH PROPERTY THIS WAS SATISFIED FOR.
 *
 * Keyed by the subject, not by the filters: changing the radius changes the
 * set, but you changed it while looking at it, so re-gating there would be a
 * hoop. A DIFFERENT PROPERTY is a different set of sales and asks again.
 *
 * Postcode plus house and flat number, upper-cased and stripped of spaces, so
 * "CF37 1HR" and "cf371hr" are one property rather than two.
 */
export function subjectKey(s: { postcode: string; paon: string; saon: string }): string {
  const norm = (v: string): string => v.trim().toUpperCase().replace(/\s+/g, '');
  return `${norm(s.postcode)}|${norm(s.paon)}|${norm(s.saon)}`;
}

/** Where a satisfied gate is remembered. Per tab: this is a working session, not a preference. */
export const STORE_PREFIX = 'gb:comps-looked:';
