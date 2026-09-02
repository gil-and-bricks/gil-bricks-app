/**
 * Listing enrichment from OUR OWN R2 sector data (E6) — never a portal fetch.
 * Two honest jobs: fill a missing floor area from our EPC-derived sector sales
 * by address match, and turn the sector's typical prices into a real
 * "price vs nearby sold" read (or say there aren't enough sales).
 */
import type { SectorFile } from '../data/types';
import type { ListingAddress } from './types';

/** EPC-derived floor area for this exact address from the sector sales, or null.
 * Matches on primary address (paon) — and saon too when both sides have one. */
export function floorAreaFromSector(sector: SectorFile | null | undefined, address: ListingAddress | null | undefined): number | null {
  if (!sector || !address?.paon) return null;
  const paon = address.paon.trim().toLowerCase();
  const saon = address.saon?.trim().toLowerCase();
  for (const sale of sector.sales) {
    if (sale.floorAreaSqm == null) continue;
    if (sale.paon.trim().toLowerCase() !== paon) continue;
    const saleSaon = sale.saon?.trim().toLowerCase();
    // saon presence must AGREE — a flat (has saon) must not match a whole-house
    // sale (no saon) at the same paon, and vice versa (would be a different unit).
    if (Boolean(saon) !== Boolean(saleSaon)) continue;
    if (saon && saleSaon !== saon) continue;
    return sale.floorAreaSqm;
  }
  return null;
}

export type PriceVsSoldStatus = 'green' | 'amber' | 'red' | 'not-enough-sales' | 'no-data';

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
): PriceVsSold {
  if (!sector) return { status: 'no-data' };
  const { count, typicalPrice, p90Price, typicalPpsqm } = sector.stats;
  const subjectPpsqm = value && floorAreaSqm && floorAreaSqm > 0 ? Math.round(value / floorAreaSqm) : null;
  if (count < minSales) {
    return { status: 'not-enough-sales', salesCount: count, typicalPrice, p90Price, typicalPpsqm, subjectPpsqm };
  }
  let status: PriceVsSoldStatus = 'no-data';
  if (typeof value === 'number' && value > 0) {
    status = value <= typicalPrice ? 'green' : value <= p90Price ? 'amber' : 'red';
  }
  return { status, salesCount: count, typicalPrice, p90Price, typicalPpsqm, subjectPpsqm };
}
