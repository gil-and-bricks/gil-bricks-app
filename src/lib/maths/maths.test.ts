import { describe, expect, it } from 'vitest';
// plain-JS pipeline module, imported only for the parity test (allowJs)
import { iqm as pipeIqm, percentile as pipePctl } from '../../../pipeline/stats.mjs';
import {
  brrrr,
  cashIn,
  flipProfit,
  fmtMoney,
  fmtPct,
  grossYield,
  icr,
  iqm,
  ltdTaxOnRentalProfit,
  monthlyCashflow,
  mortgageInterestOnly,
  mortgageRepayment,
  netYield,
  percentile,
  ppsqft,
  ppsqm,
  roi,
  sqmToSqft,
  taxOnRentalProfit,
  typicalPrice,
  valuationRange,
} from './index';

describe('formatting', () => {
  it('money is £1,234 style, whole pounds', () => {
    expect(fmtMoney(1234)).toBe('£1,234');
    expect(fmtMoney(1234567.49)).toBe('£1,234,567');
    expect(fmtMoney(0)).toBe('£0');
    expect(fmtMoney(-500)).toBe('-£500');
    expect(fmtMoney(-0.4)).toBe('£0'); // no signed zero
  });
  it('percentages get 1 decimal', () => {
    expect(fmtPct(8.4)).toBe('8.4%');
    expect(fmtPct(6.2727)).toBe('6.3%');
  });
});

describe('area', () => {
  it('ppsqm: £127,000 over 79 sqm = £1,607.59.../sqm', () => {
    const r = ppsqm(127000, 79);
    expect(r.value).toBeCloseTo(1607.5949, 3);
    expect(r.breakdown.result).toBe('£1,608 per sqm');
  });
  it('ppsqft: £127,000 over 79 sqm = £149.35/sqft (79 sqm = 850.35 sqft)', () => {
    expect(sqmToSqft(79)).toBeCloseTo(850.3481, 3);
    expect(ppsqft(127000, 79).value).toBeCloseTo(149.35, 2);
  });
  it('rejects zero floor area', () => {
    expect(() => ppsqm(127000, 0)).toThrow(/floorAreaSqm/);
  });
});

describe('yields', () => {
  it('gross: £700/month (£8,400/yr) on £100,000 = 8.4%', () => {
    const r = grossYield(8400, 100000);
    expect(r.value).toBeCloseTo(8.4, 6);
    expect(r.breakdown.result).toBe('8.4%');
  });
  it('net: (£8,400 − £1,500) ÷ £110,000 = 6.2727...% → "6.3%"', () => {
    const r = netYield(8400, 1500, 110000);
    expect(r.value).toBeCloseTo(6.272727, 4);
    expect(r.breakdown.result).toBe('6.3%');
  });
  it('rejects zero price and negative rent', () => {
    expect(() => grossYield(8400, 0)).toThrow(/price/);
    expect(() => grossYield(-1, 100000)).toThrow(/annualRent/);
  });
});

describe('monthlyCashflow', () => {
  // 700 − 320 − 84 − 50 − 20 − 35 = 191
  it('£700 rent less £509 costs = £191', () => {
    const r = monthlyCashflow({ rent: 700, mortgage: 320, management: 84, maintenance: 50, insurance: 20, voids: 35 });
    expect(r.value).toBe(191);
    expect(r.breakdown.result).toBe('£191 per month');
  });
  it('can be negative (costs exceed rent)', () => {
    expect(monthlyCashflow({ rent: 500, mortgage: 520, management: 60, maintenance: 0, insurance: 0, voids: 0 }).value).toBe(-80);
  });
  it('rejects negative inputs', () => {
    expect(() => monthlyCashflow({ rent: 700, mortgage: -1, management: 0, maintenance: 0, insurance: 0, voids: 0 })).toThrow(/mortgage/);
  });
});

