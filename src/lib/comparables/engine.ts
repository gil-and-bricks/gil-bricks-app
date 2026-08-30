/**
 * The ONE ComparablesEngine (CLAUDE.md golden rule 3). Pure orchestration
 * over the data client: geocode the subject, pick candidate sectors from
 * sectors-index (centroid distance ≤ radius + that sector's own spanMiles,
 * which covers both its live postcodes AND its window sales — so a sale at
 * a terminated postcode can never be silently missed), fetch, filter, measure.
 *
 * Radius is HARD-CAPPED at 1 mile and never auto-widened: thin results get
 * an honest empty state with a suggestion instead of quietly casting wider.
 */
import { getManifest, getSector, getSectorsIndex } from '../data/client';
import type { Sale } from '../data/types';
import { iqm, percentile } from '../maths/stats';
import { ComparablesError } from './errors';
import { distanceMiles } from './geo';
import { geocodePostcode, type GeocodedPostcode } from './geocode';
import { compLinks, type CompLinks } from './links';

export type RadiusMiles = 0.25 | 0.5 | 1;
export type PeriodMonths = 6 | 12;
export type PropertyTypeFilter = 'D' | 'S' | 'DS' | 'T' | 'houses' | 'F' | 'all';
export type TenureFilter = 'any' | 'F' | 'L';
export type AgeFilter = 'all' | 'new' | 'old';

export const MAX_RADIUS_MILES = 1;

export interface ComparablesInput {
  postcode: string;
  radiusMiles: RadiusMiles;
  periodMonths: PeriodMonths;
  propertyType: PropertyTypeFilter;
  tenure: TenureFilter;
  age: AgeFilter;
  minAreaSqm?: number;
  maxAreaSqm?: number;
  minPrice?: number;
  maxPrice?: number;
  excludedIds?: string[];
}

export interface Comp extends Sale {
  distanceMiles: number;
  included: boolean;
  links: CompLinks;
}

export interface CompStats {
  count: number;
  typicalPrice: number | null;
  /** null when fewer than 3 included comps carry a ppsqm. */
  typicalPpsqm: number | null;
  rangeP10P90: { p10: number; p90: number } | null;
  /** % of included comps with a known floor area (so £/sqft is meaningful). */
  sqftCoveragePct: number | null;
}

export interface ComparablesResult {
  subject: GeocodedPostcode;
  comps: Comp[];
  stats: CompStats;
  sectorsSearched: string[];
  /** Data as-of month (manifest ppdMonth) — the period counts back from here. */
  asOf: string;
  /** Present only when there are zero matching comps. */
  suggestion?: string;
}

const TYPE_SETS: Record<PropertyTypeFilter, Set<string> | null> = {
  D: new Set(['D']),
  S: new Set(['S']),
  DS: new Set(['D', 'S']),
  T: new Set(['T']),
  houses: new Set(['D', 'S', 'T']),
  F: new Set(['F']),
  all: null,
};

/** First day of the period: `months` full months ending at asOf (yyyy-mm). */
export function periodStart(asOf: string, months: PeriodMonths): string {
  const [y, m] = asOf.split('-').map(Number);
  const total = y * 12 + (m - 1) - (months - 1);
  const sy = Math.floor(total / 12);
  const sm = (total % 12) + 1;
  return `${sy}-${String(sm).padStart(2, '0')}-01`;
}

function matchesFilters(sale: Sale, input: ComparablesInput): boolean {
  const typeSet = TYPE_SETS[input.propertyType];
  if (typeSet !== null && !typeSet.has(sale.type)) return false;
  if (input.tenure !== 'any' && sale.tenure !== input.tenure) return false;
  if (input.age === 'new' && !sale.newBuild) return false;
  if (input.age === 'old' && sale.newBuild) return false;
  // Area bounds only make sense against a KNOWN area — comps without one
  // can't be verified, so they are excluded when bounds are set.
  if (input.minAreaSqm !== undefined && (sale.floorAreaSqm === null || sale.floorAreaSqm < input.minAreaSqm)) return false;
  if (input.maxAreaSqm !== undefined && (sale.floorAreaSqm === null || sale.floorAreaSqm > input.maxAreaSqm)) return false;
  if (input.minPrice !== undefined && sale.price < input.minPrice) return false;
  if (input.maxPrice !== undefined && sale.price > input.maxPrice) return false;
  return true;
}

