/**
 * X1 — WHICH SECTORS COUNT AS "THE WIDER AREA".
 *
 * `priceBand` refuses to draw a range from fewer than five comparable sales, and
 * widens once when the subject's own postcode sector cannot reach five. This is
 * the part that decides WHERE it widens to.
 *
 * NEAREST BY CENTROID, NOT ALPHABETICAL. SA1 2 and SA1 8 share an outward code
 * and can be a mile apart across a river; the sector index carries every
 * sector's centroid, so proximity is measurable rather than assumed. Sorting by
 * sector id instead would have picked neighbours by the accident of their
 * numbering.
 *
 * SAME COUNTRY ONLY. England and Wales tax differently and price differently,
 * and a band drawn across the border would compare two markets.
 *
 * CAPPED, because each sector is a network fetch and this runs in a panel that
 * is meant to answer in seconds. Eight is enough to clear the five-sale bar
 * almost everywhere without turning a triage tool into a download.
 */
import type { SectorsIndexEntry } from '../data/types';

export const NEARBY_RULES = {
  /** How many neighbouring sectors may be pulled in to widen the comparison. */
  maxSectors: 8,
} as const;

/** Great-circle distance in miles — small enough here that the haversine is overkill, but it is cheap and correct. */
function milesBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The nearest sectors to the subject's own, nearest first, excluding the subject
 * and anything in a different country. Sectors with no sales are dropped: they
 * cost a fetch and can never contribute a comparable.
 */
export function nearestSectors(
  index: readonly SectorsIndexEntry[],
  subjectSectorId: string,
  max: number = NEARBY_RULES.maxSectors,
): string[] {
  const norm = (s: string): string => s.trim().toUpperCase().replace(/\s+/g, ' ');
  const subject = index.find((e) => norm(e.sectorId) === norm(subjectSectorId));
  if (!subject) return [];
  return index
    .filter((e) => norm(e.sectorId) !== norm(subjectSectorId))
    .filter((e) => e.country === subject.country)
    .filter((e) => e.salesCount > 0)
    .map((e) => ({ id: e.sectorId, d: milesBetween(subject.lat, subject.lng, e.lat, e.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.max(0, max))
    .map((e) => e.id);
}