describe('mortgages', () => {
  it('interest-only: £75,000 at 5.5% = £343.75/month', () => {
    const r = mortgageInterestOnly(75000, 0.055);
    expect(r.value).toBeCloseTo(343.75, 2);
  });
  // annuity: 75000 × 0.0045833 ÷ (1 − 1.0045833^−300) ≈ £460.57
  it('repayment: £75,000 at 5.5% over 25 years ≈ £460.57/month', () => {
    expect(mortgageRepayment(75000, 0.055, 25).value).toBeCloseTo(460.57, 1);
  });
  it('repayment beats interest-only (loan being paid down)', () => {
    expect(mortgageRepayment(75000, 0.055, 25).value).toBeGreaterThan(mortgageInterestOnly(75000, 0.055).value);
  });
});

describe('icr', () => {
  // 8400 ÷ (75000 × 0.055 = 4125) = 2.0364
  it('£8,400 rent vs £75,000 at 5.5% stress = 2.04 — passes both thresholds', () => {
    expect(icr(8400, 75000, 0.055, 1.25).passes).toBe(true);
    expect(icr(8400, 75000, 0.055, 1.45).passes).toBe(true);
    expect(icr(8400, 75000, 0.055, 1.25).value).toBeCloseTo(2.03636, 4);
  });
  // 8400 ÷ (150000 × 0.07 = 10500) = 0.8
  it('fails both thresholds when rent is thin', () => {
    expect(icr(8400, 150000, 0.07, 1.25).passes).toBe(false);
    expect(icr(8400, 150000, 0.07, 1.45).passes).toBe(false);
  });
  it('meeting the threshold exactly passes', () => {
    // 5156.25 ÷ (75000 × 0.055) = exactly 1.25
    expect(icr(5156.25, 75000, 0.055, 1.25).passes).toBe(true);
  });
});

describe('cashIn + roi', () => {
  // 25000 + 5000 + 1500 + 15000 + 2000 = 48500
  it('sums deposit, SDLT, legals, refurb, fees: £48,500', () => {
    const r = cashIn({ deposit: 25000, sdlt: 5000, legals: 1500, refurb: 15000, fees: 2000 });
    expect(r.value).toBe(48500);
    expect(r.breakdown.note).toMatch(/stamp duty/);
  });
  // 5820 ÷ 48500 × 100 = 12.0%
  it('roi: £5,820 profit on £48,500 in = 12.0%', () => {
    const r = roi(5820, 48500);
    expect(r.value).toBeCloseTo(12.0, 4);
    expect(r.breakdown.result).toBe('12.0%');
  });
  it('roi can be negative; zero cash-in rejected', () => {
    expect(roi(-1000, 48500).value).toBeLessThan(0);
    expect(() => roi(5820, 0)).toThrow(/totalCashIn/);
  });
});

describe('brrrr verdicts (all three)', () => {
  // arv 100000 × 0.75 = 75000 proceeds
  it('proceeds £75,000 vs £60,000 invested → "All money out + £15,000"', () => {
    const r = brrrr({ cashInvested: 60000, refinanceLtv: 0.75, arv: 100000 });
    expect(r.value.verdict).toBe('All money out + £15,000');
    expect(r.value.surplus).toBe(15000);
    expect(r.value.moneyLeftIn).toBe(0);
  });
  it('proceeds exactly equal invested → "All money out"', () => {
    const r = brrrr({ cashInvested: 75000, refinanceLtv: 0.75, arv: 100000 });
    expect(r.value.verdict).toBe('All money out');
  });
  it('proceeds £75,000 vs £90,000 invested → "£15,000 left in"', () => {
    const r = brrrr({ cashInvested: 90000, refinanceLtv: 0.75, arv: 100000 });
    expect(r.value.verdict).toBe('£15,000 left in');
    expect(r.value.moneyLeftIn).toBe(15000);
  });
  it('differences under £1 either way read as plain "All money out"', () => {
    // proceeds 75000.40 vs 75000 → surplus £0.40 → plain
    expect(brrrr({ cashInvested: 75000, refinanceLtv: 0.750004, arv: 100000 }).value.verdict).toBe('All money out');
    // proceeds 75000 vs 75000.40 → 40p "left in" is float noise → plain
    const tiny = brrrr({ cashInvested: 75000.4, refinanceLtv: 0.75, arv: 100000 });
    expect(tiny.value.verdict).toBe('All money out');
    expect(tiny.value.moneyLeftIn).toBe(0);
  });
});

