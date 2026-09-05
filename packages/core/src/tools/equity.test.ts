import { describe, expect, it } from 'vitest';
import { equityFromHpi } from './equity';

/**
 * Three worked examples, checked by hand. The index readings are real UK HPI
 * values from the file the app ships (England E92000001, Wales W92000004).
 */
describe('equity from the house price index (T1)', () => {
  it('England, bought June 2015 at £180,000, owes £95,000', () => {
    // England index (the file we ship): 2015-06 = 69.3, 2026-06 = 102.6
    const r = equityFromHpi({ paid: 180000, owed: 95000, indexThen: 69.3, indexNow: 102.6 });
    expect(r.multiplier).toBeCloseTo(102.6 / 69.3, 10);
    // by hand: 102.6 ÷ 69.3 = 1.480519…; × £180,000 = £266,493.5…
    expect(Math.round(r.value)).toBe(266494);
    expect(Math.round(r.equity)).toBe(171494);         // 266,494 − 95,000
    expect(Math.round(r.ltv * 10) / 10).toBe(35.6);    // 95,000 ÷ 266,493.5
  });

  it('Wales, bought March 2019 at £145,000, owes £120,000', () => {
    // Wales index (the file we ship): 2019-03 = 75, 2026-06 = 105.6
    const r = equityFromHpi({ paid: 145000, owed: 120000, indexThen: 75, indexNow: 105.6 });
    // by hand: 105.6 ÷ 75 = 1.408; × £145,000 = £204,160
    expect(Math.round(r.value)).toBe(204160);
    expect(Math.round(r.equity)).toBe(84160);
    expect(Math.round(r.ltv * 10) / 10).toBe(58.8);
  });

  it('owned outright: no loan, all equity, LTV zero', () => {
    const r = equityFromHpi({ paid: 250000, owed: 0, indexThen: 100, indexNow: 110 });
    expect(r.value).toBe(275000);
    expect(r.equity).toBe(275000);
    expect(r.ltv).toBe(0);
  });

  it('a falling index is reported honestly, including negative equity', () => {
    const r = equityFromHpi({ paid: 200000, owed: 190000, indexThen: 110, indexNow: 99 });
    expect(r.value).toBe(180000);
    expect(r.equity).toBe(-10000);
    expect(r.ltv).toBeGreaterThan(100);
  });

  it('shows its working, in the same shape every other figure uses', () => {
    const r = equityFromHpi({ paid: 180000, owed: 95000, indexThen: 69.3, indexNow: 102.6 });
    expect(r.breakdown.formula).toContain('index now');
    expect(r.breakdown.substituted).toContain('£180,000');
    expect(r.breakdown.substituted).toContain('102.6');
    expect(r.breakdown.result).toContain('£171,494');
    expect(r.breakdown.note.toLowerCase()).toContain('not a valuation');
  });

  it('refuses nonsense rather than inventing an answer', () => {
    expect(() => equityFromHpi({ paid: 0, owed: 0, indexThen: 100, indexNow: 110 })).toThrow();
    expect(() => equityFromHpi({ paid: 100000, owed: -1, indexThen: 100, indexNow: 110 })).toThrow();
    expect(() => equityFromHpi({ paid: 100000, owed: 0, indexThen: 0, indexNow: 110 })).toThrow();
  });
});
