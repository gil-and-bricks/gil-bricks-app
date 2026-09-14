/**
 * DP1 — WHAT A PACK'S NUMBERS ARE, AND WHAT THEY CAN NEVER BE.
 *
 * `packNumbers` is the boundary between an analysis and a document that leaves
 * the building. These hold the two properties that make that boundary worth
 * having: it takes an explicit list rather than a whole analysis, and nothing
 * comes out of it without a basis attached.
 */
import { describe, expect, it } from 'vitest';
import { everyFigure, packNumbers, partsSumToTotal, perMonth, type PackFigureCopy, type PackSource } from './build';
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
  // The same figures as raw numbers, for chart geometry (DP2).
  amounts: { price: 150000, stampDuty: 7500, refurb: 10000, legals: 2000, additional: null, totalIn: 45000 },
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

describe('DP2 — a chart measures the raw figure, never the formatted one', () => {
  it('carries the amount beside the display string on every money figure', () => {
    const n = packNumbers(source(), COPY);
    const price = n.costs.find((f) => f.label === COPY.price.label);
    expect(price?.value).toBe('£150,000');
    expect(price?.amount).toBe(150000);
  });

  it('leaves it undefined where a bar would be meaningless', () => {
    // A percentage has no length. A chart that drew one would be inventing it.
    const n = packNumbers(source(), COPY);
    expect(n.returns.find((f) => f.label === COPY.grossYield.label)?.amount).toBeUndefined();
  });

  it('never lets the two disagree — the amount comes from the engine, not a parse', () => {
    const n = packNumbers(source({ price: '£1,250,000', amounts: { price: 1250000, stampDuty: 7500, refurb: 10000, legals: 2000, additional: null, totalIn: 45000 } }), COPY);
    const price = n.costs.find((f) => f.label === COPY.price.label);
    expect(price?.amount).toBe(1250000);
  });
});

describe('a year as a month', () => {
  it('divides by twelve, and nothing else does', () => {
    expect(perMonth(12000)).toBe(1000);
    expect(perMonth(0)).toBe(0);
  });
});

/**
 * DP2 — the cost chart may only claim the parts add up when they do.
 */
describe('do the cost figures actually sum to the total', () => {
  it('says yes for a cash purchase, where they genuinely do', () => {
    // 150,000 + 7,500 + 10,000 + 2,000 = 169,500
    const n = packNumbers(source({
      totalIn: '£169,500',
      amounts: { price: 150000, stampDuty: 7500, refurb: 10000, legals: 2000, additional: null, totalIn: 169500 },
    }), COPY);
    expect(partsSumToTotal(n)).toBe(true);
  });

  it('says NO for a financed deal — the case that made the first chart lie', () => {
    // A real BRRRR: £78,890 of cash going in against a £120,000 purchase,
    // because most of the purchase is borrowed. 120,000 + 6,000 + 35,000 +
    // 1,500 is £162,500, and a stack drawn from those said it was £78,890.
    const n = packNumbers(source({
      price: '£120,000', stampDuty: '£6,000', refurb: '£35,000', legals: '£1,500', totalIn: '£78,890',
      amounts: { price: 120000, stampDuty: 6000, refurb: 35000, legals: 1500, additional: null, totalIn: 78890 },
    }), COPY);
    expect(partsSumToTotal(n)).toBe(false);
  });

  it('forgives a rounding pound, because every figure was rounded for display', () => {
    const n = packNumbers(source({
      totalIn: '£169,501',
      amounts: { price: 150000, stampDuty: 7500, refurb: 10000, legals: 2000, additional: null, totalIn: 169501 },
    }), COPY);
    expect(partsSumToTotal(n)).toBe(true);
  });

  it('refuses to claim anything from too few figures', () => {
    expect(partsSumToTotal({ headline: [], costs: [], returns: [] })).toBe(false);
  });
});
