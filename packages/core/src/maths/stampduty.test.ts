import { describe, expect, it } from 'vitest';
import { flipTax, pickEffective, stampDuty } from './index';

const E = 'E92000001' as const;
const W = 'W92000004' as const;

describe('SDLT — England standard', () => {
  // gov.uk's own worked example: £295,000 → 0 + 2%×125,000 + 5%×45,000 = £4,750
  it('matches the official £295,000 example: £4,750', () => {
    const r = stampDuty({ price: 295000, country: E, buyerType: 'standard' });
    expect(r.value.tax).toBe(4750);
    expect(r.value.regime).toBe('SDLT standard rates');
  });
  it('£125,000 exactly is tax-free; £350,000 = £7,500', () => {
    expect(stampDuty({ price: 125000, country: E, buyerType: 'standard' }).value.tax).toBe(0);
    // 2%×125,000 + 5%×100,000 = 2,500 + 5,000
    expect(stampDuty({ price: 350000, country: E, buyerType: 'standard' }).value.tax).toBe(7500);
  });
  // 2%×125k=2,500 + 5%×675k=33,750 + 10%×575k=57,500 + 12%×100k=12,000 = £105,750
  it('£1.6m crosses every band: £105,750', () => {
    expect(stampDuty({ price: 1600000, country: E, buyerType: 'standard' }).value.tax).toBe(105750);
  });
});

describe('SDLT — England additional property (+5% every band)', () => {
  // 5%×125k=6,250 + 7%×125k=8,750 + 10%×100k=10,000 = £25,000
  it('£350,000 = £25,000', () => {
    const r = stampDuty({ price: 350000, country: E, buyerType: 'additional' });
    expect(r.value.tax).toBe(25000);
    expect(r.value.regime).toBe('SDLT additional-property rates');
  });
  it('under £40,000 falls back to standard rates (£0)', () => {
    const r = stampDuty({ price: 39999, country: E, buyerType: 'additional' });
    expect(r.value.tax).toBe(0);
    expect(r.value.regime).toBe('SDLT standard rates');
  });
  it('£40,000 exactly uses the additional table: 5% = £2,000', () => {
    expect(stampDuty({ price: 40000, country: E, buyerType: 'additional' }).value.tax).toBe(2000);
  });
});

describe('SDLT — first-time buyers', () => {
  it('£350,000 → 5% over £300,000 = £2,500', () => {
    expect(stampDuty({ price: 350000, country: E, buyerType: 'firstTimeBuyer' }).value.tax).toBe(2500);
  });
  it('£500,000 → £10,000; a pound more loses the relief entirely', () => {
    expect(stampDuty({ price: 500000, country: E, buyerType: 'firstTimeBuyer' }).value.tax).toBe(10000);
    const r = stampDuty({ price: 500001, country: E, buyerType: 'firstTimeBuyer' });
    // standard: 2%×125,000 + 5%×250,001 = 2,500 + 12,500.05, rounded DOWN
    // to the nearest pound the way HMRC do it (SDLTM00050)
    expect(r.value.tax).toBe(15000);
    expect(r.value.regime).toBe('SDLT standard rates');
    expect(r.breakdown.note).toMatch(/no first-time-buyer relief/);
  });
});

describe('LTT — Wales main', () => {
  // gov.wales worked example: £280,000 → 6%×55,000 = £3,300
  it('matches the official £280,000 example: £3,300', () => {
    const r = stampDuty({ price: 280000, country: W, buyerType: 'standard' });
    expect(r.value.tax).toBeCloseTo(3300, 6);
    expect(r.value.regime).toBe('LTT main residential rates');
  });
  it('£225,000 exactly is tax-free', () => {
    expect(stampDuty({ price: 225000, country: W, buyerType: 'standard' }).value.tax).toBe(0);
  });
  it('first-time buyers get NO relief in Wales — main rates', () => {
    const r = stampDuty({ price: 280000, country: W, buyerType: 'firstTimeBuyer' });
    expect(r.value.tax).toBeCloseTo(3300, 6);
    expect(r.breakdown.note).toMatch(/no first-time-buyer relief/);
  });
});