describe('flipProfit', () => {
  // profit: 250000 − 150000 − 40000 − 7500 − 9000 − 4500 = 39000
  // on GDV: 39000 ÷ 250000 = 15.6% ; cash employed: 150000+7500+40000+9000 = 206500
  // roi: 39000 ÷ 206500 = 18.886...%
  it('worked example: £39,000 profit, 15.6% on GDV, 18.9% ROI', () => {
    const r = flipProfit({ gdv: 250000, purchase: 150000, refurb: 40000, purchaseCosts: 7500, financeCosts: 9000, sellingCosts: 4500 });
    expect(r.value.profit).toBe(39000);
    expect(r.value.profitOnGdv).toBeCloseTo(15.6, 4);
    expect(r.value.cashIn).toBe(206500);
    expect(r.value.roi).toBeCloseTo(18.886, 2);
  });
  it('a loss-making flip reports a negative profit', () => {
    expect(flipProfit({ gdv: 180000, purchase: 150000, refurb: 40000, purchaseCosts: 5000, financeCosts: 5000, sellingCosts: 3000 }).value.profit).toBe(-23000);
  });
});

describe('typicalPrice — locked IQM + p10/p90', () => {
  // the S2.1 fixture prices: hand-verified typical 137575, p10 98650, p90 206300
  const prices = [132500, 118000, 96500, 149950, 173000, 122000, 210000, 87500, 138000, 265000, 156000, 127000];
  it('matches the hand-computed fixture stats', () => {
    const r = typicalPrice(prices);
    expect(r.value.typical).toBe(137575);
    expect(r.value.p10).toBe(98650);
    expect(r.value.p90).toBe(206300);
  });
  it('parity with pipeline/stats.mjs across shapes incl. n not divisible by 4', () => {
    const cases = [
      [100],
      [100, 200],
      [5, 1, 4, 2, 3],
      [10, 20, 30, 40, 50, 60, 70],
      prices,
      Array.from({ length: 41 }, (_, i) => (i * 7919) % 1000),
    ];
    for (const xs of cases) {
      expect(iqm(xs)).toBe(pipeIqm(xs));
      expect(percentile(xs, 0.1)).toBe(pipePctl(xs, 0.1));
      expect(percentile(xs, 0.9)).toBe(pipePctl(xs, 0.9));
    }
  });
  it('rejects empty lists and NaN values in every stats helper', () => {
    expect(() => typicalPrice([])).toThrow(/at least one/);
    expect(() => iqm([])).toThrow(/at least one/);
    expect(() => percentile([], 0.1)).toThrow(/at least one/);
    expect(() => iqm([1, NaN, 2])).toThrow(/values\[1\]/);
    expect(() => percentile([1, 2], 2)).toThrow(/between 0 and 1/);
  });
});

describe('valuationRange', () => {
  it('medium: £200,000 ± 10% = £180,000–£220,000, "less certain"', () => {
    const r = valuationRange(200000, 'medium');
    expect(r.value.low).toBe(180000);
    expect(r.value.high).toBe(220000);
    expect(r.value.label).toBe('less certain');
  });
  it('high = ±5% "fairly reliable"; low = ±20% "rough guide"', () => {
    expect(valuationRange(200000, 'high').value.marginPct).toBe(5);
    expect(valuationRange(200000, 'high').value.label).toBe('fairly reliable');
    expect(valuationRange(200000, 'low').value.low).toBe(160000);
    expect(valuationRange(200000, 'low').value.label).toBe('rough guide');
  });
});

