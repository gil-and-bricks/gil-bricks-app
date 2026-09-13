/**
 * ███ THE OPERATOR'S OWN REFURB FIGURES — THIS FILE IS GIL'S, NOT CLAUDE'S ███
 *
 * R2 RESTRUCTURED THIS FILE and left it empty, for the same reason R1 did.
 * The R2 brief said the regional figures were in "the research I am pasting
 * below". No research arrived in that message — it ends at the verification
 * list. Rather than invent UK refurb costs and ship them under his name on the
 * one number that moves a flip most, the whole machine was built around this
 * file and every value left `null`. Drop the research in here and the feature
 * switches itself on; nothing else needs changing. See docs/DECISIONS_LOG.md (R2).
 *
 * WHAT THE PAGE DOES WHILE THIS IS EMPTY: exactly what R1 shipped. A typed
 * total, a breakdown you can tick, no suggestions, and one honest line saying
 * the figures are not in yet. No region line, no labour selector, no
 * contingency row — none of them can do anything without figures, and a control
 * that does nothing is worse than no control.
 *
 * ── HOW TO FILL IT IN ───────────────────────────────────────────────────────
 * Whole pounds. No quotes, no commas, no £. Three numbers per item:
 *
 *     kitchen: { mid: 6000, low: 4000, high: 9500 },
 *
 * `mid` is the figure that lands in the box when the row is ticked. `low` and
 * `high` are the range printed under it. The spread on a real refurb is
 * ±30-40%: if low and high are close together the page is lying, so make them
 * as wide as the truth is.
 *
 * THE UNIT DEPENDS ON THE ITEM'S `driver`, set in refurb.ts:
 *   'flat'    — total £ for the job on a typical property   (kitchen, bathroom)
 *   'perSqm'  — £ per m² of internal floor area             (flooring, plastering)
 *   'perUnit' — £ each                                       (windows)
 *   'beds'    — £ per BAND, in `bands` below, not mid/low/high
 *
 * These are BASELINE figures: a typical property, at BUILDER prices, in the
 * region whose multiplier is 1.0. The page multiplies by the regional
 * multiplier and then by the labour factor. Do not bake either into these.
 */
import type { CostBand, RegionId } from '@gil-bricks/core';

/** A figure the operator has not given yet. */
const EMPTY: CostBand = { mid: null, low: null, high: null };

/**
 * Pounds per item. Keys must match `REFURB_ITEMS` in refurb.ts — enforced by
 * refurb.test.ts, so an item cannot be renamed without its figure following.
 */
export const REFURB_FIGURES: Record<string, CostBand & { bands?: Record<string, CostBand> }> = {
  ripOut: EMPTY,
  damp: EMPTY,
  roof: EMPTY,
  /** driver 'perUnit' — £ per window. */
  windows: EMPTY,
  /**
   * driver 'beds' — a whole-house rewire priced by size, not per bedroom.
   * Fill in the BANDS, not mid/low/high. Band keys may be "1-2", "3", "4+".
   */
  rewire: { ...EMPTY, bands: { '1-2': EMPTY, '3': EMPTY, '4+': EMPTY } },
  plumbing: EMPTY,
  heating: EMPTY,
  /** driver 'perSqm' — £ per m². */
  plastering: EMPTY,
  kitchen: EMPTY,
  bathroom: EMPTY,
  /** driver 'perSqm' — £ per m². */
  flooring: EMPTY,
  decoration: EMPTY,
  externals: EMPTY,
  other: EMPTY,
};

/**
 * REGIONAL MULTIPLIERS. The region whose figures you wrote above is 1.0; every
 * other region is relative to it. London is normally the highest.
 *
 *     london: 1.35,
 *     'north-west': 1.0,
 *
 * All ten are required before any suggestion is offered anywhere — a partly
 * filled map would quietly offer figures in some regions and not others.
 */
export const REGION_MULTIPLIERS: Record<RegionId, number | null> = {
  london: null,
  'south-east': null,
  'east-of-england': null,
  'south-west': null,
  'east-midlands': null,
  'west-midlands': null,
  'yorkshire-humber': null,
  'north-west': null,
  'north-east': null,
  wales: null,
};

