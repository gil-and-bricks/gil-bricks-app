import { describe, expect, it } from 'vitest';
import { analyseFlip, gdvNeededForGreen, maxOfferForGreen, type FlipStrategyInputs } from './flip';

const T = { greenRoi: 20, greenProfit: 15000, amberRoi: 10 };
const base: FlipStrategyInputs = {
  price: 100000, country: 'E92000001', refurb: 20000, gdv: 160000, funding: 'bridging',
  months: 6, agentSalePctExVat: 1.2, saleLegals: 1200, flipAs: 'personal', incomeBand: 'higher',
  bridgeLoanPct: 75, bridgeRatePctMonth: 0.85, arrangementPct: 2, exitPct: 0,
  legals: 1500, contingencyPct: 10, taxBasis: 'additional', thresholds: T,
};

describe('flip worked example — £100k, £20k refurb, GDV £160k, 6mo bridge, higher-rate', () => {
  // Hand-computed:
  //   SDLT additional: 5% × 100,000 = £5,000
  //   bridge 75,000; interest 75,000×0.85%×6 = £3,825; arrangement £1,500
  //   contingency 10% × 20,000 = £2,000; finance = £5,325
  //   total cost in = 100,000+5,000+1,500+20,000+2,000+5,325 = £133,825
  //   selling = 160,000×1.2%×1.2(VAT) + 1,200 = 2,304+1,200 = £3,504
  //   profit before tax = 160,000 − 133,825 − 3,504 = £22,671
  //   cash invested = 25,000+1,500+3,825+5,000+1,500+22,000 = £58,825
  //   ROI before tax = 22,671 ÷ 58,825 = 38.54%
  //   personal (higher): 40%×22,671 = 9,068.40 + NIC 6%×(22,671−12,570) = 606.06 → £9,674.46
  //   company: 19% × 22,671 = £4,307.49
  //   after-tax (personal) = £12,996.54 → after-tax ROI 22.09% → GREEN
  const a = analyseFlip(base);
  it('costs and profit', () => {
    expect(a.stampDutyTax).toBe(5000);
    expect(a.totalCostIn.value).toBeCloseTo(133825, 6);
    expect(a.sellingCosts.value).toBeCloseTo(3504, 6);
    expect(a.profitBeforeTax.value).toBeCloseTo(22671, 6);
    expect(a.cashInvested.value).toBeCloseTo(58825, 6);
  });
  it('both tax scenarios side by side', () => {
    expect(a.personalTax.value).toBeCloseTo(9674.46, 1);
    expect(a.companyTax.value).toBeCloseTo(4307.49, 1);
    expect(a.selectedTax).toBeCloseTo(9674.46, 1);
    expect(a.profitAfterTax.value).toBeCloseTo(12996.54, 1);
  });
  it('ROI before 38.5%, after 22.1% → GREEN', () => {
    expect(a.roiBeforeTax.value).toBeCloseTo(38.54, 1);
    expect(a.roiAfterTax.value).toBeCloseTo(22.09, 1);
    expect(a.verdict).toBe('green');
    expect(a.lever).toBeNull();
  });
  it('profit on GDV 14.2% (the detachable module figure)', () => {
    expect(a.profitOnGdvPct.value).toBeCloseTo(14.17, 1);
  });
});

describe('verdict colours', () => {
  it('amber when the margin thins', () => {
    const a = analyseFlip({ ...base, gdv: 150000 });
    // profit = 150,000 − 133,825 − (150,000×1.44%+1,200=3,360) = £12,815
    expect(a.profitBeforeTax.value).toBeCloseTo(12815, 6);
    expect(a.verdict).toBe('amber');
    expect(a.lever).toMatch(/Max offer for a Green flip|Sale price needed/);
  });
  it('red when it loses money', () => {
    const a = analyseFlip({ ...base, gdv: 130000 });
    expect(a.profitBeforeTax.value).toBeLessThan(0);
    expect(a.verdict).toBe('red');
    expect(a.verdictCopy).toMatch(/loses money/);
    expect(a.personalTax.value).toBe(0);
    expect(a.companyTax.value).toBe(0);
  });
});

describe('paths and rules', () => {
  it('company FORCES additional-rate purchase tax even if basis says otherwise', () => {
    const a = analyseFlip({ ...base, flipAs: 'ltd', taxBasis: 'standard' });
    expect(a.taxBasisUsed).toBe('additional');
    expect(a.stampDutyTax).toBe(5000);
  });
  it('personal honours the chosen basis (standard rates: £0 under £125k)', () => {
    const a = analyseFlip({ ...base, taxBasis: 'standard' });
    expect(a.stampDutyTax).toBe(0);
  });
  it('cash path: no finance costs, cash invested = total cost', () => {
    const a = analyseFlip({ ...base, funding: 'cash' });
    // total = 100,000+5,000+1,500+20,000+2,000 = £128,500
    expect(a.financeCosts).toBeNull();
    expect(a.totalCostIn.value).toBe(128500);
    expect(a.cashInvested.value).toBe(128500);
  });
  it('company selection changes the after-tax figures', () => {
    const a = analyseFlip({ ...base, flipAs: 'ltd' });
    expect(a.selectedTax).toBeCloseTo(4307.49, 1);
    expect(a.profitAfterTax.value).toBeCloseTo(22671 - 4307.49, 1);
  });
});

describe('bisection tiles', () => {
  it('max offer boundary: green at the answer, not £250 above', () => {
    const amber = { ...base, gdv: 150000 };
    const p = maxOfferForGreen(amber);
    expect(p).not.toBeNull();
    expect(analyseFlip({ ...amber, price: p as number }).verdict).toBe('green');
    expect(analyseFlip({ ...amber, price: (p as number) + 250 }).verdict).not.toBe('green');
  });
  it('GDV needed boundary symmetrically', () => {
    const amber = { ...base, gdv: 150000 };
    const g = gdvNeededForGreen(amber);
    expect(g).not.toBeNull();
    expect(analyseFlip({ ...amber, gdv: g as number }).verdict).toBe('green');
    expect(analyseFlip({ ...amber, gdv: (g as number) - 250 }).verdict).not.toBe('green');
  });
});
