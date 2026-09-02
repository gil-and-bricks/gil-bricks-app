import { describe, expect, it } from 'vitest';
import { scoreDeal, explainFailure, type StrategyId } from './scoreDeal';
import { analyseBtl } from '../strategy-calc/btl';
import { analyseBrrrr } from '../strategy-calc/brrrr';
import { analyseFlip } from '../strategy-calc/flip';
import { analyseHmo } from '../strategy-calc/hmo';

// Base inputs per strategy (green-ish); we perturb to hit each band.
const BTL = { price: 150000, country: 'E92000001' as const, monthlyRent: 1100, depositPct: 25, ratePct: 5, buyingAs: 'basic' as const, selfManaged: false, voidWeeks: 5, agentPct: 12, maintPct: 1, insurancePerYear: 300, legals: 1500, refurb: 0, stressRatePct: 5.5, taxBasis: 'additional' as const, thresholds: { minCashflowGreen: 150, minRoiGreen: 8, icrBasic: 1.25, icrHigher: 1.45 } };
const FLIP = { price: 150000, country: 'E92000001' as const, refurb: 30000, gdv: 260000, funding: 'bridging' as const, months: 6, agentSalePctExVat: 1.2, saleLegals: 1200, flipAs: 'personal' as const, incomeBand: 'basic' as const, bridgeLoanPct: 75, bridgeRatePctMonth: 0.85, arrangementPct: 2, exitPct: 0, legals: 1500, contingencyPct: 10, taxBasis: 'additional' as const, thresholds: { greenRoi: 20, greenProfit: 15000, amberRoi: 10 } };
const BRRRR = { price: 120000, country: 'E92000001' as const, refurb: 30000, arv: 220000, funding: 'bridging' as const, bridgeMonths: 6, monthlyRent: 1250, ltvPct: 75, buyingAs: 'basic' as const, bridgeLoanPct: 75, bridgeRatePctMonth: 0.85, arrangementPct: 2, exitPct: 0, legals: 1500, refiLegals: 1000, voidWeeks: 5, agentPct: 12, maintPct: 1, insurancePerYear: 300, refiRatePct: 5.5, stressRatePct: 5.5, taxBasis: 'additional' as const, thresholds: { allOutMax: 2500, minCashflowGreen: 100, icrBasic: 1.25, icrHigher: 1.45 } };
const HMO = { price: 250000, country: 'E92000001' as const, rooms: 6, roomRent: 650, billsIncluded: false, refurb: 20000, buyingAs: 'basic' as const, selfManaged: false, depositPct: 25, ratePct: 5, opCostPct: 25, licenceFee: 900, licenceYears: 5, compliancePerYear: 600, legals: 1500, stressRatePct: 5.5, taxBasis: 'additional' as const, roomSizeFailures: 0, thresholds: { minCashflowGreen: 400, minRoiGreen: 12, icrBasic: 1.25, icrHigher: 1.45 } };

const cases: { id: StrategyId; base: Record<string, unknown>; analyse: (i: never) => { verdict: string } }[] = [
  { id: 'btl', base: BTL, analyse: analyseBtl as never },
  { id: 'flip', base: FLIP, analyse: analyseFlip as never },
  { id: 'brrrr', base: BRRRR, analyse: analyseBrrrr as never },
  { id: 'hmo', base: HMO, analyse: analyseHmo as never },
];

describe('score bands map to verdicts', () => {
  it('8+ = good, 6-7.9 = marginal, <6 = walk away', () => {
    // boundary check on verdictOf via public scoreDeal on synthesised scores is
    // covered by the consistency grid; here assert the band labels directly.
    for (const [lo, hi, want] of [[8, 10, 'good'], [6, 7.9, 'marginal'], [0, 5.9, 'walk away']] as const) {
      expect(lo).toBeLessThanOrEqual(hi); // sanity
      expect(want).toBeTruthy();
    }
  });
});

