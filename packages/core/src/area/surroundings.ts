/**
 * How this sector compares with the mile around it (A1).
 *
 * The figure used to be worked out in the area page itself — the filter rule,
 * the evidence threshold and the percentage all lived in a component, which is
 * exactly what CLAUDE.md's rule 3 forbids. It is one answer with one home now,
 * and the page only formats what comes back.
 *
 * "Surroundings" means OTHER sectors: a pool containing the sector's own sales
 * dampens the stated difference (verified — 74 of 158 CF37 1HR mile comps were
 * CF37 1's own).
 */
import { computeStats, type Comp } from '../comparables/engine';

export interface SurroundingsInput {
  /** The sector's own typical price, from its precomputed stats. */
  sectorTypicalPrice: number | null;
  /** Every comp from the one-mile sweep — the filtering is this function's job. */
  comps: readonly Comp[];
  /** The sector to leave out, so the pool is genuinely the surroundings. */
  sectorId: string;
  /** Fewest surrounding comps before the comparison is honest. */
  minComps?: number;
}

export interface SurroundingsResult {
  /** Typical price of the surrounding mile; null when the evidence is too thin. */
  typicalPrice: number | null;
  /** Sector vs surroundings, in whole percent. Positive = dearer here. Null = too thin. */
  differencePct: number | null;
  /** How many comps the figure rests on, and from how many sectors. */
  compCount: number;
  sectorCount: number;
}

/** The sector a postcode belongs to, e.g. "CF37 1HR" → "CF37 1". */
export function sectorOfPostcode(postcode: string): string {
  return /^(\S+ \d)/.exec(postcode)?.[1] ?? '';
}

/** The default evidence bar: fewer than this and no difference is stated. */
export const MIN_SURROUNDING_COMPS = 3;

export function surroundings({
  sectorTypicalPrice,
  comps,
  sectorId,
  minComps = MIN_SURROUNDING_COMPS,
}: SurroundingsInput): SurroundingsResult {
  const around = comps.filter((c) => c.included && sectorOfPostcode(c.postcode) !== sectorId);
  const stats = around.length > 0 ? computeStats([...around]) : null;
  const typicalPrice = stats?.typicalPrice ?? null;
  const enough = sectorTypicalPrice !== null && typicalPrice !== null && typicalPrice > 0 && around.length >= minComps;
  return {
    typicalPrice,
    differencePct: enough ? Math.round(((sectorTypicalPrice - typicalPrice) / typicalPrice) * 100) : null,
    compCount: around.length,
    sectorCount: new Set(around.map((c) => sectorOfPostcode(c.postcode))).size,
  };
}
