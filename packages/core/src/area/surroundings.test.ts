import { describe, expect, it } from 'vitest';
import { sectorOfPostcode, surroundings } from './surroundings';
import type { Comp } from '../comparables/engine';

const comp = (postcode: string, price: number): Comp =>
  ({ id: `${postcode}-${price}`, postcode, price, ppsqm: null, included: true } as unknown as Comp);

describe('the surrounding mile (A1) — one home for the comparison the area page shows', () => {
  it('reads the sector off a postcode', () => {
    expect(sectorOfPostcode('CF37 1HR')).toBe('CF37 1');
    expect(sectorOfPostcode('SA1 6HW')).toBe('SA1 6');
    expect(sectorOfPostcode('nonsense')).toBe('');
  });

  it('leaves the sector out of its own surroundings', () => {
    const comps = [comp('CF37 1HR', 100_000), comp('CF37 1AB', 100_000), comp('CF37 2AA', 200_000), comp('CF37 3AA', 200_000), comp('CF37 4AA', 200_000)];
    const r = surroundings({ sectorTypicalPrice: 100_000, comps, sectorId: 'CF37 1' });
    expect(r.compCount).toBe(3);
    expect(r.sectorCount).toBe(3);
    expect(r.typicalPrice).toBe(200_000);
    expect(r.differencePct).toBe(-50);
  });

  it('states no difference on thin evidence rather than a shaky one', () => {
    const comps = [comp('CF37 2AA', 200_000), comp('CF37 3AA', 200_000)];
    const r = surroundings({ sectorTypicalPrice: 100_000, comps, sectorId: 'CF37 1' });
    expect(r.compCount).toBe(2);
    expect(r.differencePct).toBeNull();
  });

  it('ignores comps the reader has excluded', () => {
    const comps = [comp('CF37 2AA', 200_000), comp('CF37 3AA', 200_000), { ...comp('CF37 4AA', 900_000), included: false }];
    const r = surroundings({ sectorTypicalPrice: 100_000, comps, sectorId: 'CF37 1', minComps: 2 });
    expect(r.compCount).toBe(2);
    expect(r.typicalPrice).toBe(200_000);
  });
});
