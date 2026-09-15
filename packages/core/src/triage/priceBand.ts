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

import type { ListingAddress, NormalisedListing } from '../listing/types';
import type { SectorFile } from '../data/types';

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

/**
 * X5 — ONE ASSEMBLY OF THE PRICE COMPARISON, FOR EVERY SURFACE THAT SHOWS IT.
 *
 * `priceBand` is the maths and always was shared. What was NOT shared was the
 * work of deciding what to hand it — which floor area to use, and whether to
 * widen — and two surfaces had grown two different answers:
 *
 *   THE PANEL resolved the area from the listing, then the EPC register, then
 *     the sector's own EPC-joined sold data, and passed `widerSales` so a thin
 *     sector could widen to its neighbours.
 *   THE BOX on the portal's page resolved the area from the listing and the
 *     register only, and never widened at all.
 *
 * Measured on one real listing with one sector: the panel returned a widened
 * range and the box returned "too few". Same property, same data, two answers,
 * on two surfaces a person can have open at once.
 *
 * That is the fault this project keeps meeting — two paths agreeing until one
 * changes — so the assembly lives here now and neither surface owns a copy.
 */

/** Where a floor area came from. `none` means nothing could supply one.
 *  Named for the LISTING to avoid colliding with the EPC module's own AreaSource. */
export type ListingAreaSource = 'listing' | 'epc-register' | 'epc-sector' | 'none';

export interface ResolveAreaInput {
  listing: Pick<NormalisedListing, 'floorAreaSqm' | 'address' | 'postcode'>;
  /** The subject's own sector, whose sold rows carry EPC-joined floor areas. */
  sector: SectorLike | null;
  /** What the EPC register answered, where it was asked. */
  registerAreaSqm?: number | null;
}

/**
 * The sector, as both callers hold it. Typed as the real thing rather than a
 * narrow shape: the area lookup this takes as a callback reads more of it than
 * the band does, and a loose type here just moves the cast somewhere worse.
 */
export type SectorLike = SectorFile;

/** The signature of `floorAreaFromSector`, which both callers pass in. */
export type AreaFromSector = (
  sector: SectorFile | null | undefined,
  address: ListingAddress | null | undefined,
  postcode?: string | null,
) => number | null;

/**
 * THE ORDER, AND WHY IT IS THIS ORDER. The listing's own figure first, because
 * it is what the seller published. Then the EPC register, which is the real
 * certificate and answers for houses that have not sold in twenty years. Then
 * the sector's own sold data, which can only answer where this address has sold
 * before. Anything else is nothing, and nothing is an honest answer.
 */
export function resolveListingArea(
  input: ResolveAreaInput,
  fromSector: AreaFromSector,
): { sqm: number | null; source: ListingAreaSource } {
  const l = input.listing;
  if (l.floorAreaSqm.status === 'found' && l.floorAreaSqm.value) {
    return { sqm: l.floorAreaSqm.value, source: 'listing' };
  }
  const reg = input.registerAreaSqm;
  if (typeof reg === 'number' && reg > 0) return { sqm: reg, source: 'epc-register' };
  const fromSold = fromSector(input.sector, l.address.value, l.postcode.value);
  if (fromSold) return { sqm: fromSold, source: 'epc-sector' };
  return { sqm: null, source: 'none' };
}

export interface BandForListingInput extends ResolveAreaInput {
  listing: NormalisedListing;
  /** Neighbouring sectors' sales, used ONLY if the subject's cannot reach five. */
  widerSales?: readonly BandSale[] | null;
  now: Date;
}

/**
 * The comparison one surface should show for one listing, and the area it rests
 * on. Every caller gets the same answer because there is only one of these.
 */
export function bandForListing(
  input: BandForListingInput,
  fromSector: AreaFromSector,
): { band: BandOutcome; areaSqm: number | null; areaSource: ListingAreaSource } {
  const area = resolveListingArea(input, fromSector);
  const band = priceBand({
    type: sectorTypeLetter(input.listing.propertyType.value),
    floorAreaSqm: area.sqm ?? 0,
    askingPrice: input.listing.askingPrice.value ?? 0,
    sales: salesFromSector(input.sector),
    widerSales: input.widerSales ?? undefined,
    now: input.now,
  });
  return { band, areaSqm: area.sqm, areaSource: area.source };
}
