import { describe, expect, it } from 'vitest';
import { analyseBrrrr, arvNeededForAllOut, maxPriceForAllOut, type BrrrrStrategyInputs } from './brrrr';

const T = { allOutMax: 2500, minCashflowGreen: 100, icrBasic: 1.25, icrHigher: 1.45 };
const base: BrrrrStrategyInputs = {
  price: 100000, country: 'E92000001', refurb: 25000, arv: 160000, funding: 'bridging',
  bridgeMonths: 6, monthlyRent: 800, ltvPct: 75, buyingAs: 'basic',
  bridgeLoanPct: 75, bridgeRatePctMonth: 0.85, arrangementPct: 2, exitPct: 0,
  legals: 1500, refiLegals: 1000, voidWeeks: 5, agentPct: 12, maintPct: 1,
  insurancePerYear: 300, refiRatePct: 5, stressRatePct: 5.5,
  taxBasis: 'additional', thresholds: T,
};

describe('BRRRR worked example — £100k, £25k refurb, ARV £160k, 75% LTV, 6mo bridge', () => {
  // Hand-computed:
  //   SDLT additional England £100k: 5% × 100,000 = £5,000
  //   bridge loan 75,000; deposit 25,000
  //   interest = 75,000 × 0.85% × 6 = £3,825; arrangement 2% = £1,500; exit £0
  //   cash invested = 25,000 + 1,500 + 0 + 3,825 + 5,000 + 1,500 + 25,000 = £61,825
  //   refi loan = 75% × 160,000 = £120,000
  //   proceeds = 120,000 − 75,000 − 1,000 = £44,000
  //   money left in = 61,825 − 44,000 = £17,825 → "£17,825 left in"
  const a = analyseBrrrr(base);
  it('cash invested £61,825; refi loan £120,000; money left in £17,825', () => {
    expect(a.cashInvested.value).toBeCloseTo(61825, 6);
    expect(a.refiLoan.value).toBe(120000);
    expect(a.moneyLeftIn).toBeCloseTo(17825, 6);
    expect(a.outcomeVerdict).toBe('£17,825 left in');
  });
  it('bridging tile: £3,825 interest + £1,500 fees', () => {
    expect(a.bridging?.interest).toBeCloseTo(3825, 6);
    expect(a.bridging?.arrangement).toBe(1500);
  });
  // max price: solve 1.05325p + 0.05p(SDLT, flat 5% under £125k) = 92,500
  //   → p = 92,500 / 1.10325 = £83,843.64 → floor to £250 → £83,750
  it('max purchase price for all money out ≈ £83,750', () => {
    expect(a.maxPriceAllOut).toBe(83750);
  });
  // ARV needed: 0.75×arv = 61,825 + 75,000 + 1,000 = 137,825 → arv = £183,766.67
  //   → ceil to £250 → £184,000
  it('ARV needed for all money out = £184,000', () => {
    expect(a.arvNeededAllOut).toBe(184000);
  });
  it('honest RED: at 75% LTV and £800 rent the end deal loses money monthly', () => {
    // refi mortgage £500/mo vs £800 rent minus costs → negative cashflow;
    // neither a lower price nor a higher ARV can fix cashflow → lever null
    expect(a.cashflowAfterTax.value).toBeLessThan(0);
    expect(a.verdict).toBe('red');
    expect(a.verdictCopy).toMatch(/running costs eat the rent/);
    expect(a.lever).toBeNull();
  });
});

describe('the three verdict strings', () => {
  it('"All money out + £X" when proceeds beat the cash in', () => {
    const a = analyseBrrrr({ ...base, arv: 200000 });
    // proceeds = 150,000 − 76,000 = 74,000 vs 61,825 → surplus £12,175
    expect(a.outcomeVerdict).toBe('All money out + £12,175');
    expect(a.surplus).toBeCloseTo(12175, 6);
  });
  it('plain "All money out" within £1', () => {
    // proceeds must equal invested: 0.75×arv = 61,825+76,000 → arv = 183,766.666
    const a = analyseBrrrr({ ...base, arv: 137825 / 0.75 });
    expect(a.outcomeVerdict).toBe('All money out');
  });
  it('"£X left in" as in the worked example', () => {
    expect(analyseBrrrr(base).outcomeVerdict).toBe('£17,825 left in');
  });
});

