import { describe, expect, it } from 'vitest';
import { analyseBtl } from './btl';
import { analyseFlip } from './flip';
import { analyseBrrrr } from './brrrr';
import { analyseHmo } from './hmo';

/**
 * S8.1 show-the-maths guarantee: EVERY figure a verdict can display comes
 * from a {value, breakdown} pair, and every breakdown must actually be filled
 * in (formula + substituted numbers + result), never an empty placeholder.
 * This is what makes "every rendered figure has an honest accordion" a
 * structural guarantee, not a hope.
 */
interface Breakdown { formula?: unknown; substituted?: unknown; result?: unknown }
type Metric = { value: unknown; breakdown?: Breakdown };

function isMetric(v: unknown): v is Metric {
  return typeof v === 'object' && v !== null && 'value' in v && 'breakdown' in v;
}

/** Walk an analysis object; assert every {value, breakdown} has a complete breakdown. */
function assertBreakdowns(analysis: object, label: string): number {
  let checked = 0;
  const walk = (node: unknown, path: string) => {
    if (isMetric(node)) {
      const b = node.breakdown as Breakdown;
      expect(b, `${label}.${path}.breakdown missing`).toBeTruthy();
      expect(String(b.formula ?? ''), `${label}.${path}.formula empty`).not.toBe('');
      expect(String(b.substituted ?? ''), `${label}.${path}.substituted empty`).not.toBe('');
      expect(String(b.result ?? ''), `${label}.${path}.result empty`).not.toBe('');
      checked += 1;
      return; // don't recurse into value/breakdown internals
    }
    if (Array.isArray(node)) node.forEach((n, i) => walk(n, `${path}[${i}]`));
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
  };
  walk(analysis, '');
  return checked;
}

const BTL = {
  price: 200000, country: 'E92000001' as const, monthlyRent: 950, depositPct: 25, ratePct: 5,
  buyingAs: 'basic' as const, selfManaged: false, voidWeeks: 5, agentPct: 12, maintPct: 1,
  insurancePerYear: 300, legals: 1500, refurb: 0, stressRatePct: 5.5, taxBasis: 'additional' as const,
  thresholds: { minCashflowGreen: 150, minRoiGreen: 8, icrBasic: 1.25, icrHigher: 1.45 },
};

describe('every verdict figure carries a complete breakdown', () => {
  it('BTL — every {value, breakdown} figure has a filled-in formula/substituted/result', () => {
    const n = assertBreakdowns(analyseBtl(BTL) as object, 'btl');
    expect(n).toBeGreaterThan(5);
  });
});

const FLIP = {
  price: 200000, country: 'E92000001' as const, refurb: 30000, gdv: 300000, funding: 'bridging' as const,
  months: 6, agentSalePctExVat: 1.2, saleLegals: 1200, flipAs: 'personal' as const, incomeBand: 'higher' as const,
  bridgeLoanPct: 75, bridgeRatePctMonth: 0.85, arrangementPct: 2, exitPct: 0, legals: 1500, contingencyPct: 10,
  taxBasis: 'additional' as const, thresholds: { greenRoi: 20, greenProfit: 25000, amberRoi: 10 },
};
const BRRRR = {
  price: 150000, country: 'E92000001' as const, refurb: 30000, arv: 220000, funding: 'bridging' as const,
  bridgeMonths: 6, monthlyRent: 1100, ltvPct: 75, buyingAs: 'basic' as const, bridgeLoanPct: 75,
  bridgeRatePctMonth: 0.85, arrangementPct: 2, exitPct: 0, legals: 1500, refiLegals: 1000, voidWeeks: 5,
  agentPct: 12, maintPct: 1, insurancePerYear: 300, refiRatePct: 5.5, stressRatePct: 5.5, taxBasis: 'additional' as const,
  thresholds: { allOutMax: 0, minCashflowGreen: 100, icrBasic: 1.25, icrHigher: 1.45 },
};
const HMO = {
  price: 250000, country: 'E92000001' as const, rooms: 5, roomRent: 500, billsIncluded: false, refurb: 20000,
  buyingAs: 'basic' as const, selfManaged: false, depositPct: 25, ratePct: 5, opCostPct: 25, licenceFee: 900,
  licenceYears: 5, compliancePerYear: 600, legals: 1500, stressRatePct: 5.5, taxBasis: 'additional' as const,
  roomSizeFailures: 0, thresholds: { minCashflowGreen: 150, minRoiGreen: 8, icrBasic: 1.25, icrHigher: 1.45 },
};

describe('every verdict figure carries a complete breakdown (all strategies)', () => {
  it('Flip', () => expect(assertBreakdowns(analyseFlip(FLIP) as object, 'flip')).toBeGreaterThan(4));
  it('BRRRR', () => expect(assertBreakdowns(analyseBrrrr(BRRRR) as object, 'brrrr')).toBeGreaterThan(4));
  it('HMO', () => expect(assertBreakdowns(analyseHmo(HMO) as object, 'hmo')).toBeGreaterThan(4));
});