/**
 * WHO IS DOING THE WORK. The figures above are supply-and-fit at BUILDER
 * prices, so `builder` is the baseline and must be 1.0. The others are relative
 * to it, and the direction is not negotiable even if the sizes are yours:
 *
 *   mainContractor — ABOVE 1.0. A main contractor coordinates the trades and
 *                    carries the risk, and charges a margin for it.
 *   builder        — exactly 1.0. The baseline the figures were written at.
 *   tradesDirect   — BELOW 1.0. Cheaper because YOU are the project manager.
 *   diy            — lowest. Materials only. The page says out loud that this
 *                    assumes your labour is free, and that this is how people
 *                    get burned.
 */
export const LABOUR_FACTORS: Record<string, number | null> = {
  mainContractor: null,
  builder: null,
  tradesDirect: null,
  diy: null,
};

/**
 * WHEN THESE FIGURES WERE COMPILED — an ISO date, e.g. '2026-09-01'.
 * Shown on the page. Once they are more than `REFURB.staleAfterMonths` old the
 * page says so, without hiding them.
 */
export const FIGURES_REVIEWED: string | null = null;

/**
 * DO THE FIGURES ABOVE INCLUDE VAT? Set true or false. There is deliberately no
 * VAT toggle in the UI (the operator overruled that: a toggle is the likeliest
 * way to double-count), so this single flag is the only thing that decides what
 * the caveat tells people to check. Leave it null and the caveat says nothing
 * about VAT rather than guessing.
 */
export const FIGURES_INCLUDE_VAT: boolean | null = null;

/**
 * HOW TO REFRESH THESE WITHOUT RE-RESEARCHING EVERY ITEM.
 *
 * The ONS publishes a free monthly Construction Output Price Index. The series
 * for this feature is REPAIR AND MAINTENANCE, not new build — new build tracks
 * different work and would drift these figures the wrong way.
 *
 * The method, once a year:
 *   1. Take the index value for the month in FIGURES_REVIEWED  → `old`.
 *   2. Take the latest published month                          → `new`.
 *   3. Multiply every `mid`, `low` and `high` above by new / old.
 *   4. Round to something honest — the nearest £100 on a job, £5 on a £/m².
 *   5. Set FIGURES_REVIEWED to the month you uprated to.
 *
 * Regional multipliers do NOT need uprating this way: they are ratios, and they
 * only move when regional cost differences move. Re-check them every few years.
 */
export const UPRATING = {
  source: 'ONS Construction Output Price Index',
  series: 'Repair and maintenance',
  url: 'https://www.ons.gov.uk/businessindustryandtrade/constructionindustry',
  /** Applied to every mid/low/high. Ratios (multipliers) are not uprated. */
  method: 'Multiply every figure by (latest index ÷ index at FIGURES_REVIEWED).',
} as const;

// ---------------------------------------------------------------------------
// Readers. Nothing below needs editing.
// ---------------------------------------------------------------------------

const filled = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;

const bandFilled = (b: CostBand | undefined): boolean => b !== undefined && filled(b.mid);

/**
 * True only when this feature can offer an honest suggestion for ANYTHING:
 * at least one item priced, EVERY region multiplied, and every labour factor
 * set. Partial data offers nothing — the page falls back to R1's typed total.
 */
export function suggestionsReady(): boolean {
  const anyItem = Object.values(REFURB_FIGURES).some(
    (f) => bandFilled(f) || Object.values(f.bands ?? {}).some(bandFilled),
  );
  const allRegions = Object.values(REGION_MULTIPLIERS).every(filled);
  const allLabour = Object.values(LABOUR_FACTORS).every(filled);
  return anyItem && allRegions && allLabour;
}

export function figureSpecFor(key: string): (CostBand & { bands?: Record<string, CostBand> }) | undefined {
  return REFURB_FIGURES[key];
}

export function regionMultiplier(region: RegionId | null): number | null {
  return region === null ? null : REGION_MULTIPLIERS[region] ?? null;
}

export function labourFactor(id: string): number | null {
  return LABOUR_FACTORS[id] ?? null;
}

/** R1's name, kept: "has the operator given us anything at all?" */
export function hasAnyFigure(): boolean {
  return suggestionsReady();
}

/** R1's name, kept. The mid-point for one item is now property-dependent, so
 * this answers only "is there a figure behind this row at all?" */
export function figureFor(key: string): number | null {
  const spec = REFURB_FIGURES[key];
  if (spec === undefined) return null;
  if (filled(spec.mid)) return spec.mid;
  return null;
}