describe('paths and switches', () => {
  it('cash purchase: no bridging costs, full price in', () => {
    const a = analyseBrrrr({ ...base, funding: 'cash' });
    // invested = 100,000 + 5,000 + 1,500 + 25,000 = £131,500; proceeds = 120,000−0−1,000
    expect(a.bridging).toBeNull();
    expect(a.cashInvested.value).toBe(131500);
    expect(a.moneyLeftIn).toBeCloseTo(131500 - 119000, 6);
  });
  it('custom LTV 78.9% changes the refinance loan', () => {
    const a = analyseBrrrr({ ...base, ltvPct: 78.9 });
    expect(a.refiLoan.value).toBeCloseTo(126240, 6);
  });
  it('higher-rate buyer gets the 1.45 ICR threshold', () => {
    const a = analyseBrrrr({ ...base, buyingAs: 'higher' });
    expect(a.icr.threshold).toBe(1.45);
  });
  it('red when the refinance cannot repay the bridging — shortfall counted honestly', () => {
    const a = analyseBrrrr({ ...base, arv: 90000 });
    // refi 67,500 − 75,000 − 1,000 = −8,500 short → left in = 61,825 + 8,500
    expect(a.refinanceCoversBridge).toBe(false);
    expect(a.verdict).toBe('red');
    expect(a.verdictCopy).toMatch(/wouldn’t even repay the bridging/);
    expect(a.moneyLeftIn).toBeCloseTo(70325, 6);
    expect(a.outcomeVerdict).toBe('£70,325 left in');
  });
  it('amber all-out-but-thin-cashflow gets its own honest copy', () => {
    // price 80k / ARV 170k / 70% LTV / rent 1,000: all money out (+£3,240)
    // but after-tax ≈ £97/mo < £100 → amber for the cashflow reason
    const a = analyseBrrrr({ ...base, price: 80000, arv: 170000, ltvPct: 70, monthlyRent: 1000 });
    expect(a.outcomeVerdict).toBe('All money out + £3,240');
    expect(a.verdict).toBe('amber');
    expect(a.verdictCopy).toMatch(/cashflow is thin/);
  });
  it('amber when it cashflows but money stays locked in, with a price lever', () => {
    // rent £950 at 65% LTV: loan 104,000 → after-tax ≈ £119/mo, but
    // proceeds 28,000 vs 61,825 invested → £33,825 left in → AMBER
    const a = analyseBrrrr({ ...base, monthlyRent: 950, ltvPct: 65 });
    expect(a.verdict).toBe('amber');
    expect(a.verdictCopy).toMatch(/stays locked in/);
    expect(a.lever).toMatch(/lower purchase price/);
  });
  it('green when the numbers genuinely work, with infinite-return wording', () => {
    // price 80,000, ARV 170,000, 70% LTV, rent 1,100:
    // invested: dep 24,000... bridge 60,000, dep 20,000 + arr 1,200 + int 3,060
    //   + SDLT 4,000 + legals 1,500 + refurb 25,000 = £54,760
    // proceeds: 119,000 − 60,000 − 1,000 = £58,000 → surplus £3,240
    // after-tax cashflow ≈ £130/mo; ICR 2.02 → GREEN
    const a = analyseBrrrr({ ...base, price: 80000, arv: 170000, ltvPct: 70, monthlyRent: 1100 });
    expect(a.outcomeVerdict).toBe('All money out + £3,240');
    expect(a.verdict).toBe('green');
    expect(a.cashflowAfterTax.value).toBeGreaterThanOrEqual(100);
    expect(a.roiOnLeftIn.value).toBeNull();
    expect(a.roiOnLeftIn.breakdown.result).toMatch(/effectively infinite/);
    expect(a.lever).toBeNull();
  });
});

describe('bisection helpers directly', () => {
  it('max price honours its own claim: all-out at the answer, not £250 above', () => {
    const p = maxPriceForAllOut(base);
    expect(p).not.toBeNull();
    const at = analyseBrrrr({ ...base, price: p as number });
    expect(at.moneyLeftIn).toBeLessThanOrEqual(1);
    const above = analyseBrrrr({ ...base, price: (p as number) + 250 });
    expect(above.moneyLeftIn).toBeGreaterThan(1);
  });
  it('ARV needed honours its claim symmetrically', () => {
    const v = arvNeededForAllOut(base);
    expect(v).not.toBeNull();
    expect(analyseBrrrr({ ...base, arv: v as number }).moneyLeftIn).toBeLessThanOrEqual(1);
    expect(analyseBrrrr({ ...base, arv: (v as number) - 250 }).moneyLeftIn).toBeGreaterThan(1);
  });
});
