import { describe, expect, it } from 'vitest';
import { rentalCostDefaults, rentalYield } from './rentalYield';
import { grossYield, netYield } from '../maths/yields';

const DEFAULTS = rentalCostDefaults();

describe('rental yield (T2)', () => {
  it('the sprint case: £120,000 at £750 a month', () => {
    const r = rentalYield({ price: 120_000, monthlyRent: 750, costs: DEFAULTS });
    expect(r.annualRent).toBe(9_000);
    expect(r.gross).toBeCloseTo(7.5, 6);
    // 12% of £9,000 = £1,080; 1% of £120,000 = £1,200; £300; 5/52 of £9,000 = £865.38
    expect(r.lines.management).toBeCloseTo(1_080, 6);
    expect(r.lines.maintenance).toBeCloseTo(1_200, 6);
    expect(r.lines.insurance).toBe(300);
    expect(r.lines.voids).toBeCloseTo(865.3846, 3);
    expect(r.lines.groundRent).toBe(0);
    expect(r.totalCosts).toBeCloseTo(3_445.3846, 3);
    expect(r.net).toBeCloseTo(4.6288, 3);
    // shown: gross 7.5%, net 4.6% — so the printed gap must be 2.9
    expect(r.gap).toBeCloseTo(7.5 - 4.6, 6);
  });

  it('is exactly the locked definitions, not a second formula', () => {
    const r = rentalYield({ price: 200_000, monthlyRent: 1_100, costs: DEFAULTS });
    expect(r.gross).toBeCloseTo(grossYield(13_200, 200_000).value, 9);
    expect(r.net).toBeCloseTo(netYield(13_200, r.totalCosts, 200_000).value, 9);
  });

  it('the gap always adds up on screen, at one decimal place', () => {
    // the sentence a user reads is "gross X, net Y, the Z difference is costs"
    const show = (n: number): number => Math.round(n * 10) / 10;
    for (let price = 60_000; price <= 500_000; price += 1_000) {
      for (const rent of [300, 550, 750, 1_000, 1_450, 2_500]) {
        const r = rentalYield({ price, monthlyRent: rent, costs: DEFAULTS });
        expect(show(r.gap), `${price} @ ${rent}`).toBeCloseTo(show(r.gross) - show(r.net), 6);
      }
    }
  });

  it('zero costs make net equal gross, and the gap zero', () => {
    const none = { managementPct: 0, maintPct: 0, insurance: 0, voidWeeks: 0, groundRent: 0 };
    const r = rentalYield({ price: 100_000, monthlyRent: 500, costs: none });
    expect(r.net).toBeCloseTo(r.gross, 9);
    expect(r.gap).toBeCloseTo(0, 9);
    expect(r.totalCosts).toBe(0);
  });

  it('costs bigger than the rent give a negative net yield rather than a floor', () => {
    const heavy = { managementPct: 12, maintPct: 5, insurance: 2_000, voidWeeks: 26, groundRent: 3_000 };
    const r = rentalYield({ price: 200_000, monthlyRent: 400, costs: heavy });
    expect(r.net).toBeLessThan(0);
    expect(r.gross).toBeGreaterThan(0);
  });

  it('a service charge lands in the total, pound for pound', () => {
    const a = rentalYield({ price: 150_000, monthlyRent: 800, costs: { ...DEFAULTS, groundRent: 0 } });
    const b = rentalYield({ price: 150_000, monthlyRent: 800, costs: { ...DEFAULTS, groundRent: 1_200 } });
    expect(b.totalCosts - a.totalCosts).toBeCloseTo(1_200, 6);
  });

  it('the defaults are the analyser’s own, not invented for the tool', () => {
    expect(DEFAULTS).toEqual({ managementPct: 12, maintPct: 1, insurance: 300, voidWeeks: 5, groundRent: 0 });
  });

  it('refuses impossible inputs instead of printing nonsense', () => {
    expect(() => rentalYield({ price: 0, monthlyRent: 750, costs: DEFAULTS })).toThrow();
    expect(() => rentalYield({ price: 120_000, monthlyRent: -1, costs: DEFAULTS })).toThrow();
    expect(() => rentalYield({ price: 120_000, monthlyRent: 750, costs: { ...DEFAULTS, voidWeeks: 53 } })).toThrow();
  });

  it('the breakdown names both figures and the costs behind them', () => {
    const r = rentalYield({ price: 120_000, monthlyRent: 750, costs: DEFAULTS });
    expect(r.breakdown.formula).toContain('running costs');
    expect(r.breakdown.substituted).toContain('£9,000');
    expect(r.breakdown.result).toContain('gross');
  });
});
