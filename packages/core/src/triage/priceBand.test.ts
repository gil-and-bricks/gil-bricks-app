/**
 * X1 — the price comparison's rules, each tested in both directions.
 *
 * The rules exist because the alternative misleads somebody, so a rule that
 * cannot be shown to fire is not a rule. Every threshold here is exercised on
 * each side of its boundary.
 */
import { describe, expect, it } from 'vitest';
import { BAND_RULES, priceBand, type BandSale } from './priceBand';

const NOW = new Date('2026-09-15T00:00:00Z');
/** n comparable sales: same type, in the band, recent, at a given £/m². */
const comps = (n: number, ppsqm: number, over: Partial<BandSale> = {}): BandSale[] =>
  Array.from({ length: n }, (_, i) => ({
    date: '2025-06-01', type: 'T', floorAreaSqm: 80,
    price: ppsqm * 80, ppsqm: ppsqm + i, ...over,
  }));

const subject = { type: 'T', floorAreaSqm: 80, askingPrice: 160_000, now: NOW };

describe('the price comparison', () => {
  it('needs a floor area at all — without one there is no £/m²', () => {
    const r = priceBand({ ...subject, floorAreaSqm: 0, sales: comps(20, 2000) });
    expect(r.kind).toBe('none');
    expect(r.kind === 'none' && r.reason).toBe('no-area');
  });

  it('REFUSES to draw a comparison below five comparables', () => {
    const r = priceBand({ ...subject, sales: comps(4, 2000) });
    expect(r.kind).toBe('none');
    expect(r.kind === 'none' && r.reason).toBe('too-few');
    expect(r.kind === 'none' && r.countFound).toBe(4);
  });

  it('and draws one at exactly five — the boundary is where it is stated', () => {
    expect(priceBand({ ...subject, sales: comps(5, 2000) }).kind).toBe('range');
    expect(BAND_RULES.minComparables).toBe(5);
  });

  it('widens to the wider area ONLY when the sector cannot reach five, and says so', () => {
    const r = priceBand({ ...subject, sales: comps(3, 2000), widerSales: comps(12, 2000) });
    expect(r.kind).toBe('range');
    expect(r.kind === 'range' && r.widened).toBe(true);
    expect(r.kind === 'range' && r.count).toBe(12);
  });

  it('does NOT widen when the sector has enough of its own', () => {
    const r = priceBand({ ...subject, sales: comps(9, 2000), widerSales: comps(50, 9999) });
    expect(r.kind === 'range' && r.widened).toBe(false);
    expect(r.kind === 'range' && r.count).toBe(9);
  });

  it('matches on TYPE — a detached house is not a comparable for a terrace', () => {
    const r = priceBand({ ...subject, sales: comps(20, 2000, { type: 'D' }) });
    expect(r.kind).toBe('none');
  });

  it('matches on a SIZE BAND — £/m² is not flat across sizes', () => {
    // 80sqm subject, ±20% → 64–96. A 130sqm house is out.
    const out = comps(20, 2000, { floorAreaSqm: 130 });
    expect(priceBand({ ...subject, sales: out }).kind).toBe('none');
    const edgeIn = comps(6, 2000, { floorAreaSqm: 96 });
    expect(priceBand({ ...subject, sales: edgeIn }).kind).toBe('range');
    const edgeOut = comps(6, 2000, { floorAreaSqm: 97 });
    expect(priceBand({ ...subject, sales: edgeOut }).kind).toBe('none');
  });

  it('ignores sales older than the window — that is a different market', () => {
    const old = comps(20, 2000, { date: '2021-01-01' });
    expect(priceBand({ ...subject, sales: old }).kind).toBe('none');
    const justInside = comps(6, 2000, { date: '2023-10-01' });
    expect(priceBand({ ...subject, sales: justInside }).kind).toBe('range');
  });

  it('SAYS THE SPREAD IS TOO WIDE rather than averaging two different markets', () => {
    /**
     * A sector holding ex-council terraces at £900/m² and renovated townhouses
     * at £2,600/m² has no "typical" figure. Printing one describes no actual
     * house and would be the most confidently wrong thing on the panel.
     */
    const mixed: BandSale[] = [
      ...comps(6, 900), ...comps(6, 2600),
    ];
    const r = priceBand({ ...subject, sales: mixed });
    expect(r.kind).toBe('spread');
    expect(r.kind === 'spread' && r.high / r.low).toBeGreaterThanOrEqual(BAND_RULES.spreadRatioLimit);
  });

  it('places the subject WITHIN, ABOVE or BELOW — a position, never a judgement', () => {
    const sales = comps(20, 2000);
    const within = priceBand({ ...subject, askingPrice: 2010 * 80, sales });
    expect(within.kind === 'range' && within.position).toBe('within');
    const above = priceBand({ ...subject, askingPrice: 4000 * 80, sales });
    expect(above.kind === 'range' && above.position).toBe('above');
    const below = priceBand({ ...subject, askingPrice: 500 * 80, sales });
    expect(below.kind === 'range' && below.position).toBe('below');
  });

  it('returns a RANGE and a COUNT, never a single figure', () => {
    const r = priceBand({ ...subject, sales: comps(20, 2000) });
    expect(r.kind).toBe('range');
    if (r.kind !== 'range') return;
    expect(r.low).toBeLessThan(r.high);
    expect(r.count).toBe(20);
    // There is no field anywhere that could be printed as "the" value.
    expect(Object.keys(r)).not.toContain('typical');
    expect(Object.keys(r)).not.toContain('average');
  });

  it('falls back to price ÷ area when a sale carries no ppsqm of its own', () => {
    const noPps = comps(8, 2000).map((s) => ({ ...s, ppsqm: null }));
    const r = priceBand({ ...subject, sales: noPps });
    expect(r.kind).toBe('range');
    expect(r.kind === 'range' && r.low).toBeGreaterThan(1900);
  });

  it('carries no adjective anywhere in its output', () => {
    // The module must be incapable of producing an endorsement. Serialised so a
    // nested field cannot hide one.
    const all = JSON.stringify([
      priceBand({ ...subject, sales: comps(20, 2000) }),
      priceBand({ ...subject, sales: comps(2, 2000) }),
      priceBand({ ...subject, sales: [...comps(6, 900), ...comps(6, 2600)] }),
    ]);
    expect(all).not.toMatch(/good|great|bargain|safe|opportunity|value|deal/i);
  });
});
