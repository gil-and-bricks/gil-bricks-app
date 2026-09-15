/**
 * X1 — which sectors the price comparison may widen into.
 */
import { describe, expect, it } from 'vitest';
import { nearestSectors, NEARBY_RULES } from './nearby';
import type { SectorsIndexEntry } from '../data/types';

const at = (sectorId: string, lat: number, lng: number, extra: Partial<SectorsIndexEntry> = {}): SectorsIndexEntry => ({
  sectorId, lat, lng, country: 'E92000001', salesCount: 50, spanMiles: 0.5, ...extra,
});

// A subject at the origin, with neighbours at increasing distance.
const INDEX: SectorsIndexEntry[] = [
  at('SA1 6', 51.62, -3.94),
  at('SA1 2', 51.63, -3.94),   // nearest
  at('SA1 8', 51.65, -3.94),
  at('SA2 0', 51.70, -3.94),
  at('SA5 8', 51.80, -3.94),   // farthest
];

describe('nearestSectors', () => {
  it('returns neighbours nearest first, by centroid and not by sector id', () => {
    expect(nearestSectors(INDEX, 'SA1 6')).toEqual(['SA1 2', 'SA1 8', 'SA2 0', 'SA5 8']);
  });

  it('never includes the subject sector itself', () => {
    expect(nearestSectors(INDEX, 'SA1 6')).not.toContain('SA1 6');
  });

  /** A band drawn across the border would compare two tax regimes and two markets. */
  it('never crosses the England–Wales border', () => {
    const mixed = [...INDEX, at('CF10 1', 51.621, -3.941, { country: 'W92000004' })];
    expect(nearestSectors(mixed, 'SA1 6')).not.toContain('CF10 1');
    // …and it really was the nearest one, so it was excluded on country, not distance.
    expect(nearestSectors(mixed, 'SA1 6')[0]).toBe('SA1 2');
  });

  it('drops sectors with no sales — they cost a fetch and can contribute nothing', () => {
    const withEmpty = [...INDEX, at('SA1 4', 51.6201, -3.9401, { salesCount: 0 })];
    expect(nearestSectors(withEmpty, 'SA1 6')).not.toContain('SA1 4');
  });

  it('caps how many it will pull in, because each one is a fetch', () => {
    const many = [at('SA1 6', 51.62, -3.94)];
    for (let i = 0; i < 40; i += 1) many.push(at(`SA${i + 10} 1`, 51.62 + (i + 1) / 100, -3.94));
    expect(nearestSectors(many, 'SA1 6')).toHaveLength(NEARBY_RULES.maxSectors);
    expect(nearestSectors(many, 'SA1 6', 3)).toHaveLength(3);
  });

  it('is empty when the subject is not in the index at all', () => {
    expect(nearestSectors(INDEX, 'ZZ9 9')).toEqual([]);
  });

  it('matches the subject regardless of spacing or case', () => {
    expect(nearestSectors(INDEX, 'sa1  6')).toEqual(nearestSectors(INDEX, 'SA1 6'));
  });
});
