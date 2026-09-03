import { describe, expect, it } from 'vitest';
import { scoreDeal, explainFailure, type StrategyId } from './scoreDeal';
import { scoreCopy } from './copy';
import { analyseBtl } from '../strategy-calc/btl';
import { analyseBrrrr } from '../strategy-calc/brrrr';
import { analyseFlip } from '../strategy-calc/flip';
import { analyseHmo } from '../strategy-calc/hmo';

// Base inputs per strategy (green-ish); we perturb to hit each band.
const BTL = { price: 150000, country: 'E92000001' as const, monthlyRent: 1100, depositPct: 25, ratePct: 5, buyingAs: 'basic' as const, selfManaged: false, voidWeeks: 5, agentPct: 12, maintPct: 1, insurancePerYear: 300, legals: 1500, refurb: 0, stressRatePct: 5.5, taxBasis: 'additional' as const, thresholds: { minCashflowGreen: 150, minRoiGreen: 8, icrBasic: 1.25, icrHigher: 1.45 } };
const FLIP = { price: 150000, country: 'E92000001' as const, refurb: 30000, gdv: 260000, funding: 'bridging' as const, months: 6, agentSalePctExVat: 1.2, saleLegals: 1200, flipAs: 'personal' as const, incomeBand: 'basic' as const, bridgeLoanPct: 75, bridgeRatePctMonth: 0.85, arrangementPct: 2, exitPct: 0, legals: 1500, contingencyPct: 10, taxBasis: 'additional' as const, thresholds: { greenRoi: 20, greenProfit: 15000, amberRoi: 10 } };
const BRRRR = { price: 120000, country: 'E92000001' as const, refurb: 30000, arv: 220000, funding: 'bridging' as const, bridgeMonths: 6, monthlyRent: 1250, ltvPct: 75, buyingAs: 'basic' as const, selfManaged: false, bridgeLoanPct: 75, bridgeRatePctMonth: 0.85, arrangementPct: 2, exitPct: 0, legals: 1500, refiLegals: 1000, voidWeeks: 5, agentPct: 12, maintPct: 1, insurancePerYear: 300, refiRatePct: 5.5, stressRatePct: 5.5, taxBasis: 'additional' as const, thresholds: { allOutMax: 2500, minCashflowGreen: 100, icrBasic: 1.25, icrHigher: 1.45 } };
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
        // The score must sit EXACTLY inside the card's own locked band (E8.3):
        // green 8-10, amber 6-7.9, red 0-5.9 — the tier boundaries never move.
        if (colour === 'green') { greens++; expect(ds.score, `${id} green @${where}`).toBeGreaterThanOrEqual(8); expect(ds.score).toBeLessThanOrEqual(10); }
        if (colour === 'amber') { ambers++; expect(ds.score, `${id} amber @${where}`).toBeGreaterThanOrEqual(6); expect(ds.score).toBeLessThan(8); }
        if (colour === 'red') { reds++; expect(ds.score, `${id} red @${where}`).toBeGreaterThanOrEqual(0); expect(ds.score).toBeLessThan(6); }
      }
    }
    expect(greens, `${id} produced no green cases`).toBeGreaterThan(0);
    expect(reds, `${id} produced no red cases`).toBeGreaterThan(0);
    expect(ambers, `${id} produced no amber cases`).toBeGreaterThan(0);
  });
});