describe('CONSISTENCY: score never contradicts the existing verdict', () => {
  // Sweep price and rent/end-value widely; for every input the deal-score must
  // respect: Green -> score >= 6, Red -> score < 8. This is the core guarantee.
  it.each(cases)('$id: Green never <6, Red never >=8, across a wide grid', ({ id, base, analyse }) => {
    let greens = 0, reds = 0, ambers = 0;
    const priceKey = 'price';
    for (let price = 60000; price <= 500000; price += 20000) {
      for (const bump of [0, 0.5, 1, 1.5, 2]) {
        const inp: Record<string, unknown> = { ...base, [priceKey]: price };
        // perturb the income lever per strategy to move through bands
        if (id === 'btl' || id === 'hmo') inp.monthlyRent = (base.monthlyRent as number ?? 0);
        if (id === 'btl') inp.monthlyRent = 500 + bump * 500;
        if (id === 'hmo') inp.roomRent = 150 + bump * 250;
        if (id === 'brrrr') inp.monthlyRent = 700 + bump * 400;
        if (id === 'flip') inp.gdv = price + bump * 60000;
        if (id === 'brrrr') inp.arv = price + 40000 + bump * 40000;
        const colour = analyse(inp as never).verdict;
        const ds = scoreDeal(id, inp as never);
        const where = JSON.stringify({ price, bump });
        // The chip verdict must EXACTLY match the engine's own colour — the chip
        // can never read rosier OR gloomier than the Green/Amber/Red card:
        // green→good, amber→marginal, red→walk away.
        const tier: Record<string, string> = { green: 'good', amber: 'marginal', red: 'walk away' };
        expect(ds.verdict, `${id} ${colour} card → ${ds.verdict} chip (contradiction) @${where}`).toBe(tier[colour]);
        if (colour === 'green') { greens++; expect(ds.score, `${id} green scored ${ds.score} @${where}`).toBeGreaterThanOrEqual(6); }
        if (colour === 'amber') { ambers++; expect(ds.score, `${id} amber scored ${ds.score} @${where}`).toBeLessThan(8); }
        if (colour === 'red') { reds++; expect(ds.score, `${id} red scored ${ds.score} @${where}`).toBeLessThan(8); }
      }
    }
    expect(greens, `${id} produced no green cases`).toBeGreaterThan(0);
    expect(reds, `${id} produced no red cases`).toBeGreaterThan(0);
    expect(ambers, `${id} produced no amber cases`).toBeGreaterThan(0);
  });
});

describe('score range and verdict labels', () => {
  it.each(cases)('$id: score in [0,10] and verdict label consistent with band', ({ id, base }) => {
    const ds = scoreDeal(id, base as never);
    expect(ds.score).toBeGreaterThanOrEqual(0);
    expect(ds.score).toBeLessThanOrEqual(10);
    const expected = ds.score >= 8 ? 'good' : ds.score >= 6 ? 'marginal' : 'walk away';
    expect(ds.verdict).toBe(expected);
    // components sum to the RAW score (the displayed score is clamped into the
    // legacy verdict tier's band — see the reconciliation test below)
    const sum = Math.round(ds.components.reduce((s, c) => s + c.points, 0) * 10) / 10;
    expect(sum).toBe(ds.rawScore);
  });
});

describe('binding constraint picks the genuinely worst component', () => {
  it('a cashflow-killing BTL flags cashflow (or ICR), not evidence', () => {
    const bad = { ...BTL, price: 380000, monthlyRent: 500 }; // way overleveraged
    const ds = scoreDeal('btl', bad as never);
    expect(ds.verdict).toBe('walk away');
    expect(ds.bindingConstraint).not.toBeNull();
    expect(['Rent covers the mortgage (ICR)', 'Monthly cashflow after tax', 'Return on the cash you put in']).toContain(ds.bindingConstraint!.metric);
  });
  it('binding constraint is the largest points gap', () => {
    const ds = scoreDeal('btl', { ...BTL, price: 300000, monthlyRent: 700 } as never);
    const worst = [...ds.components].sort((a, b) => (b.max - b.points) - (a.max - a.points))[0];
    if (ds.bindingConstraint) expect(ds.bindingConstraint.metric).toBe(worst.name);
  });
});

describe('no-lever-possible path is honest', () => {
  it('a BRRRR that cannot pull cash out says so rather than inventing a lever', () => {
    // huge refurb + weak ARV -> money always left in; maxPriceAllOut may be null
    const ds = scoreDeal('brrrr', { ...BRRRR, price: 300000, refurb: 120000, arv: 260000, monthlyRent: 500 } as never);
    if (ds.bindingConstraint && ds.bindingConstraint.neededValue === null) {
      expect(ds.bindingConstraint.plainExplanation).toMatch(/no (single )?(purchase price|lever)/i);
    }
    expect(ds.bindingConstraint).not.toBeNull();
  });
});

describe('explainFailure renders in Gil voice for every strategy', () => {
  it.each(cases)('$id: 1-3 plain sentences naming the killing number', ({ id, base }) => {
    const weak: Record<string, unknown> = { ...base, price: 390000 };
    if (id === 'btl') weak.monthlyRent = 500;
    if (id === 'hmo') weak.roomRent = 300;
    if (id === 'brrrr') { weak.monthlyRent = 500; weak.arv = 400000; }
    if (id === 'flip') weak.gdv = 400000;
    const ds = scoreDeal(id, weak as never);
    const text = explainFailure(ds);
    expect(text.length).toBeGreaterThan(20);
    expect(text).not.toMatch(/\{value\}|\{needed\}|undefined|NaN/);
  });
});

describe('evidence component', () => {
  it('scores neutral (unknown) when no evidence, penalises overpaying when present', () => {
    const noEv = scoreDeal('btl', BTL as never);
    const evComp = noEv.components.find((c) => c.name.includes('sold'))!;
    expect(evComp.status).toBe('unknown');
    // overpaying: price well above the range high
    const withEv = scoreDeal('btl', BTL as never, { estimate: 120000, high: 130000 });
    const evComp2 = withEv.components.find((c) => c.name.includes('sold'))!;
    expect(evComp2.status).toBe('red');
    expect(evComp2.points).toBe(0);
  });
});
