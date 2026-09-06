/**
 * D4 — the valuation's own evidence is about a different kind of home. This is
 * the check behind "This sector is mostly terraced houses. A flat here typically
 * sells for around £151,613."
 */
import { describe, expect, it } from 'vitest';
import { dominantTypeOf, typeMismatch } from './typeMismatch';

const OPTS = { cautionRatio: 1.4, demoteRatio: 2, dominantShare: 0.7 };
const sales = (d: number, s: number, t: number, f: number) => [
  ...Array(d).fill({ type: 'D' }), ...Array(s).fill({ type: 'S' }),
  ...Array(t).fill({ type: 'T' }), ...Array(f).fill({ type: 'F' }),
];

describe('what a sector is mostly made of', () => {
  it('calls a house-dominated sector houses, however the house types split', () => {
    expect(dominantTypeOf(sales(5, 10, 60, 5), OPTS.dominantShare)).toBe('houses');
    // the D4 review's case: NO single house type is a majority, but houses are
    expect(dominantTypeOf(sales(30, 25, 25, 20), OPTS.dominantShare)).toBe('houses');
  });
  it('calls a flat-dominated sector flats', () => {
    expect(dominantTypeOf(sales(2, 2, 2, 60), OPTS.dominantShare)).toBe('flats');
  });
  it('says nothing about a genuinely mixed sector, or with no sales at all', () => {
    expect(dominantTypeOf(sales(10, 10, 10, 40), OPTS.dominantShare)).toBeNull();
    expect(dominantTypeOf([], OPTS.dominantShare)).toBeNull();
    expect(dominantTypeOf(null, OPTS.dominantShare)).toBeNull();
  });
});

describe('when the estimate is about the wrong kind of home', () => {
  const byType = { D: 320000, S: 240000, T: 180000, F: 151613 };

  it('says nothing when the estimate sits where this type actually sells', () => {
    expect(typeMismatch({ subjectType: 'F', byType, estimate: 160000 }, OPTS)).toBeNull();
    expect(typeMismatch({ subjectType: 'T', byType, estimate: 190000 }, OPTS)).toBeNull();
  });

  it('cautions past the caution ratio, and DEMOTES past the demote ratio', () => {
    expect(typeMismatch({ subjectType: 'F', byType, estimate: 220000 }, OPTS)!.level).toBe('caution');
    const demoted = typeMismatch({ subjectType: 'F', byType, estimate: 344520 }, OPTS)!;
    expect(demoted.level).toBe('demote');
    expect(demoted.typicalForType).toBe(151613);
    expect(demoted.ratio).toBeCloseTo(2.27, 1);
  });

  it('names the mismatch only when the sector really is mostly something else', () => {
    const flatInHouses = typeMismatch({ subjectType: 'F', byType, estimate: 344520, dominantType: 'houses' }, OPTS)!;
    expect(flatInHouses.differentType).toBe(true);
    const houseInHouses = typeMismatch({ subjectType: 'T', byType, estimate: 400000, dominantType: 'houses' }, OPTS)!;
    expect(houseInHouses.differentType, 'a terrace in a house sector is not a mismatch').toBe(false);
    const semiInHouses = typeMismatch({ subjectType: 'S', byType, estimate: 400000, dominantType: 'houses' }, OPTS)!;
    expect(semiInHouses.differentType, 'nor is a semi').toBe(false);
  });

  it('flags a type the sector has never priced, when its evidence is about another kind', () => {
    const m = typeMismatch({ subjectType: 'F', byType: { D: 320000, S: 240000, T: 180000, F: null }, estimate: 200000, dominantType: 'houses' }, OPTS)!;
    expect(m.level).toBe('caution');
    expect(m.typicalForType).toBe(0);
  });

  it('stays silent when this type is unpriced but the sector is its OWN kind — thin, not mismatched', () => {
    // a terrace in a house sector with too few terrace sales to price: the
    // valuation's own confidence line covers thinness; a "wrong kind of home"
    // caveat here would contradict itself (D4 review)
    expect(typeMismatch({ subjectType: 'T', byType: { D: 320000, S: 240000, T: null, F: 150000 }, estimate: 400000, dominantType: 'houses' }, OPTS)).toBeNull();
  });

  it('never speaks without a type, without data, or without an estimate', () => {
    expect(typeMismatch({ subjectType: null, byType, estimate: 344520 }, OPTS)).toBeNull();
    expect(typeMismatch({ subjectType: 'F', byType: null, estimate: 344520 }, OPTS)).toBeNull();
    expect(typeMismatch({ subjectType: 'F', byType, estimate: null }, OPTS)).toBeNull();
  });
});