/** Stats over the INCLUDED comps only — exclusions recalculate live. */
export function computeStats(comps: Comp[]): CompStats {
  const included = comps.filter((c) => c.included);
  if (included.length === 0) {
    return { count: 0, typicalPrice: null, typicalPpsqm: null, rangeP10P90: null, sqftCoveragePct: null };
  }
  const prices = included.map((c) => c.price);
  const ppsqms = included.filter((c) => c.ppsqm !== null).map((c) => c.ppsqm as number);
  return {
    count: included.length,
    typicalPrice: iqm(prices),
    typicalPpsqm: ppsqms.length >= 3 ? iqm(ppsqms) : null,
    rangeP10P90: { p10: percentile(prices, 0.1), p90: percentile(prices, 0.9) },
    sqftCoveragePct: Math.round((ppsqms.length / included.length) * 100),
  };
}

export async function findComparables(input: ComparablesInput): Promise<ComparablesResult> {
  if (input.radiusMiles > MAX_RADIUS_MILES) {
    throw new ComparablesError('BadInput', `Radius is capped at ${MAX_RADIUS_MILES} mile`);
  }
  if (![0.25, 0.5, 1].includes(input.radiusMiles)) {
    throw new ComparablesError('BadInput', `radiusMiles must be 0.25, 0.5 or 1 (got ${String(input.radiusMiles)})`);
  }
  if (![6, 12].includes(input.periodMonths)) {
    throw new ComparablesError('BadInput', `periodMonths must be 6 or 12 (got ${String(input.periodMonths)})`);
  }
  if (!(input.propertyType in TYPE_SETS)) {
    throw new ComparablesError('BadInput', `propertyType must be D, S, DS, T, houses, F or all (got ${String(input.propertyType)})`);
  }
  if (!['any', 'F', 'L'].includes(input.tenure)) {
    throw new ComparablesError('BadInput', `tenure must be any, F or L (got ${String(input.tenure)})`);
  }
  if (!['all', 'new', 'old'].includes(input.age)) {
    throw new ComparablesError('BadInput', `age must be all, new or old (got ${String(input.age)})`);
  }

  const [subject, index, manifest] = await Promise.all([
    geocodePostcode(input.postcode),
    getSectorsIndex(),
    getManifest(),
  ]);

  const candidates = index.filter(
    (s) => distanceMiles(subject.lat, subject.lng, s.lat, s.lng) <= input.radiusMiles + s.spanMiles,
  );

  // All-or-nothing: partial results would silently understate the evidence.
  let sectorFiles;
  try {
    sectorFiles = await Promise.all(candidates.map((c) => getSector(c.sectorId)));
  } catch (err) {
    throw new ComparablesError(
      'DataUnavailable',
      `Could not load all the sales data for this search — please try again shortly (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  const start = periodStart(manifest.ppdMonth, input.periodMonths);
  const excluded = new Set(input.excludedIds ?? []);
  const comps: Comp[] = [];
  for (const file of sectorFiles) {
    for (const sale of file.sales) {
      if (sale.date < start) continue;
      const d = distanceMiles(subject.lat, subject.lng, sale.lat, sale.lng);
      if (d > input.radiusMiles) continue;
      if (!matchesFilters(sale, input)) continue;
      comps.push({
        ...sale,
        distanceMiles: Math.round(d * 100) / 100,
        included: !excluded.has(sale.id),
        links: compLinks(sale.id),
      });
    }
  }
  comps.sort((a, b) => a.distanceMiles - b.distanceMiles || a.id.localeCompare(b.id));

  const result: ComparablesResult = {
    subject,
    comps,
    stats: computeStats(comps),
    sectorsSearched: candidates.map((c) => c.sectorId).sort(),
    asOf: manifest.ppdMonth,
  };
  if (comps.length === 0) {
    const widenables: string[] = [];
    if (input.radiusMiles < MAX_RADIUS_MILES) widenables.push('widening the radius');
    if (input.periodMonths < 12) widenables.push('looking back 12 months');
    const boundsSet =
      input.minPrice !== undefined || input.maxPrice !== undefined ||
      input.minAreaSqm !== undefined || input.maxAreaSqm !== undefined;
    if (input.propertyType !== 'all' || input.tenure !== 'any' || input.age !== 'all' || boundsSet) widenables.push('relaxing the filters');
    result.suggestion =
      widenables.length > 0
        ? `No sales found — try ${widenables.join(' or ')}.`
        : 'No sales found within a mile in the last 12 months — this area has very little price evidence.';
  }
  return result;
}

export type SortKey = 'distance' | 'date' | 'price' | 'ppsqm';

/** Pure sort helper — returns a new array; nulls (ppsqm) always sort last. */
export function sortComps(comps: Comp[], key: SortKey, direction: 'asc' | 'desc' = 'asc'): Comp[] {
  const dir = direction === 'asc' ? 1 : -1;
  const val = (c: Comp): number | string | null =>
    key === 'distance' ? c.distanceMiles : key === 'date' ? c.date : key === 'price' ? c.price : c.ppsqm;
  return [...comps].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return va < vb ? -dir : va > vb ? dir : 0;
  });
}
