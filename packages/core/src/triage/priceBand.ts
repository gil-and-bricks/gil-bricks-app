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

import { COMPARABLE_RULES } from '../comparables/rules';
import { distanceMiles } from '../comparables/geo';
import { periodStart } from '../comparables/engine';
import type { PeriodMonths } from '../comparables/rules';
import { geocodePostcode } from '../comparables/geocode';
import type { ListingAddress, NormalisedListing } from '../listing/types';
import type { SectorFile } from '../data/types';

/** One sold record, as the sector files carry them. */
export interface BandSale {
  date: string;
  price: number;
  type: string;
  floorAreaSqm?: number | null;
  ppsqm?: number | null;
  /**
   * C1 — WHERE THE SALE IS. The sector files have always carried these; the
   * band simply never read them, which is how it came to compare against a
   * whole postcode sector while every other surface worked to half a mile.
   */
  lat?: number | null;
  lng?: number | null;
}

export interface BandInput {
  /** The subject's own type letter, as the sector files use (D/S/T/F/O). */
  type: string;
  floorAreaSqm: number;
  askingPrice: number;
  sales: readonly BandSale[];
  /**
   * C1 — SALES FROM THE SURROUNDING SECTORS, POOLED WITH THE SUBJECT'S OWN.
   *
   * They used to be a FALLBACK, and the fallback REPLACED the subject's sector
   * rather than adding to it — so a widened band was built entirely out of
   * neighbours and left out the sales closest to the property. They are pooled
   * now, and the radius decides what counts, which is the only way a half-mile
   * circle that crosses a sector boundary can be covered at all.
   */
  widerSales?: readonly BandSale[];
  /**
   * The subject's own point. Without it no radius can be applied, and the
   * comparison falls back to the subject's postcode sector — which the copy
   * then SAYS, because a silently different area is the fault this sprint exists
   * to remove.
   */
  subjectAt?: { lat: number; lng: number } | null;
  /**
   * C1 — THE MONTH THE SOLD DATA RUNS TO (yyyy-mm), which is what the window
   * counts back from on every other surface.
   *
   * Counting back from TODAY is what this used to do, and it quietly shortened
   * the window by however stale the data was: with the pipeline two months
   * behind, "the last twelve months" was ten months of evidence here and twelve
   * everywhere else. On one dataset that alone put a sale in the analyser's set
   * and out of the band's — the same sale, the same rule, two answers.
   *
   * Absent, the cutoff falls back to `now`, which is the old behaviour and is
   * only ever right when the data is completely current.
   */
  asOf?: string | null;
  /** Today, injected so the window is testable. */
  now: Date;
}

/**
 * C1 — WHAT AREA THE COMPARISON ACTUALLY COVERED. Printed, never assumed.
 * 'half-mile' is the product's default and 'wider' its one widening step. The
 * other two are the honest fallbacks for a subject that could NOT be placed:
 * 'sector' is its own postcode sector, 'sectors' that sector plus the ones
 * around it, reached only when its own was too thin. Neither is half a mile and
 * the copy never says it is.
 */
export type BandArea = 'half-mile' | 'wider' | 'sector' | 'sectors';