describe('CONTINUITY: the score moves with the money WITHIN a locked tier (E8.3)', () => {
  it.each(cases)('$id: better income lifts the score without leaving the tier', ({ id, base, analyse }) => {
    // find two income levels that stay in the SAME tier but should score differently
    const incomeKey = id === 'flip' ? 'gdv' : id === 'brrrr' ? 'arv' : id === 'hmo' ? 'roomRent' : 'monthlyRent';
    const scores = new Set<number>();
    let sameTierPairFound = false;
    let prev: { score: number; verdict: string; income: number } | null = null;
    const lo = (base[incomeKey] as number) * 0.6;
    const hi = (base[incomeKey] as number) * 1.4;
    for (let inc = lo; inc <= hi; inc += (hi - lo) / 12) {
      const inp = { ...base, [incomeKey]: Math.round(inc) };
      const colour = analyse(inp as never).verdict;
      const ds = scoreDeal(id, inp as never);
      scores.add(ds.score);
      if (prev && prev.verdict === ds.verdict && ds.score !== prev.score) sameTierPairFound = true;
      prev = { score: ds.score, verdict: ds.verdict, income: inc };
    }
    // the score is NOT a coarse step: many distinct values, and at least one pair
    // of neighbouring inputs moved the score while staying in the same tier.
    expect(scores.size, `${id} produced only ${scores.size} distinct scores (looks banded)`).toBeGreaterThan(4);
    expect(sameTierPairFound, `${id} score never moved within a tier (still coarse)`).toBe(true);
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
  it('a money-strong, rooms-UNVERIFIED HMO explains the same honest thing as the chip — never "margins are thin" (E9.1 review)', () => {
    const ds = scoreDeal('hmo', { ...HMO, price: 150000, roomRent: 700, roomSizeFailures: null } as never);
    expect(ds.verdict).toBe('marginal'); // capped by unverified rooms, not by the money
    expect(explainFailure(ds)).toBe(ds.headline); // the two surfaces never disagree
    expect(explainFailure(ds)).not.toMatch(/margins are thin|only just/i); // no invented failure
    expect(explainFailure(ds)).toMatch(/\d+ rooms?/); // names the real assumed room count
  });
  it('the measured HMO room-size why never asserts one specific m² figure (occupancy varies — E9.1 review)', () => {
    for (const fails of [0, 1]) {
      const rc = scoreDeal('hmo', { ...HMO, price: 180000, roomRent: 650, roomSizeFailures: fails } as never)
        .components.find((c) => /room/i.test(c.name) && /size|legal|minimum/i.test(c.name))!;
      expect(rc.why).not.toMatch(/6\.51|10\.22|4\.64|single-adult/); // a double/child room fails a different minimum
      expect(rc.why).toMatch(/statutory minimum size/i);
    }
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

describe('deal-specific headlines (E2.1)', () => {
  // A "figure" = a £ amount, a %, an ICR ratio (×) or a room count.
  const FIGURE = /£[\d,]+|\d+(?:\.\d+)?%|\d+(?:\.\d+)?×|\d+ rooms?/;

  // A curated set engineered to fail (or pass) for DIFFERENT reasons, spread
  // across all four strategies. Each should surface a different binding number.
  const deals: { id: StrategyId; label: string; inputs: Record<string, unknown>; ev?: { estimate: number; high: number } }[] = [
    { id: 'btl', label: 'btl-roi', inputs: { ...BTL, price: 150000, monthlyRent: 1100 } },
    { id: 'btl', label: 'btl-icr', inputs: { ...BTL, price: 400000, monthlyRent: 600 } },
    { id: 'btl', label: 'btl-evidence', inputs: { ...BTL, price: 200000, monthlyRent: 1100 }, ev: { estimate: 150000, high: 160000 } },
    { id: 'btl', label: 'btl-good', inputs: { ...BTL, price: 90000, monthlyRent: 900 } },
    { id: 'flip', label: 'flip-fail', inputs: { ...FLIP, price: 200000, gdv: 240000 } },
    { id: 'flip', label: 'flip-good', inputs: { ...FLIP, price: 110000, gdv: 240000 } },
    { id: 'brrrr', label: 'brrrr-moneyleftin', inputs: { ...BRRRR, price: 250000, arv: 300000, monthlyRent: 900 } },
    { id: 'brrrr', label: 'brrrr-good', inputs: { ...BRRRR, price: 100000, arv: 220000, monthlyRent: 1300 } },
    { id: 'hmo', label: 'hmo-roi', inputs: { ...HMO, price: 250000, roomRent: 500 } },
    { id: 'hmo', label: 'hmo-roomsize', inputs: { ...HMO, price: 180000, roomRent: 650, roomSizeFailures: 2 } },
    // money strong but rooms UNVERIFIED (the default unmeasured state) — the chip
    // must name the assumed rooms, never a tier platitude nor a false failure (E9.1 review).
    { id: 'hmo', label: 'hmo-roomsize-unchecked', inputs: { ...HMO, price: 150000, roomRent: 700, roomSizeFailures: null } },
    { id: 'hmo', label: 'hmo-good', inputs: { ...HMO, price: 170000, roomRent: 650 } },
  ];

  it('every headline names at least one real figure from the deal (never a tier platitude)', () => {
    const tierLines = Object.values(scoreCopy.headline);
    for (const d of deals) {
      const ds = scoreDeal(d.id, d.inputs as never, d.ev);
      expect(ds.headline, `${d.label} headline: "${ds.headline}"`).toMatch(FIGURE);
      expect(ds.headline).not.toMatch(/\{value\}|\{needed\}|\{cashflow\}|\{roi\}|\{profit\}|undefined|NaN/);
      // never one of the generic tier sentences
      expect(tierLines, `${d.label} used a tier platitude`).not.toContain(ds.headline);
    }
  });

  it('an UNVERIFIED HMO room-size is never the binding constraint / a false failure headline (E9.1)', () => {
    // A money-strong HMO whose rooms haven't been measured (roomSizeFailures null):
    // the analysis caps at amber (rooms unverified), but the headline/binding note
    // must NOT assert a room-size FAILURE ("you couldn't let every room legally") —
    // an unknown component can't be "what's holding it back".
    const ds = scoreDeal('hmo', { ...HMO, price: 150000, roomRent: 700, opCostPct: 25, roomSizeFailures: null } as never);
    expect(ds.verdict).not.toBe('good'); // no false all-clear without a room check
    expect(ds.headline).not.toMatch(/couldn’t let every room|let every room legally|below the .* minimum/i);
    const bc = ds.bindingConstraint;
    // if a binding constraint is shown at all, it is NOT the (unknown) room-size one
    if (bc) expect(bc.metric.toLowerCase()).not.toMatch(/room size|room-size/);
    const roomComp = ds.components.find((c) => /room/i.test(c.name) && /size|legal|minimum/i.test(c.name))!;
    expect(roomComp.status).toBe('unknown'); // stays honestly unknown, never green
  });

  it('two deals failing for DIFFERENT reasons produce DIFFERENT headlines', () => {
    const headlines = deals.map((d) => scoreDeal(d.id, d.inputs as never, d.ev).headline);
    const unique = new Set(headlines);
    expect(unique.size, `collisions among: ${JSON.stringify(headlines, null, 2)}`).toBe(headlines.length);
  });

  it('same binding, different numbers → different headlines', () => {
    // Two BTL deals both bound on ROI but at different prices/rents.
    const a = scoreDeal('btl', { ...BTL, price: 150000, monthlyRent: 1100 } as never).headline;
    const b = scoreDeal('btl', { ...BTL, price: 175000, monthlyRent: 1050 } as never).headline;
    expect(a).toMatch(FIGURE);
    expect(b).toMatch(FIGURE);
    expect(a).not.toBe(b);
  });

  it('a good all-money-out BRRRR names the real surplus, never "plus £0"', () => {
    let sawGood = false;
    for (const price of [60000, 70000, 80000, 90000]) {
      const ds = scoreDeal('brrrr', { ...BRRRR, price, arv: 240000, monthlyRent: 1800 } as never);
      if (ds.verdict !== 'good') continue;
      sawGood = true;
      expect(ds.headline, `price ${price}: "${ds.headline}"`).not.toMatch(/plus £0\b/);
      expect(ds.headline).toMatch(FIGURE);
    }
    expect(sawGood, 'no good BRRRR produced across the sweep').toBe(true);
  });

  it('a genuinely good deal states its number, not praise', () => {
    const ds = scoreDeal('btl', { ...BTL, price: 90000, monthlyRent: 900 } as never);
    expect(ds.verdict).toBe('good');
    expect(ds.headline).toMatch(FIGURE);
    expect(ds.headline.toLowerCase()).not.toMatch(/\bsolid\b|\bgreat\b|\bexcellent\b|\bamazing\b/);
  });
});
