/**
 * X1 — the four figures, and the refusals that matter more than the arithmetic.
 */
import { describe, expect, it } from 'vitest';
import { triageNumbers } from './numbers';

const BASE = { country: 'E92000001' as const, depositPct: 25, legals: 1500, date: '2026-09-15' };

describe('triageNumbers', () => {
  it('gives price per square metre from the price and the area', () => {
    const n = triageNumbers({ ...BASE, askingPrice: 164_000, floorAreaSqm: 82 });
    expect(n.ppsqm).toBe(2000);
  });

  it('refuses a £/m² when the listing has no floor area — never an invented one', () => {
    const n = triageNumbers({ ...BASE, askingPrice: 164_000, floorAreaSqm: null });
    expect(n.ppsqm).toBeNull();
    expect(n.askingPrice).toBe(164_000); // the rest still stands
  });

  it('refuses EVERY figure when there is no asking price, rather than a partial total', () => {
    const n = triageNumbers({ ...BASE, askingPrice: null, floorAreaSqm: 82 });
    expect(n.askingPrice).toBeNull();
    expect(n.purchaseTax).toBeNull();
    expect(n.cashNeeded).toBeNull();
    expect(n.ppsqm).toBeNull();
  });

  it('a zero or negative price is no price at all', () => {
    for (const p of [0, -1]) {
      expect(triageNumbers({ ...BASE, askingPrice: p, floorAreaSqm: 82 }).cashNeeded).toBeNull();
    }
  });

  /**
   * THE SURCHARGE IS THE POINT. An investor tool quoting the owner-occupier rate
   * understates the cash needed by thousands — so this asserts the additional
   * rate is actually being used, by comparing against the standard bill.
   */
  it('taxes at the ADDITIONAL-property rate, not the standard one', () => {
    const n = triageNumbers({ ...BASE, askingPrice: 300_000, floorAreaSqm: 100 });
    // England standard on £300k is £2,500 (nil to £250k, then 5%). The
    // additional-property table adds 5% to EVERY band: £12,500 on the first
    // £250k and £5,000 on the next £50k — £17,500 of surcharge, £20,000 in all.
    expect(n.purchaseTax).toBeGreaterThan(2_500);
    expect(n.purchaseTax).toBe(20_000);
  });

  it('cash needed is deposit + tax + legals, and nothing else', () => {
    const n = triageNumbers({ ...BASE, askingPrice: 300_000, floorAreaSqm: 100 });
    expect(n.cashNeeded).toBe(75_000 + 20_000 + 1_500);
  });

  it('a Welsh postcode is taxed under LTT and flagged as Wales', () => {
    const e = triageNumbers({ ...BASE, askingPrice: 300_000, floorAreaSqm: 100 });
    const w = triageNumbers({ ...BASE, country: 'W92000004', askingPrice: 300_000, floorAreaSqm: 100 });
    expect(w.isWales).toBe(true);
    expect(e.isWales).toBe(false);
    // Welsh higher rates are a standalone table — the two must not agree by accident.
    expect(w.purchaseTax).not.toBe(e.purchaseTax);
  });

  it('carries the deposit percentage it used, so the panel can state the assumption', () => {
    expect(triageNumbers({ ...BASE, depositPct: 30, askingPrice: 200_000, floorAreaSqm: 80 }).depositPct).toBe(30);
  });

  /** No ratio that could read as a verdict may appear on this object. */
  it('returns no score, rating, verdict or yield', () => {
    const n = triageNumbers({ ...BASE, askingPrice: 164_000, floorAreaSqm: 82 }) as unknown as Record<string, unknown>;
    for (const forbidden of ['score', 'verdict', 'rating', 'yield', 'roi', 'grade']) {
      expect(Object.keys(n).map((k) => k.toLowerCase())).not.toContain(forbidden);
    }
  });
});
