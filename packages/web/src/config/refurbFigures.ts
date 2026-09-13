/**
 * ███ THE OPERATOR'S OWN REFURB FIGURES — THIS FILE IS GIL'S, NOT CLAUDE'S ███
 *
 * ── WHERE THESE NUMBERS CAME FROM, AND WHAT THEY ARE NOT ───────────────────
 *
 * Commissioned desk research, 2026-09-01, cross-checked across four commercial
 * UK cost guides: Checkatrade, MyBuilder, MyJobQuote and the FMB. All
 * supply-and-fit, all for a standard 2-3 bed UK terrace or semi, all INCLUDING
 * VAT. The baseline region is the South West, which the research puts at the
 * national mean.
 *
 * TREAT THEM AS INDICATIVE, NOT SURVEYED. This is the part a future reader must
 * not skip:
 *
 *   - They are COMMERCIAL COST GUIDES. The businesses publishing them make
 *     money when people commission work, so there is a standing incentive for
 *     the headline numbers to look affordable. Nothing here is audited.
 *   - Some of these guides are now GENERATED from past job data rather than
 *     compiled by hand, and at least partly by AI. That means the provenance of
 *     any single figure is weaker than a page of tidy tables implies.
 *   - They are NOT a survey, NOT a statistical sample, and NOT traceable to a
 *     source you could re-run. Nobody measured a representative set of UK
 *     refurbs to produce them.
 *   - The mid-point is the least reliable number here. The RANGE is the honest
 *     part, which is why every figure carries one and the page always prints it.
 *
 * So: fine as a starting point for somebody who has no quote yet, which is
 * exactly what the page says they are. Not fine as evidence, not fine to defend
 * a valuation with, and not fine to quietly harden into "our figures" later.
 * If they are ever replaced with something better sourced, say so here.
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
  ripOut: { low: 800, mid: 1600, high: 3000 },
  damp: { low: 1000, mid: 3000, high: 6000 },
  roof: { low: 6500, mid: 9500, high: 15000 },
  /** driver 'perUnit' — £ per window. */
  windows: { low: 450, mid: 700, high: 1200 },
  /**
   * driver 'beds' — a whole-house rewire priced by size, not per bedroom.
   * The research gave 2-bed / 3-bed / 4-bed; the bands below carry them, with
   * 4+ covering anything larger.
   */
  rewire: {
    ...EMPTY,
    bands: {
      '1-2': { low: 3500, mid: 4800, high: 6500 },
      '3': { low: 4450, mid: 6250, high: 8000 },
      '4+': { low: 5500, mid: 7500, high: 9500 },
    },
  },
  /** EXCLUDES the boiler — that is its own row, or it is counted twice. */
  plumbing: { low: 2000, mid: 3500, high: 6000 },
  heating: { low: 1800, mid: 3000, high: 6000 },
  /** driver 'perSqm' — £ per m². */
  plastering: { low: 30, mid: 45, high: 65 },
  kitchen: { low: 6000, mid: 10000, high: 20000 },
  bathroom: { low: 5500, mid: 7000, high: 15000 },
  /** driver 'perSqm' — £ per m². */
  flooring: { low: 30, mid: 45, high: 60 },
  decoration: { low: 2000, mid: 4000, high: 6000 },
  externals: { low: 1000, mid: 4000, high: 8000 },
  /** Deliberately empty: this row is whatever the person types into it. */
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
  london: 1.15,
  'south-east': 1.08,
  'east-of-england': 1.04,
  // The baseline: the research puts the South West at the national mean, so the
  // figures above are written at South West prices and this must stay 1.0.
  'south-west': 1.0,
  'east-midlands': 0.98,
  'west-midlands': 0.97,
  'north-west': 0.96,
  'yorkshire-humber': 0.95,
  wales: 0.94,
  'north-east': 0.91,
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
  mainContractor: 1.12,
  builder: 1.0,
  tradesDirect: 0.88,
  diy: 0.5,
};

/**
 * WHEN THESE FIGURES WERE COMPILED — an ISO date, e.g. '2026-09-01'.
 * Shown on the page. Once they are more than `REFURB.staleAfterMonths` old the
 * page says so, without hiding them.
 */
export const FIGURES_REVIEWED: string | null = '2026-09-01';

/**
 * DO THE FIGURES ABOVE INCLUDE VAT? Set true or false. There is deliberately no
 * VAT toggle in the UI (the operator overruled that: a toggle is the likeliest
 * way to double-count), so this single flag is the only thing that decides what
 * the caveat tells people to check. Leave it null and the caveat says nothing
 * about VAT rather than guessing.
 */
export const FIGURES_INCLUDE_VAT: boolean | null = true;

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
