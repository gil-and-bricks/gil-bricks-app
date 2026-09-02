/**
 * Listing enrichment from OUR OWN R2 sector data (E6) — never a portal fetch.
 * Two honest jobs: fill a missing floor area from our EPC-derived sector sales
 * by address match, and turn the sector's typical prices into a real
 * "price vs nearby sold" read (or say there aren't enough sales).
 */
import type { SectorFile } from '../data/types';
import type { ListingAddress } from './types';

// Normalise an address part for comparison: drop apostrophes/quotes, treat other
// punctuation as a separator, collapse whitespace — so "St. Mary's" == "St Marys"
// and a portal/Land-Registry punctuation difference never drops a real match (E8.1).
const norm = (s: string | undefined): string =>
  (s ?? '').toLowerCase().replace(/['’`]+/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** EPC-derived floor area for this exact address from the sector sales, or null.
 * Matches on primary address (paon), the STREET (when both sides have one, so a
 * house number can't match the wrong street), and saon when both have one. */
export function floorAreaFromSector(sector: SectorFile | null | undefined, address: ListingAddress | null | undefined): number | null {
  if (!sector || !address?.paon) return null;
  const paon = norm(address.paon);
  const saon = norm(address.saon) || undefined;
  const street = norm(address.street) || undefined;
  for (const sale of sector.sales) {
    if (sale.floorAreaSqm == null) continue;
    if (norm(sale.paon) !== paon) continue;
    // When both sides name a street, they must agree — paon "6" alone must not
    // match "6 Foo Road" against a sale on "6 Bar Street" in the same sector.
    const saleStreet = norm(sale.street) || undefined;
    if (street && saleStreet && saleStreet !== street) continue;
    const saleSaon = norm(sale.saon) || undefined;
    // saon presence must AGREE — a flat (has saon) must not match a whole-house
    // sale (no saon) at the same paon, and vice versa (would be a different unit).
    if (Boolean(saon) !== Boolean(saleSaon)) continue;
    if (saon && saleSaon !== saon) continue;
    return sale.floorAreaSqm;
  }
  return null;
}

/**
 * Sold-price read statuses. The three "we can't show a read" cases are DISTINCT
 * and mean different things to the user (E8.1):
 *  - not-enough-sales: the area's data loaded, but there are too few sales to judge
 *  - no-area-data: we haven't published sold data for this area yet (a genuine gap)
 *  - load-failed: we couldn't load or parse the data (transient — worth retrying)
 *  - loading: the fetch is still in flight
 */
export type PriceVsSoldStatus =
  | 'green' | 'amber' | 'red'
  | 'not-enough-sales'
  | 'no-area-data'
  | 'load-failed'
  | 'loading'
  | 'no-data'
  | 'outside-evidence';

/** How the sector fetch resolved — threaded in from the caller (extension). */
export type SectorLoad = 'ok' | 'loading' | 'not-found' | 'load-failed';

export interface PriceVsSold {
  status: PriceVsSoldStatus;
  /** IQM sold price for the sector. */
  typicalPrice?: number;
  /** 90th-percentile sold price. */
  p90Price?: number;
  /** IQM £/sqm for the sector (null when no sale has a floor area). */
  typicalPpsqm?: number | null;
  salesCount?: number;
  /** The subject's £/sqm, when a floor area is known. */
  subjectPpsqm?: number | null;
}

/**
 * How the listing's asking (or end) value sits against nearby sold prices.
 * Green ≤ typical, amber ≤ p90, red above. Honest "not-enough-sales" below the
 * configured minimum, "no-data" when the sector couldn't be loaded.
 */
export function priceVsSector(
  value: number | null | undefined,
  sector: SectorFile | null | undefined,
  minSales: number,
  floorAreaSqm?: number | null,
  outsideFactor = 2,
  sectorLoad: SectorLoad = 'ok',
): PriceVsSold {
  if (!sector) {
    // Distinguish "couldn't load" (transient) from "no data for this area yet"
    // (a real gap) from "still loading" — they mean different things (E8.1).
    const status: PriceVsSoldStatus =
      sectorLoad === 'load-failed' ? 'load-failed' : sectorLoad === 'loading' ? 'loading' : 'no-area-data';
    return { status };
  }
  const { count, typicalPrice, p90Price, typicalPpsqm } = sector.stats;
  const subjectPpsqm = value && floorAreaSqm && floorAreaSqm > 0 ? Math.round(value / floorAreaSqm) : null;
  const base = { salesCount: count, typicalPrice, p90Price, typicalPpsqm, subjectPpsqm };
  if (count < minSales) return { status: 'not-enough-sales', ...base };
  // Far above the local evidence (e.g. a £1.5m house in a £469k-ceiling sector):
  // the comparison isn't meaningful, so say so and DON'T score it as a fail.
  if (typeof value === 'number' && value > 0 && value > p90Price * outsideFactor) {
    return { status: 'outside-evidence', ...base };
  }
  let status: PriceVsSoldStatus = 'no-data';
  if (typeof value === 'number' && value > 0) {
    status = value <= typicalPrice ? 'green' : value <= p90Price ? 'amber' : 'red';
  }
  return { status, ...base };
}
