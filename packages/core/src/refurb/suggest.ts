/**
 * REFURB SUGGESTIONS (R2) — turning a stored figure into a number for THIS
 * property, and showing every step of how it got there.
 *
 * THE LAW THIS FILE IS UNDER: these are starting points, never quotes. Nothing
 * here is applied to anything until a person ticks a row, every number it
 * returns is editable the moment it lands, and the real spread on a refurb is
 * ±30-40% — which is why nothing returns a bare mid-point without its range.
 *
 * THE CHAIN, in the order the working prints it:
 *     base (for this property's size / beds / count)
 *   × regional multiplier
 *   × labour factor (who is doing the work)
 *   = the figure that lands in the row
 *   … summed …
 *   × (1 + contingency)
 *   = the refurb total the Deal Score uses
 *
 * NO FIGURES LIVE HERE. Every number is passed in from the operator's own
 * config. This file knows the shape of the arithmetic and nothing about pounds.
 */
import type { RegionId } from './region';

/** How an item's cost scales with the property. */
export type RefurbDriver = 'flat' | 'perSqm' | 'beds' | 'perUnit';

/** A mid-point with the range around it. `null` = the operator has not given it. */
export interface CostBand {
  mid: number | null;
  low: number | null;
  high: number | null;
}

/** What the operator stores for one item. `bands` is used only by 'beds'. */
export interface FigureSpec extends CostBand {
  bands?: Record<string, CostBand>;
}

/** What we know about the property. Anything unknown is null, never guessed. */
export interface PropertyFacts {
  region: RegionId | null;
  /** Internal floor area in m², from EPC or typed. */
  floorAreaSqm: number | null;
  beds: number | null;
  /** Per-item counts the person can set — windows, today. */
  counts: Record<string, number | null>;
}

/** Why a row cannot offer a figure. The page says which, rather than guessing. */
export type NoSuggestion = 'no-figures' | 'no-region' | 'needs-area' | 'needs-beds' | 'needs-count';

/** The reasons by name, so no caller retypes one as a bare string literal. */
export const NO_SUGGESTION = {
  noFigures: 'no-figures',
  noRegion: 'no-region',
  needsArea: 'needs-area',
  needsBeds: 'needs-beds',
  needsCount: 'needs-count',
} as const satisfies Record<string, NoSuggestion>;

/** Likewise the driver names. */
export const REFURB_DRIVER = {
  flat: 'flat',
  perSqm: 'perSqm',
  beds: 'beds',
  perUnit: 'perUnit',
} as const satisfies Record<string, RefurbDriver>;

export interface Suggestion {
  band: CostBand;
  /** Every step, for the working. */
  steps: {
    base: CostBand;
    driver: RefurbDriver;
    /** The multiplier the driver applied, e.g. 92 m² or 4 windows. */
    quantity: number | null;
    regionMultiplier: number | null;
    labourFactor: number | null;
  };
}

const round = (n: number): number => Math.round(n);

const scaleBand = (b: CostBand, by: number): CostBand => ({
  mid: b.mid === null ? null : b.mid * by,
  low: b.low === null ? null : b.low * by,
  high: b.high === null ? null : b.high * by,
});

const roundBand = (b: CostBand): CostBand => ({
  mid: b.mid === null ? null : round(b.mid),
  low: b.low === null ? null : round(b.low),
  high: b.high === null ? null : round(b.high),
});

const hasMid = (b: CostBand | undefined): b is CostBand => b !== undefined && typeof b.mid === 'number' && b.mid > 0;

/** Which bed band a property falls in. Keys are the operator's to name. */
export function bedBandFor(beds: number, bands: Record<string, CostBand>): string | null {
  const keys = Object.keys(bands);
  // Keys are ranges like "1-2", "3", "4+". Matched numerically, never by string.
  for (const key of keys) {
    const plus = /^(\d+)\+$/.exec(key);
    if (plus && beds >= Number(plus[1])) return key;
    const range = /^(\d+)-(\d+)$/.exec(key);
    if (range && beds >= Number(range[1]) && beds <= Number(range[2])) return key;
    if (/^\d+$/.test(key) && beds === Number(key)) return key;
  }
  return null;
}

