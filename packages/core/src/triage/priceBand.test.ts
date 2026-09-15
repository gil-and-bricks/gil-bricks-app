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
    date: '2026-06-01', type: 'T', floorAreaSqm: 80,
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

  /**
   * C1 — THE WIDENED SET IS A SUPERSET, WHICH IT WAS NOT.
   *
   * It used to REPLACE the subject's own sector with the neighbours', so a
   * widened band was built entirely out of surrounding sales and left out the
   * ones closest to the property. Three plus twelve is fifteen; it read twelve.
   */
  it('widens to the wider area ONLY when the sector cannot reach five, and says so', () => {
    const r = priceBand({ ...subject, sales: comps(3, 2000), widerSales: comps(12, 2000) });
    expect(r.kind).toBe('range');
    expect(r.kind === 'range' && r.widened).toBe(true);
    expect(r.kind === 'range' && r.count, 'the subject’s own three are still in it').toBe(15);
    // Unplaced subject: no circle can be drawn, so the area is NAMED as the
    // sectors rather than quietly called half a mile.
    expect(r.kind === 'range' && r.area).toBe('sectors');
  });

  it('does NOT widen when the sector has enough of its own', () => {
    const r = priceBand({ ...subject, sales: comps(9, 2000), widerSales: comps(50, 9999) });
    expect(r.kind === 'range' && r.widened).toBe(false);
    expect(r.kind === 'range' && r.count).toBe(9);
  });

  /**
   * C1 — THE SAME HALF MILE AS EVERY OTHER SURFACE, exercised on both sides of
   * the line. The band used to compare against a whole postcode sector, which
   * in a city is a mile across and in the country very much more.
   */
  describe('the area it compares against', () => {
    const AT = { lat: 51.6014, lng: -3.3405 };
    /** ~0.35 miles north: inside half a mile. */
    const NEAR = { lat: AT.lat + 0.005, lng: AT.lng };
    /** ~0.69 miles north: outside half a mile, inside one mile. */
    const FAR = { lat: AT.lat + 0.01, lng: AT.lng };

    it('counts a sale inside half a mile', () => {
      const r = priceBand({ ...subject, subjectAt: AT, sales: comps(6, 2000, NEAR) });
      expect(r.kind).toBe('range');
      expect(r.kind === 'range' && r.area).toBe('half-mile');
    });

    /**
     * The other side of the same line, isolated from the widening step: five
     * near sales already clear the bar, so the far ones are left out because
     * they are FAR and not because nothing else was available.
     */
    it('and leaves out one outside it, while the near ones already suffice', () => {
      const r = priceBand({
        ...subject, subjectAt: AT,
        sales: [...comps(5, 2000, NEAR), ...comps(6, 9999, FAR)],
      });
      expect(r.kind).toBe('range');
      expect(r.kind === 'range' && r.count, 'only the five inside half a mile').toBe(5);
      expect(r.kind === 'range' && r.area).toBe('half-mile');
      // …and the far ones were not merely outvoted: at £9,999/m² they would
      // have moved the range beyond recognition had they been counted.
      expect(r.kind === 'range' && r.high).toBeLessThan(3000);
    });

    it('steps out to one mile only when half a mile cannot reach five', () => {
      const r = priceBand({
        ...subject, subjectAt: AT,
        sales: comps(2, 2000, NEAR), widerSales: comps(7, 2000, FAR),
      });
      expect(r.kind).toBe('range');
      expect(r.kind === 'range' && r.widened).toBe(true);
      expect(r.kind === 'range' && r.area).toBe('wider');
      expect(r.kind === 'range' && r.count, 'the near two are still in it').toBe(9);
    });

    it('and does not step out when half a mile already has five', () => {
      const r = priceBand({
        ...subject, subjectAt: AT,
        sales: comps(6, 2000, NEAR), widerSales: comps(50, 9999, FAR),
      });
      expect(r.kind === 'range' && r.widened).toBe(false);
      expect(r.kind === 'range' && r.area).toBe('half-mile');
      expect(r.kind === 'range' && r.count).toBe(6);
    });

    /**
     * A sale we cannot place is a sale we cannot claim is nearby. Keeping it
     * would widen the area in silence, which is the one thing forbidden here.
     */
    it('drops a sale with no coordinates rather than assuming it is near', () => {
      const r = priceBand({
        ...subject, subjectAt: AT,
        sales: comps(6, 2000, { lat: null, lng: null }),
      });
      expect(r.kind).toBe('none');
    });

    /** No point, no circle — and the area is NAMED rather than implied. */
    it('falls back to the postcode sector when the subject cannot be placed', () => {
      const r = priceBand({ ...subject, subjectAt: null, sales: comps(6, 2000, FAR) });
      expect(r.kind, 'distance cannot be applied, so it is not applied').toBe('range');
      expect(r.kind === 'range' && r.area).toBe('sector');
    });
  });

  /**
   * C1 — THE WINDOW COUNTS BACK FROM THE DATA, NOT FROM TODAY.
   *
   * Counting from today shortens the window by however stale the pipeline is,
   * so "the last twelve months" was ten months here and twelve on the
   * analyser. It is the same `periodStart` both use now, over the same as-of
   * month, and this shows the sale that used to fall between them.
   */
  describe('the window it counts back over', () => {
    // Data to 2026-07, so twelve months starts 2025-08-01. Today is 2026-09-15,
    // so counting from today would start 2025-09-15 and lose this sale.
    const between = comps(6, 2000, { date: '2025-08-10' });

    it('counts a sale inside twelve months of the DATA', () => {
      expect(priceBand({ ...subject, asOf: '2026-07', sales: between }).kind).toBe('range');
    });

    it('and the same sale falls outside when the window is counted from today', () => {
      expect(priceBand({ ...subject, sales: between }).kind, 'the old behaviour').toBe('none');
    });

    it('and a sale genuinely older than the window is out either way', () => {
      const older = comps(6, 2000, { date: '2025-07-01' });
      expect(priceBand({ ...subject, asOf: '2026-07', sales: older }).kind).toBe('none');
    });
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

  /**
   * C1 — THE WINDOW IS TWELVE MONTHS, not three years. It was three, which
   * disagreed with every other surface in the product; it only ever looked
   * harmless because the sector files carry twelve months anyway.
   */
  it('ignores sales older than the window — that is a different market', () => {
    const old = comps(20, 2000, { date: '2024-01-01' });
    expect(priceBand({ ...subject, sales: old }).kind, 'two years back is out').toBe('none');
    const justInside = comps(6, 2000, { date: '2025-11-01' });
    expect(priceBand({ ...subject, sales: justInside }).kind, 'ten months back is in').toBe('range');
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
