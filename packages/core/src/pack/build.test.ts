/**
 * DP1 — WHAT A PACK'S NUMBERS ARE, AND WHAT THEY CAN NEVER BE.
 *
 * `packNumbers` is the boundary between an analysis and a document that leaves
 * the building. These hold the two properties that make that boundary worth
 * having: it takes an explicit list rather than a whole analysis, and nothing
 * comes out of it without a basis attached.
 */
import { describe, expect, it } from 'vitest';
import { everyFigure, packNumbers, perMonth, type PackFigureCopy, type PackSource } from './build';
import { NEVER_IN_A_PACK, PackHonestyError } from './honesty';

const COPY: PackFigureCopy = {
  price: { label: 'Purchase price', basis: 'The asking price you entered.' },
  stampDuty: { label: 'Stamp duty', basis: 'From the purchase price and the current bands.' },
  stampDutyWales: { label: 'Land Transaction Tax', basis: 'From the purchase price and the current Welsh bands.' },
  refurb: { label: 'Refurb cost', basis: 'Your refurb figure.' },
  legals: { label: 'Legal and buying costs', basis: 'Your figure for legal and buying costs.' },
  additional: { label: 'Additional costs', basis: 'Your figure for additional costs.' },
  totalIn: { label: 'Total going in', basis: 'Price, tax, refurb and costs added together.' },
  roi: { label: 'Return on cash', basis: 'Annual return over the cash going in.' },
  roce: { label: 'Return on capital employed', basis: 'Profit over the capital employed.' },
  grossYield: { label: 'Rental yield', basis: 'Annual rent over the purchase price.' },
  monthlyRent: { label: 'Monthly rent', basis: 'Your monthly rent figure.' },
  endValue: { label: 'Estimated end value', basis: 'Your own figure once the work is done. An estimate.' },
};

const source = (over: Partial<PackSource> = {}): PackSource => ({
  strategy: 'btl',
  price: '£150,000', stampDuty: '£7,500', inWales: false, legals: '£2,000',
  refurb: '£10,000', additional: null, totalIn: '£45,000',
  monthlyRent: '£900', returnPct: '7.2%', returnIsRoce: false, grossYield: '7.2%',
  endValue: null,
  ...over,
});

describe('every figure arrives with its basis', () => {
  it('gives each one a label, a value and a basis', () => {
    const all = everyFigure(packNumbers(source(), COPY));
    expect(all.length).toBeGreaterThan(5);
    for (const f of all) {
      expect(f.label, 'label').not.toBe('');
      expect(f.value, f.label).not.toBe('');
      expect(f.basis, f.label).not.toBe('');
    }
  });

  it('refuses to build at all if a basis is blank', () => {
    const blank = { ...COPY, price: { label: 'Purchase price', basis: '  ' } };
    expect(() => packNumbers(source(), blank)).toThrow(PackHonestyError);
  });

  it('refuses wording that calls a modelled figure a valuation', () => {
    const bad = { ...COPY, endValue: { label: 'Estimated end value', basis: 'From an RICS valuation.' } };
    expect(() => packNumbers(source({ strategy: 'flip', endValue: '£240,000' }), bad)).toThrow(PackHonestyError);
  });
});

describe('it carries an allow-list, never an analysis', () => {
  it('names no banned key in anything it returns', () => {
    const out = JSON.stringify(packNumbers(source(), COPY));
    for (const key of NEVER_IN_A_PACK) expect(out, key).not.toContain(key);
  });

  it('shows nothing for a figure the deal does not have', () => {
    const bare = packNumbers(source({ monthlyRent: null, returnPct: null, grossYield: null }), COPY);
    expect(bare.returns).toEqual([]);
    // A missing figure is absent, never a dash or a zero that reads as real.
    expect(JSON.stringify(bare)).not.toContain('£0');
    expect(JSON.stringify(bare)).not.toContain('—');
  });

  it('adds additional costs only when there are some', () => {
    const without = everyFigure(packNumbers(source(), COPY)).map((f) => f.label);
    const withIt = everyFigure(packNumbers(source({ additional: '£1,200' }), COPY)).map((f) => f.label);
    expect(without).not.toContain(COPY.additional.label);
    expect(withIt).toContain(COPY.additional.label);
  });
});

describe('the words come from the caller', () => {
  it('uses the Welsh tax label for a Welsh purchase, and only then', () => {
    const wales = everyFigure(packNumbers(source({ inWales: true }), COPY)).map((f) => f.label);
    const england = everyFigure(packNumbers(source({ inWales: false }), COPY)).map((f) => f.label);
    expect(wales).toContain(COPY.stampDutyWales.label);
    expect(wales).not.toContain(COPY.stampDuty.label);
    expect(england).toContain(COPY.stampDuty.label);
    expect(england).not.toContain(COPY.stampDutyWales.label);
  });

  it('calls a flip’s return capital employed and a let’s return cash', () => {
    const flip = packNumbers(source({ strategy: 'flip', returnIsRoce: true, endValue: '£240,000' }), COPY);
    const btl = packNumbers(source(), COPY);
    expect(flip.returns[0]?.label).toBe(COPY.roce.label);
    expect(btl.returns[0]?.label).toBe(COPY.roi.label);
  });

  it('writes no word of its own — every label came out of the copy passed in', () => {
    const allowed = new Set(Object.values(COPY).flatMap((c) => [c.label, c.basis]));
    for (const f of everyFigure(packNumbers(source({ inWales: true }), COPY))) {
      expect(allowed.has(f.label), f.label).toBe(true);
      expect(allowed.has(f.basis), f.basis).toBe(true);
    }
  });
});

describe('the headline the reader sees first', () => {
  it('leads a flip and a BRRRR on the end value', () => {
    for (const strategy of ['flip', 'brrrr'] as const) {
      const n = packNumbers(source({ strategy, endValue: '£240,000', returnIsRoce: true }), COPY);
      expect(n.headline[0]?.label).toBe(COPY.endValue.label);
      expect(n.headline[0]?.projected).toBe(true);
    }
  });

  it('leads a let on what it returns', () => {
    expect(packNumbers(source(), COPY).headline[0]?.label).toBe(COPY.roi.label);
  });

  it('falls back to the purchase price rather than showing nothing', () => {
    const bare = packNumbers(source({ monthlyRent: null, returnPct: null, grossYield: null }), COPY);
    expect(bare.headline[0]?.label).toBe(COPY.price.label);
  });
});

describe('a year as a month', () => {
  it('divides by twelve, and nothing else does', () => {
    expect(perMonth(12000)).toBe(1000);
    expect(perMonth(0)).toBe(0);
  });
});