/**
 * The figure to offer for one item, or the reason there is none. Returning a
 * REASON rather than a zero is the point: a row we cannot size says so, instead
 * of quietly contributing nothing to a total somebody then trusts.
 */
export function suggestFor(
  spec: FigureSpec | undefined,
  driver: RefurbDriver,
  itemKey: string,
  facts: PropertyFacts,
  regionMultiplier: number | null,
  labourFactor: number | null,
): Suggestion | NoSuggestion {
  if (spec === undefined) return NO_SUGGESTION.noFigures;
  if (facts.region === null) return NO_SUGGESTION.noRegion;
  if (regionMultiplier === null || labourFactor === null) return NO_SUGGESTION.noFigures;

  let base: CostBand;
  let quantity: number | null = null;

  if (driver === REFURB_DRIVER.beds) {
    const bands = spec.bands;
    if (bands === undefined || Object.keys(bands).length === 0) return NO_SUGGESTION.noFigures;
    if (facts.beds === null || facts.beds <= 0) return NO_SUGGESTION.needsBeds;
    const key = bedBandFor(facts.beds, bands);
    if (key === null || !hasMid(bands[key])) return NO_SUGGESTION.noFigures;
    base = bands[key];
    quantity = facts.beds;
  } else if (driver === REFURB_DRIVER.perSqm) {
    if (!hasMid(spec)) return NO_SUGGESTION.noFigures;
    if (facts.floorAreaSqm === null || facts.floorAreaSqm <= 0) return NO_SUGGESTION.needsArea;
    base = spec;
    quantity = facts.floorAreaSqm;
  } else if (driver === REFURB_DRIVER.perUnit) {
    if (!hasMid(spec)) return NO_SUGGESTION.noFigures;
    const count = facts.counts[itemKey] ?? null;
    if (count === null || count <= 0) return NO_SUGGESTION.needsCount;
    base = spec;
    quantity = count;
  } else {
    if (!hasMid(spec)) return NO_SUGGESTION.noFigures;
    base = spec;
  }

  const sized = quantity === null || driver === REFURB_DRIVER.beds ? base : scaleBand(base, quantity);
  const band = roundBand(scaleBand(sized, regionMultiplier * labourFactor));
  return {
    band,
    steps: { base, driver, quantity, regionMultiplier, labourFactor },
  };
}

export function isSuggestion(v: Suggestion | NoSuggestion): v is Suggestion {
  return typeof v !== 'string';
}

/**
 * The total, with contingency, and the range around it. The MID-POINT is what
 * the Deal Score uses — the range is shown beside it so nobody reads the
 * mid-point as a quote.
 */
export function refurbRange(bands: readonly CostBand[], contingencyPct: number): CostBand {
  const sum = (pick: (b: CostBand) => number | null): number | null => {
    let total = 0;
    let any = false;
    for (const b of bands) {
      const v = pick(b);
      if (v === null || !Number.isFinite(v)) continue;
      total += v;
      any = true;
    }
    return any ? total : null;
  };
  const factor = 1 + (Number.isFinite(contingencyPct) ? contingencyPct : 0) / 100;
  return roundBand(scaleBand(
    { mid: sum((b) => b.mid), low: sum((b) => b.low), high: sum((b) => b.high) },
    factor,
  ));
}

/** Are the operator's figures old enough that the page should say so? */
export function figuresAreStale(reviewedIso: string | null, nowMs: number, staleAfterMonths: number): boolean {
  if (reviewedIso === null || reviewedIso === '') return false;
  const then = Date.parse(reviewedIso);
  if (!Number.isFinite(then)) return false;
  const months = (nowMs - then) / (365.25 / 12 * 86_400_000);
  return months > staleAfterMonths;
}
