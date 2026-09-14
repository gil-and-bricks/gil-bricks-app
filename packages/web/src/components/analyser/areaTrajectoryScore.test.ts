/**
 * CA1 — THE DEAL SCORE IS BYTE-IDENTICAL WITH THE AREA PANEL ON AND OFF.
 *
 * This is the sprint's hard rule, and it is the one worth a test of its own.
 * The Deal Score is the number the whole product rests on, and it is built only
 * on evidence: what the property costs, what it earns, and what the sector's
 * own sold prices say. A scenario — an "if it repeated itself" figure — inside
 * that number would corrupt it, and would corrupt it invisibly.
 *
 * TWO PROOFS, because either alone is weak.
 *
 *  1. BEHAVIOURAL. Score four real deals, one per strategy, with
 *     `features.areaTrajectory` forced ON and forced OFF, and compare the whole
 *     returned object — not the score alone. Forced, never read off the
 *     committed default, because the flags-off gate rewrites features.ts on
 *     disk while it runs and a test that read the default would silently
 *     compare a state to itself.
 *
 *  2. STRUCTURAL. `scoreDeal` is a pure function of (strategy, inputs,
 *     evidence, customKeys). So the behavioural test above would still pass if
 *     somebody wired the panel in through a field this test does not happen to
 *     set. The second half therefore asserts the boundary itself: the core
 *     scoring module imports nothing from the area module, and no strategy
 *     scores a dimension the area panel could reach.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { scoreDeal, strategies, type StrategyId } from '@gil-bricks/core';
import { features } from '../../config/features';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));

/** One real deal per strategy — the same inputs the strategy tests use. */
const DEALS: Record<StrategyId, Record<string, unknown>> = {
  btl: {
    price: 150000, country: 'E92000001', monthlyRent: 1100, depositPct: 25, ratePct: 5,
    buyingAs: 'basic', selfManaged: false, voidWeeks: 5, agentPct: 12, maintPct: 1,
    insurancePerYear: 300, legals: 1500, refurb: 0, stressRatePct: 5.5, taxBasis: 'additional',
  },
  flip: {
    price: 150000, country: 'E92000001', refurb: 30000, gdv: 260000, funding: 'bridging',
    months: 6, agentSalePctExVat: 1.2, saleLegals: 1200, flipAs: 'personal', incomeBand: 'basic',
    bridgeLoanPct: 75, bridgeRatePctMonth: 0.85, arrangementPct: 2, exitPct: 0, legals: 1500,
    contingencyPct: 10, taxBasis: 'additional',
  },
  brrrr: {
    price: 120000, country: 'E92000001', refurb: 30000, arv: 220000, funding: 'bridging',
    bridgeMonths: 6, monthlyRent: 1250, ltvPct: 75, buyingAs: 'basic', selfManaged: false,
    bridgeLoanPct: 75, bridgeRatePctMonth: 0.85, arrangementPct: 2, exitPct: 0, legals: 1500,
    refiLegals: 1000, voidWeeks: 5, agentPct: 12, maintPct: 1, insurancePerYear: 300,
    refiRatePct: 5.5, stressRatePct: 5.5, taxBasis: 'additional',
  },
  hmo: {
    price: 250000, country: 'E92000001', rooms: 6, roomRent: 650, billsIncluded: false,
    refurb: 20000, buyingAs: 'basic', selfManaged: false, depositPct: 25, ratePct: 5,
    opCostPct: 25, licenceFee: 900, licenceYears: 5, compliancePerYear: 600, legals: 1500,
    stressRatePct: 5.5, taxBasis: 'additional', roomSizeFailures: 0,
  },
};

const inputsFor = (id: StrategyId): Record<string, unknown> => {
  const config = strategies.find((s) => s.id === id);
  if (!config) throw new Error(`no config for ${id}`);
  return { ...DEALS[id], thresholds: config.thresholds };
};

/** Score with the flag FORCED to a state, then put the flag back. */
function scoreWithFlag(id: StrategyId, on: boolean) {
  const kept = features.areaTrajectory;
  try {
    features.areaTrajectory = on;
    return scoreDeal(id, inputsFor(id) as never, { estimate: 165_000, high: 185_000 });
  } finally {
    features.areaTrajectory = kept;
  }
}

describe('the Deal Score is byte-identical with the area panel on and off', () => {
  it.each(['btl', 'flip', 'brrrr', 'hmo'] as const)('%s scores the same either way', (id) => {
    const on = scoreWithFlag(id, true);
    const off = scoreWithFlag(id, false);
    // The WHOLE object, not just the number: points, verdict, headline, the
    // binding constraint and every component.
    expect(JSON.stringify(off)).toBe(JSON.stringify(on));
  });

  /**
   * NON-VACUITY. The comparison above proves nothing unless the thing being
   * compared can move at all. This changes a real input and insists the score
   * changes with it — so a future scoreDeal that returned a constant could not
   * make this file pass.
   */
  it.each(['btl', 'flip', 'brrrr', 'hmo'] as const)('%s: and the score is capable of moving', (id) => {
    const base = scoreDeal(id, inputsFor(id) as never, { estimate: 165_000, high: 185_000 });
    const dearer = scoreDeal(id, { ...inputsFor(id), price: 400_000 } as never, { estimate: 165_000, high: 185_000 });
    expect(JSON.stringify(dearer)).not.toBe(JSON.stringify(base));
  });
});

describe('the area panel is not wired into the score at all', () => {
  /**
   * CODE, NOT COMMENTS. These files talk ABOUT the Deal Score at length in
   * their headers — that is the documentation working. A grep that counted
   * those would fail on a file that is doing exactly the right thing, so the
   * comments come out first and only real code is searched.
   */
  const stripComments = (src: string): string => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const read = (p: string): string => stripComments(readFileSync(join(REPO, p), 'utf8'));

  /**
   * The scoring engine must not so much as import the area module. A behavioural
   * test can only prove the inputs it happens to set; this proves the boundary.
   */
  it('the scoring engine imports nothing from the area module', () => {
    const score = read('packages/core/src/score/scoreDeal.ts');
    expect(score).not.toMatch(/from '\.\.\/area/);
    expect(score).not.toMatch(/trajectory/i);
  });

  it('no strategy calculator imports the area module either', () => {
    for (const f of ['btl', 'brrrr', 'flip', 'hmo']) {
      const src = read(`packages/core/src/strategy-calc/${f}.ts`);
      expect(src, `${f} must not see the area trajectory`).not.toMatch(/area\/trajectory|trajectoryFor/);
    }
  });

  /**
   * And the panel must not hand anything to the scorer. The component is
   * allowed to READ the deal's price — it compounds from it — but it must never
   * write a strategy field, which is the one route a number takes into a score.
   */
  it('the panel writes no strategy parameter', () => {
    const panel = read('packages/web/src/components/analyser/AreaTrajectory.tsx');
    expect(panel).not.toMatch(/updateStrategy|strategyParams\.value\s*=/);
    expect(panel).not.toMatch(/scoreDeal/);
  });

  it('and the four islands pass it nothing but the sector and the price', () => {
    for (const f of ['Btl', 'Brrrr', 'Flip', 'Hmo']) {
      const src = read(`packages/web/src/components/analyser/${f}Verdict.tsx`);
      const use = /<AreaTrajectoryPanel([\s\S]*?)\/>/.exec(src);
      expect(use, `${f} should render the panel`).not.toBeNull();
      const props = (use?.[1] ?? '').match(/(\w+)=/g) ?? [];
      expect(props.sort()).toEqual(['price=', 'sector=']);
    }
  });
});
