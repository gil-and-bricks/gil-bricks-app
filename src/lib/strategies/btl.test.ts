import { describe, expect, it } from 'vitest';
import { analyseBtl, type BtlInputs } from './btl';

const T = { minCashflowGreen: 150, minRoiGreen: 8, icrBasic: 1.25, icrHigher: 1.45 };
const base: BtlInputs = {
  price: 150000, country: 'E92000001', monthlyRent: 750, depositPct: 25, ratePct: 5,
  buyingAs: 'basic', selfManaged: false, voidWeeks: 5, agentPct: 12, maintPct: 1,
  insurancePerYear: 300, legals: 1500, refurb: 0, stressRatePct: 5.5,
  taxBasis: 'additional', thresholds: T,
};

describe('BTL worked example — £150k England terrace, £750 rent, 25%/5%, basic-rate', () => {
  // Hand-computed:
  //   SDLT additional: 5%×125,000 + 7%×25,000 = 6,250 + 1,750 = £8,000
  //   deposit 37,500; loan 112,500; cash in = 37,500+8,000+1,500 = £47,000
  //   mortgage IO: 112,500×5%/12 = £468.75/mo
  //   mgmt 12% = £90; maint 1%×150k/12 = £125; ins £25; voids 750×12/52×5/12 = £72.115
  //   cashflow before tax = 750−468.75−90−125−25−72.12 = −£30.87 → RED (negative)
  //   ICR = 9,000 ÷ (112,500×5.5%) = 1.4545 → passes 1.25
  //   tax: received rent 8,134.62; allowable 2,880; profit 5,254.62;
  //        20% = 1,050.92; S24 credit = 20%×min(5,625, 5,254.62) = 1,050.92 → £0 tax
  const a = analyseBtl(base);
  it('stamp duty £8,000; cash in £47,000; mortgage £468.75', () => {
    expect(a.stampDuty.value.tax).toBe(8000);
    expect(a.cashIn.value).toBe(47000);
    expect(a.mortgageMonthly.value).toBeCloseTo(468.75, 2);
  });
  it('cashflow −£30.87 before tax; £0 tax (S24 credit swallows it); RED', () => {
    expect(a.cashflowBeforeTax.value).toBeCloseTo(-30.87, 1);
    expect(a.taxPerYear.value).toBe(0);
    expect(a.cashflowAfterTax.value).toBeCloseTo(-30.87, 1);
    expect(a.verdict).toBe('red');
    expect(a.verdictCopy).toMatch(/loses money each month/);
  });
  it('ICR 1.45 passes the 1.25 basic threshold; yields correct', () => {
    expect(a.icr.value).toBeCloseTo(1.4545, 3);
    expect(a.icr.passes).toBe(true);
    // gross: 9,000/150,000 = 6.0%; net: (9,000−3,745.38)/159,500 = 3.294%
    expect(a.grossYield.value).toBeCloseTo(6.0, 4);
    expect(a.netYield.value).toBeCloseTo(3.294, 2);
  });
  it('a red verdict still offers a lever to Amber', () => {
    expect(a.lever).toMatch(/turn this Red to Amber/);
  });
});

describe('verdict colours all reachable', () => {
  // £950 rent: before-tax ≈ £125.90, after-tax ≈ £100.72 → AMBER (hand-computed)
  it('amber: covers costs but thin returns', () => {
    const a = analyseBtl({ ...base, monthlyRent: 950 });
    expect(a.cashflowBeforeTax.value).toBeCloseTo(125.90, 1);
    expect(a.cashflowAfterTax.value).toBeCloseTo(100.72, 1);
    expect(a.verdict).toBe('amber');
    expect(a.lever).toMatch(/Amber to Green/);
  });
  it('green: strong rent clears every bar', () => {
    const a = analyseBtl({ ...base, monthlyRent: 1400 });
    expect(a.verdict).toBe('green');
    expect(a.cashflowAfterTax.value).toBeGreaterThanOrEqual(150);
    expect(a.roi.value).toBeGreaterThanOrEqual(8);
    expect(a.lever).toBeNull();
  });
  it('red on ICR failure even when cashflow is positive', () => {
    // 5% deposit at a cheap 3.5% pay rate: loan 142,500, mortgage £415.63
    // cashflow: 800−415.63−96−125−25−76.92 = +£61.45 (positive)
    // but ICR = 9,600 ÷ (142,500×5.5%) = 1.2249 < 1.25 → RED on ICR alone
    const a = analyseBtl({ ...base, monthlyRent: 800, depositPct: 5, ratePct: 3.5 });
    expect(a.cashflowBeforeTax.value).toBeGreaterThan(0);
    expect(a.icr.passes).toBe(false);
    expect(a.verdict).toBe('red');
    expect(a.verdictCopy).toMatch(/stressed rate/);
  });
});

describe('buying-as variations', () => {
  it('higher-rate uses the 1.45 ICR threshold', () => {
    const a = analyseBtl({ ...base, buyingAs: 'higher' });
    expect(a.icr.threshold).toBe(1.45);
    expect(a.icr.passes).toBe(true); // 1.4545 ≥ 1.45 — just
  });
  it('company pays corporation tax instead of S24', () => {
    const rich = { ...base, monthlyRent: 1400 };
    const personal = analyseBtl(rich);
    const company = analyseBtl({ ...rich, buyingAs: 'ltd' });
    // received 16,800 − voids 1,615.38 = 15,184.62; allowable 2,016+1,500+300 = 3,816
    // company profit = 15,184.62 − 3,816 − 5,625 = 5,743.62 → 19% = £1,091.29
    expect(company.taxPerYear.value).toBeCloseTo(1091.29, 1);
    expect(company.taxPerYear.breakdown.note).toMatch(/Section 24 does not apply/);
    expect(personal.taxPerYear.value).not.toBeCloseTo(company.taxPerYear.value, 0);
  });
});

describe('purchase-tax bases and countries', () => {
  it('main-residence basis drops the surcharge: £500 vs £8,000', () => {
    const a = analyseBtl({ ...base, taxBasis: 'standard' });
    // standard rates: £0 to £125,000, then 2% × £25,000 = £500
    expect(a.stampDuty.value.tax).toBe(500);
  });
  it('Wales uses LTT (standalone higher table): £150k → 5% × £150k = £7,500', () => {
    const a = analyseBtl({ ...base, country: 'W92000004' });
    // LTT higher: 5% × 150,000 (all inside the first band to £180k) = £7,500
    expect(a.stampDuty.value.tax).toBeCloseTo(7500, 6);
    expect(a.stampDuty.breakdown.label).toMatch(/Land transaction tax/);
  });
});