describe('tax — Section 24 (personal)', () => {
  // taxable 12000−2000=10000; higher 40% = 4000; credit 20%×4000 interest = 800 → 3200
  it('higher band: £3,200', () => {
    expect(taxOnRentalProfit({ annualRent: 12000, allowableCosts: 2000, mortgageInterest: 4000, taxBand: 'higher' }).value).toBe(3200);
  });
  // basic: 10000×20% − 800 = 1200 ; additional: 10000×45% − 800 = 3700
  it('basic £1,200; additional £3,700', () => {
    expect(taxOnRentalProfit({ annualRent: 12000, allowableCosts: 2000, mortgageInterest: 4000, taxBand: 'basic' }).value).toBe(1200);
    expect(taxOnRentalProfit({ annualRent: 12000, allowableCosts: 2000, mortgageInterest: 4000, taxBand: 'additional' }).value).toBe(3700);
  });
  // credit capped at profit: taxable 1000, 40% = 400; credit 20%×min(4000,1000)=200 → 200
  it('credit is capped at the property profit', () => {
    expect(taxOnRentalProfit({ annualRent: 6000, allowableCosts: 5000, mortgageInterest: 4000, taxBand: 'higher' }).value).toBe(200);
  });
  it('never negative', () => {
    expect(taxOnRentalProfit({ annualRent: 5000, allowableCosts: 4900, mortgageInterest: 4000, taxBand: 'basic' }).value).toBe(0);
  });
});

describe('tax — limited company', () => {
  // profit 12000−2000−4000 = 6000 → 19% = 1140
  it('small profits rate: £1,140 on £6,000', () => {
    expect(ltdTaxOnRentalProfit({ annualRent: 12000, allowableCosts: 2000, mortgageInterest: 4000 }).value).toBe(1140);
  });
  // profit 100000: 25% = 25000 − relief (250000−100000)×3/200 = 2250 → 22750
  it('marginal relief: £22,750 on £100,000', () => {
    expect(ltdTaxOnRentalProfit({ annualRent: 110000, allowableCosts: 5000, mortgageInterest: 5000 }).value).toBe(22750);
  });
  // profit 300000 → main rate 25% = 75000
  it('main rate above the upper limit', () => {
    expect(ltdTaxOnRentalProfit({ annualRent: 320000, allowableCosts: 10000, mortgageInterest: 10000 }).value).toBe(75000);
  });
});

describe('breakdown shape', () => {
  it('every breakdown has all five fields, non-empty', () => {
    const samples = [
      ppsqm(127000, 79).breakdown,
      grossYield(8400, 100000).breakdown,
      netYield(8400, 1500, 110000).breakdown,
      monthlyCashflow({ rent: 700, mortgage: 320, management: 84, maintenance: 50, insurance: 20, voids: 35 }).breakdown,
      mortgageInterestOnly(75000, 0.055).breakdown,
      mortgageRepayment(75000, 0.055, 25).breakdown,
      icr(8400, 75000, 0.055, 1.25).breakdown,
      cashIn({ deposit: 25000, sdlt: 5000, legals: 1500, refurb: 15000, fees: 2000 }).breakdown,
      roi(5820, 48500).breakdown,
      brrrr({ cashInvested: 60000, refinanceLtv: 0.75, arv: 100000 }).breakdown,
      flipProfit({ gdv: 250000, purchase: 150000, refurb: 40000, purchaseCosts: 7500, financeCosts: 9000, sellingCosts: 4500 }).breakdown,
      typicalPrice([100000, 120000, 140000, 160000]).breakdown,
      valuationRange(200000, 'medium').breakdown,
      taxOnRentalProfit({ annualRent: 12000, allowableCosts: 2000, mortgageInterest: 4000, taxBand: 'higher' }).breakdown,
      ltdTaxOnRentalProfit({ annualRent: 12000, allowableCosts: 2000, mortgageInterest: 4000 }).breakdown,
    ];
    for (const b of samples) {
      for (const field of ['label', 'formula', 'substituted', 'result', 'note'] as const) {
        expect(b[field], `${b.label}.${field}`).toBeTruthy();
      }
    }
  });
  it('NaN inputs are rejected with the input name in the message', () => {
    expect(() => grossYield(NaN, 100000)).toThrow(/annualRent/);
    expect(() => roi(5820, NaN)).toThrow(/totalCashIn/);
  });
});