describe('LTT — Wales higher (standalone table, first band from £0)', () => {
  // WRA's own worked example: £260,000 → 5%×180k + 8.5%×70k + 10%×10k = £15,950
  it('matches the official £260,000 example: £15,950', () => {
    const r = stampDuty({ price: 260000, country: W, buyerType: 'additional' });
    expect(r.value.tax).toBeCloseTo(15950, 6);
    expect(r.value.regime).toBe('LTT higher residential rates');
    expect(r.breakdown.note).toMatch(/standalone/);
  });
  it('taxes from the first pound — £100,000 = £5,000 (never main + surcharge)', () => {
    expect(stampDuty({ price: 100000, country: W, buyerType: 'additional' }).value.tax).toBeCloseTo(5000, 6);
  });
  it('under £40,000 falls back to the main table (£0)', () => {
    const r = stampDuty({ price: 39000, country: W, buyerType: 'additional' });
    expect(r.value.tax).toBe(0);
    expect(r.value.regime).toBe('LTT main residential rates');
  });
});

describe('engine plumbing', () => {
  it('rejects unknown countries and negative prices', () => {
    // @ts-expect-error deliberately wrong country
    expect(() => stampDuty({ price: 100000, country: 'S92000003', buyerType: 'standard' })).toThrow(/country/);
    expect(() => stampDuty({ price: -1, country: E, buyerType: 'standard' })).toThrow(/price/);
  });
  it('band lines sum to the total and cover the price', () => {
    const r = stampDuty({ price: 350000, country: E, buyerType: 'standard' });
    const sum = r.value.bands.reduce((a, l) => a + l.tax, 0);
    expect(sum).toBe(r.value.tax);
  });
  it('pickEffective selects the newest entry on/before the date', () => {
    const entries = [
      { effectiveFrom: '2020-01-01', source: { url: 'a', accessed: 'x' }, v: 1 },
      { effectiveFrom: '2024-06-01', source: { url: 'b', accessed: 'x' }, v: 2 },
      { effectiveFrom: '2026-01-01', source: { url: 'c', accessed: 'x' }, v: 3 },
    ];
    expect(pickEffective(entries, '2025-12-31').v).toBe(2);
    expect(pickEffective(entries, '2026-01-01').v).toBe(3);
    expect(() => pickEffective(entries, '2019-01-01')).toThrow(/No rates effective/);
  });
});

describe('flipTax', () => {
  // higher band: 40%×39,000 = 15,600; Class 4: 6%×(39,000−12,570) = 1,585.80 → 17,185.80
  it('personal higher band on £39,000 = £17,185.80', () => {
    expect(flipTax({ profit: 39000, taxedAs: 'higher' }).value).toBeCloseTo(17185.8, 2);
  });
  // 40%×60,000 = 24,000; NIC: 6%×(50,270−12,570)=2,262 + 2%×(60,000−50,270)=194.60 → 26,456.60
  it('NIC upper rate kicks in above £50,270: £26,456.60 on £60,000', () => {
    expect(flipTax({ profit: 60000, taxedAs: 'higher' }).value).toBeCloseTo(26456.6, 2);
  });
  // ltd small profits: 19% × 39,000 = £7,410
  it('limited company pays corporation tax: £7,410 on £39,000', () => {
    expect(flipTax({ profit: 39000, taxedAs: 'ltd' }).value).toBeCloseTo(7410, 2);
  });
  it('profit below the NIC lower limit pays income tax only', () => {
    // basic 20%×10,000 = 2,000; NIC 0
    expect(flipTax({ profit: 10000, taxedAs: 'basic' }).value).toBeCloseTo(2000, 2);
  });
});
