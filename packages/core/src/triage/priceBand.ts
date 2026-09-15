/**
 * X1 — WHAT SIMILAR-SIZED PROPERTIES OF THE SAME TYPE ACTUALLY SOLD FOR.
 *
 * THE ONE NUMBER THE EXTENSION CAN HONESTLY PUT AGAINST AN ASKING PRICE. It is
 * not a valuation and it is not an opinion: it is the £/m² that comparable sales
 * actually achieved, and where this asking price sits against them.
 *
 * WHAT IT MAY SAY, AND WHAT IT MAY NEVER SAY. It returns a POSITION — within,
 * above or below the typical range — and never a judgement. "Below the range" is
 * a fact about arithmetic. "Good value" is a claim about a property nobody has
 * seen, on a street this tool cannot resolve, and it is the one thing this
 * product must never say. Cheap for the size very often means cheap for a
 * reason: a bad street, a short lease, a roof. The panel's copy carries that
 * caveat permanently; this module simply refuses to produce the adjective.
 *
 * THE FIVE RULES IT ENFORCES, each of which exists because the alternative
 * misleads somebody:
 *
 *   1. SAME TYPE. A terrace and a detached house in one sector are not
 *      comparable at any size.
 *   2. A SIZE BAND, not the whole sector. £/m² is not flat across sizes — small
 *      flats carry a premium per metre almost everywhere.
 *   3. RECENT SALES ONLY. Two to three years; older evidence is a different
 *      market.
 *   4. NEVER A SINGLE FIGURE. A range, always, with the count beside it. One
 *      number invites the reader to treat it as a valuation.
 *   5. FIVE COMPARABLES OR NOTHING. Below that the "range" is an accident of
 *      which four houses happened to sell. It widens to the outward code once,
 *      labelled as widened, and if that still fails it says there is not enough
 *      data — which is a useful answer, not a failure.
 *
 * AND A SIXTH, WHICH MATTERS MOST IN MIXED AREAS. Where the spread is wide
 * enough that the middle means nothing — a sector holding both ex-council
 * terraces and renovated townhouses — it says so rather than printing an average
 * that describes no actual house.
 */

/** One sold record, as the sector files carry them. */
export interface BandSale {
  date: string;
  price: number;
  type: string;
  floorAreaSqm?: number | null;
  ppsqm?: number | null;
}

export interface BandInput {
  /** The subject's own type letter, as the sector files use (D/S/T/F/O). */
  type: string;
  floorAreaSqm: number;
  askingPrice: number;
  sales: readonly BandSale[];
  /** Sales from the wider area, used ONLY if the sector cannot reach five. */
  widerSales?: readonly BandSale[];
  /** Today, injected so the window is testable. */
  now: Date;
}

export type BandOutcome =
  | { kind: 'none'; reason: 'no-area' | 'too-few'; countFound: number }
  | { kind: 'spread'; count: number; widened: boolean; low: number; high: number }
  | {
    kind: 'range';
    count: number;
    widened: boolean;
    /** The middle half of the evidence: p25 to p75 of £/m². */
    low: number;
    high: number;
    subjectPpsqm: number;
    position: 'within' | 'above' | 'below';
  };

/** The rules, in one place, so they can be tuned without touching the maths. */
export const BAND_RULES = {
  /** ±20% of the subject's floor area. */
  sizeTolerance: 0.2,
  /** How far back a sale still counts. */
  years: 3,
  /** Fewer than this and there is no honest comparison to draw. */
  minComparables: 5,
  /**
   * When p75 is more than this multiple of p25, the middle describes no actual
   * house. 2.0 means the upper quartile is twice the lower — an area holding two
   * different markets rather than one.
   */
  spreadRatioLimit: 2.0,
} as const;

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 1) return sorted[0] as number;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return lo === hi ? a : a + (b - a) * (pos - lo);
}

function matches(sales: readonly BandSale[], input: BandInput): number[] {
  const cutoff = new Date(input.now);
  cutoff.setFullYear(cutoff.getFullYear() - BAND_RULES.years);
  const iso = cutoff.toISOString().slice(0, 10);
  const lo = input.floorAreaSqm * (1 - BAND_RULES.sizeTolerance);
  const hi = input.floorAreaSqm * (1 + BAND_RULES.sizeTolerance);
  const out: number[] = [];
  for (const s of sales) {
    if (s.type !== input.type) continue;
    if (s.date < iso) continue;
    const area = s.floorAreaSqm;
    if (typeof area !== 'number' || area <= 0) continue;
    if (area < lo || area > hi) continue;
    const pps = typeof s.ppsqm === 'number' && s.ppsqm > 0 ? s.ppsqm : s.price / area;
    if (!Number.isFinite(pps) || pps <= 0) continue;
    out.push(pps);
  }
  return out;
}

export function priceBand(input: BandInput): BandOutcome {
  if (!(input.floorAreaSqm > 0)) return { kind: 'none', reason: 'no-area', countFound: 0 };

  let pps = matches(input.sales, input);
  let widened = false;
  if (pps.length < BAND_RULES.minComparables && input.widerSales !== undefined) {
    const wider = matches(input.widerSales, input);
    if (wider.length > pps.length) { pps = wider; widened = true; }
  }
  if (pps.length < BAND_RULES.minComparables) {
    return { kind: 'none', reason: 'too-few', countFound: pps.length };
  }

  const sorted = [...pps].sort((a, b) => a - b);
  const low = Math.round(quantile(sorted, 0.25));
  const high = Math.round(quantile(sorted, 0.75));

  // An area holding two different markets: say so rather than average them.
  if (low > 0 && high / low >= BAND_RULES.spreadRatioLimit) {
    return { kind: 'spread', count: sorted.length, widened, low, high };
  }

  const subjectPpsqm = Math.round(input.askingPrice / input.floorAreaSqm);
  const position = subjectPpsqm < low ? 'below' : subjectPpsqm > high ? 'above' : 'within';
  return { kind: 'range', count: sorted.length, widened, low, high, subjectPpsqm, position };
}

/**
 * X4 — THE TWO HELPERS BOTH SURFACES NEED, IN ONE PLACE.
 *
 * The panel had its own copy of each and the content script was about to grow a
 * second. A property type read one way on the panel and another on the portal's
 * page would put two different answers about one house on one screen.
 */

/** The subject's type letter, as the sector files use it (D/S/T/F/O). */
export function sectorTypeLetter(propertyType: string | null | undefined): string {
  const t = (propertyType ?? '').toLowerCase();
  if (/semi/.test(t)) return 'S';
  if (/detached/.test(t)) return 'D';
  if (/terrac|town\s?house|end[- ]?of[- ]?terrace/.test(t)) return 'T';
  if (/flat|apartment|maisonette/.test(t)) return 'F';
  return 'O';
}

/** A sector file's sales in the shape `priceBand` reads. */
export function salesFromSector(
  sector: { sales?: readonly unknown[] } | null | undefined,
): BandSale[] {
  if (!sector || !Array.isArray(sector.sales)) return [];
  return (sector.sales as readonly Record<string, unknown>[]).map((s) => ({
    date: String(s.date ?? ''),
    price: Number(s.price ?? 0),
    type: String(s.type ?? ''),
    floorAreaSqm: typeof s.floorAreaSqm === 'number' ? s.floorAreaSqm : null,
    ppsqm: typeof s.ppsqm === 'number' ? s.ppsqm : null,
  }));
}