export type BandOutcome =
  | { kind: 'none'; reason: 'no-area' | 'too-few'; countFound: number; area?: BandArea }
  | { kind: 'spread'; count: number; widened: boolean; area: BandArea; low: number; high: number }
  | {
    kind: 'range';
    count: number;
    widened: boolean;
    area: BandArea;
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
  /**
   * How far back a sale still counts.
   *
   * C1 — TWELVE MONTHS, TAKEN FROM THE SHARED RULES RATHER THAN RETYPED. It
   * used to be three years, which disagreed with every other surface in the
   * product: the analyser, the valuation and the pack all worked to twelve
   * months. It happened to be harmless because the sector files only ever carry
   * twelve months of sales, so the three-year cutoff could never bind — but a
   * rule that is only correct by accident is a rule waiting to be wrong, and the
   * moment the pipeline widened its window it would have been.
   *
   * Setting it to `COMPARABLE_RULES.periodMonths` rather than to 12 is the
   * point: the two cannot drift apart again, because there is only one number.
   */
  periodMonths: COMPARABLE_RULES.periodMonths,
  /** Fewer than this, and there is no honest comparison to draw. Same source. */
  minComparables: COMPARABLE_RULES.minComparables,
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

function matches(sales: readonly BandSale[], input: BandInput, radiusMiles: number | null): number[] {
  // The SAME function the comparables engine uses, over the same as-of month,
  // so the two windows cannot be a day apart — let alone two months.
  let iso: string;
  if (typeof input.asOf === 'string' && /^\d{4}-\d{2}$/.test(input.asOf)) {
    iso = periodStart(input.asOf, BAND_RULES.periodMonths as PeriodMonths);
  } else {
    const cutoff = new Date(input.now);
    cutoff.setMonth(cutoff.getMonth() - BAND_RULES.periodMonths);
    iso = cutoff.toISOString().slice(0, 10);
  }
  const lo = input.floorAreaSqm * (1 - BAND_RULES.sizeTolerance);
  const hi = input.floorAreaSqm * (1 + BAND_RULES.sizeTolerance);
  const at = input.subjectAt ?? null;
  const out: number[] = [];
  for (const s of sales) {
    if (s.type !== input.type) continue;
    if (s.date < iso) continue;
    if (radiusMiles !== null && at !== null) {
      // A sale we cannot place is a sale we cannot claim is nearby. Keeping it
      // would widen the area silently, which is the one thing forbidden here.
      if (typeof s.lat !== 'number' || typeof s.lng !== 'number') continue;
      if (distanceMiles(at.lat, at.lng, s.lat, s.lng) > radiusMiles) continue;
    }
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

  /**
   * C1 — THE SAME AREA RULE AS EVERY OTHER SURFACE, AND THE SAME ONE STEP.
   *
   * Half a mile, then one mile, over ONE pool of the subject's sector and its
   * neighbours — a half-mile circle around a property near a sector edge lies
   * partly in the next sector, so covering it needs both.
   *
   * Where the subject cannot be placed there is no circle to draw, and the
   * comparison falls back to the subject's own sector. That is a different area
   * from the one the product means, so it is REPORTED as one: `area: 'sector'`,
   * which the copy prints. Nothing here widens or narrows in silence.
   */
  const at = input.subjectAt ?? null;
  const pool = at === null ? input.sales : [...input.sales, ...(input.widerSales ?? [])];
  let area: BandArea = at === null ? 'sector' : 'half-mile';
  let pps = matches(pool, input, at === null ? null : COMPARABLE_RULES.radiusMiles);
  let widened = false;
  if (pps.length < BAND_RULES.minComparables) {
    // Placed: the same one step the ladder takes, half a mile to one mile.
    // Unplaced: the neighbouring sectors, pooled with the subject's own rather
    // than replacing it — replacing it dropped the sales closest to the house.
    const wider = at === null
      ? matches([...input.sales, ...(input.widerSales ?? [])], input, null)
      : matches(pool, input, COMPARABLE_RULES.widen.radiusMiles);
    if (wider.length > pps.length) {
      pps = wider;
      widened = true;
      area = at === null ? 'sectors' : 'wider';
    }
  }
  if (pps.length < BAND_RULES.minComparables) {
    return { kind: 'none', reason: 'too-few', countFound: pps.length, area };
  }

  const sorted = [...pps].sort((a, b) => a - b);
  const low = Math.round(quantile(sorted, 0.25));
  const high = Math.round(quantile(sorted, 0.75));

  // An area holding two different markets: say so rather than average them.
  if (low > 0 && high / low >= BAND_RULES.spreadRatioLimit) {
    return { kind: 'spread', count: sorted.length, widened, area, low, high };
  }

  const subjectPpsqm = Math.round(input.askingPrice / input.floorAreaSqm);
  const position = subjectPpsqm < low ? 'below' : subjectPpsqm > high ? 'above' : 'within';
  return { kind: 'range', count: sorted.length, widened, area, low, high, subjectPpsqm, position };
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
    // C1 — carried through so the band can apply the same half-mile rule as
    // everything else. They were always in the file and always dropped here.
    lat: typeof s.lat === 'number' ? s.lat : null,
    lng: typeof s.lng === 'number' ? s.lng : null,
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
  /** C1 — the month the sold data runs to; see `BandInput.asOf`. */
  asOf?: string | null;
  /** C1 — neighbouring sectors' sales, POOLED with the subject's own. */
  widerSales?: readonly BandSale[] | null;
  /** C1 — the subject's point, so the half-mile rule can be applied. */
  subjectAt?: { lat: number; lng: number } | null;
  now: Date;
}

/**
 * C1 — THE SUBJECT'S POINT, RESOLVED THE ONE WAY, FOR EVERY SURFACE.
 *
 * Both extension surfaces call this rather than each geocoding for itself: two
 * copies of "where is this property" is precisely the shape of fault that put a
 * widened range on the panel and "too few" in the box on the same screen.
 * Failure is null, which the band reports as a sector-wide comparison rather
 * than pretending to a radius it could not apply.
 */
export async function subjectPointFor(
  postcode: string | null | undefined,
): Promise<{ lat: number; lng: number } | null> {
  if (!postcode) return null;
  try {
    const g = await geocodePostcode(postcode);
    return { lat: g.lat, lng: g.lng };
  } catch {
    return null;
  }
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
    subjectAt: input.subjectAt ?? null,
    asOf: input.asOf ?? null,
    now: input.now,
  });
  return { band, areaSqm: area.sqm, areaSource: area.source };
}
