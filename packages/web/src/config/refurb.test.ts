/**
 * THE REFURB SECTION'S CONTRACT (R1) — the promises the operator was given.
 *
 * The load-bearing one is the last describe: this product must never ship a
 * refurb price nobody wrote. A figure appearing here without the operator
 * putting it there is the failure this file exists to catch.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REFURB, REFURB_ITEMS, paramFor } from './refurb';
import { LABOUR_FACTORS, REFURB_FIGURES, REGION_MULTIPLIERS, FIGURES_REVIEWED, FIGURES_INCLUDE_VAT, figureFor, hasAnyFigure, suggestionsReady } from './refurbFigures';
import { LABOUR_OPTIONS, DEFAULT_LABOUR } from './refurb';
import { REGION_IDS } from '@gil-bricks/core';
import { REGION_LABELS, labelsCoverEveryRegion } from './regions';
import { ANALYSER_SECTIONS } from './analyserSections';
import { strategies } from '@gil-bricks/core';

const read = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

describe('the items', () => {
  it('covers the big-ticket list the operator asked for', () => {
    const labels = REFURB_ITEMS.map((i) => i.label.toLowerCase()).join(' | ');
    for (const wanted of ['rewire', 'plumbing', 'boiler', 'kitchen', 'bathroom', 'windows', 'roof',
      'plastering', 'flooring', 'damp', 'rip-out', 'garden', 'decoration', 'anything else']) {
      expect(labels, wanted).toContain(wanted);
    }
  });

  it('every key is unique, and so is every param it writes', () => {
    const keys = REFURB_ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    const params = REFURB_ITEMS.map((i) => paramFor(i.key));
    expect(new Set(params).size).toBe(params.length);
  });

  it('no item param can collide with a strategy field — the URL would fight itself', () => {
    const fieldKeys = new Set(strategies.flatMap((s) => [...s.strategyInputs, ...s.assumptions]).map((f) => f.key));
    for (const item of REFURB_ITEMS) expect(fieldKeys.has(paramFor(item.key)), item.key).toBe(false);
  });

  it('drives the field the Deal Score actually reads', () => {
    expect(REFURB.fieldKey).toBe('refurbCost');
    // and every strategy really does have that field to be driven
    for (const s of strategies) {
      const all = [...s.strategyInputs, ...s.assumptions].map((f) => f.key);
      expect(all, s.id).toContain(REFURB.fieldKey);
    }
  });
});

describe('the section sits before the verdict', () => {
  it('its chip is after the inputs and BEFORE the verdict in the strip', () => {
    const ids = ANALYSER_SECTIONS.map((s) => s.id);
    expect(ids).toContain(REFURB.sectionId);
    expect(ids.indexOf(REFURB.sectionId)).toBeGreaterThan(ids.indexOf('sec-inputs'));
    expect(ids.indexOf(REFURB.sectionId)).toBeLessThan(ids.indexOf('sec-verdict'));
  });

  it('and the page renders it there too, in all four verdicts', () => {
    for (const f of ['BtlVerdict', 'FlipVerdict', 'BrrrrVerdict', 'HmoVerdict']) {
      const src = read(`../components/analyser/${f}.tsx`);
      const refurbAt = src.indexOf('<RefurbSection');
      const inputsAt = src.indexOf('<StrategyInputs');
      const verdictAt = src.indexOf('id="sec-verdict"');
      expect(refurbAt, f).toBeGreaterThan(-1);
      expect(refurbAt, f).toBeGreaterThan(inputsAt);
      expect(verdictAt, f).toBeGreaterThan(refurbAt);
    }
  });
});

describe('the old Light / Moderate / Heavy is gone, not kept alongside', () => {
  it('no dropdown, no labels, no state field', () => {
    expect(read('../components/analyser/SubjectForm.tsx')).not.toContain('f-refurb');
    expect(read('./analyserForm.ts')).not.toContain('Refurb needed');
    const state = read('../components/analyser/state.ts');
    expect(state).not.toContain("'light' | 'moderate'");
  });

  it('an old link still parses — its level is simply ignored', () => {
    // the adjective never produced a number, so nothing to carry but the figure
    expect(read('../components/analyser/state.ts')).toContain('legacyRefurbLevel');
  });
});

describe('THE FIGURES ARE THE OPERATOR\u2019S, AND THEY ARE COMPLETE', () => {
  it('every item has a figure, except the one that is user-entered by design', () => {
    for (const item of REFURB_ITEMS) {
      const spec = REFURB_FIGURES[item.key];
      expect(spec, item.key).toBeDefined();
      if (item.key === 'other') {
        expect(spec.mid, 'other is whatever the person types').toBeNull();
        continue;
      }
      if (item.driver === 'beds') {
        const bands = Object.values(spec.bands ?? {});
        expect(bands.length, item.key).toBeGreaterThan(0);
        for (const b of bands) expect(b.mid, item.key).toBeGreaterThan(0);
      } else {
        expect(spec.mid, item.key).toBeGreaterThan(0);
      }
    }
  });

  it('every figure carries a range, and low < mid < high', () => {
    const check = (b: { low: number | null; mid: number | null; high: number | null }, what: string): void => {
      expect(b.low, `${what}.low`).toBeGreaterThan(0);
      expect(b.high, `${what}.high`).toBeGreaterThan(0);
      expect(Number(b.low), what).toBeLessThan(Number(b.mid));
      expect(Number(b.mid), what).toBeLessThan(Number(b.high));
    };
    for (const [key, spec] of Object.entries(REFURB_FIGURES)) {
      if (key === 'other') continue;
      if (spec.bands) for (const [bk, b] of Object.entries(spec.bands)) check(b, `${key}.${bk}`);
      else check(spec, key);
    }
  });

  it('the baseline region is 1.0 and every region is multiplied', () => {
    expect(REGION_MULTIPLIERS['south-west']).toBe(1);
    for (const [k, v] of Object.entries(REGION_MULTIPLIERS)) {
      expect(v, `region ${k}`).toBeGreaterThan(0);
      expect(v, `region ${k}`).toBeLessThan(2);
    }
    // London dearest, North East cheapest — a sanity check on the ordering
    const vals = Object.values(REGION_MULTIPLIERS) as number[];
    expect(REGION_MULTIPLIERS.london).toBe(Math.max(...vals));
    expect(REGION_MULTIPLIERS['north-east']).toBe(Math.min(...vals));
  });

  it('the labour factors move in the directions the config says they must', () => {
    const f = LABOUR_FACTORS as Record<string, number>;
    expect(f.builder, 'builder is the baseline the figures are written at').toBe(1);
    expect(f.mainContractor).toBeGreaterThan(f.builder);
    expect(f.tradesDirect).toBeLessThan(f.builder);
    expect(f.diy).toBeLessThan(f.tradesDirect);
  });

  it('the compile date and the VAT basis are both stated', () => {
    expect(FIGURES_REVIEWED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof FIGURES_INCLUDE_VAT).toBe('boolean');
  });

  it('so the feature is ready, and every row can offer something', () => {
    expect(suggestionsReady()).toBe(true);
    expect(hasAnyFigure()).toBe(true);
    for (const item of REFURB_ITEMS) {
      if (item.key === 'other' || item.driver === 'beds') continue;
      expect(figureFor(item.key), item.key).toBeGreaterThan(0);
    }
  });

  it('the provenance is recorded beside the figures, in terms a future reader cannot miss', () => {
    const src = read('./refurbFigures.ts');
    const said = src.toLowerCase();
    // what they are
    for (const source of ['checkatrade', 'mybuilder', 'myjobquote', 'fmb']) {
      expect(said, source).toContain(source);
    }
    // and what they are NOT — the warning the operator asked for
    expect(said).toContain('commercial cost guides');
    expect(said).toContain('incentive');
    expect(said).toContain('not a survey');
    expect(said).toMatch(/ai/);
  });
});

/**
 * THE RANGE HAS TO STAY HONEST.
 *
 * The research says the real spread on a refurb is ±30-40%. Summing a low
 * column and a high column is LINEAR, so the total's spread is the mid-weighted
 * average of the item spreads — it does not compress. This guards that: if
 * somebody ever narrows an item's range, a realistic basket stops clearing ±30%
 * and this fails, because at that point the page would be claiming a confidence
 * it has not got.
 */
describe('the total range never claims more confidence than the figures have', () => {
  const bandOf = (key: string, beds = '3', sqm = 90, count = 3) => {
    const spec = REFURB_FIGURES[key];
    const item = REFURB_ITEMS.find((i) => i.key === key);
    if (item?.driver === 'beds') return spec.bands?.[beds];
    const qty = item?.driver === 'perSqm' ? sqm : item?.driver === 'perUnit' ? count : 1;
    return { low: Number(spec.low) * qty, mid: Number(spec.mid) * qty, high: Number(spec.high) * qty };
  };
  const spreadOf = (keys: string[]): { down: number; up: number } => {
    let lo = 0; let mid = 0; let hi = 0;
    for (const k of keys) {
      const b = bandOf(k);
      lo += Number(b?.low); mid += Number(b?.mid); hi += Number(b?.high);
    }
    return { down: (lo / mid - 1) * 100, up: (hi / mid - 1) * 100 };
  };

  const BASKETS: [string, string[]][] = [
    ['a full refurb', REFURB_ITEMS.map((i) => i.key).filter((k) => k !== 'other')],
    ['a light refurb', ['kitchen', 'bathroom', 'decoration', 'flooring']],
    ['the worked example', ['rewire', 'kitchen', 'bathroom', 'plastering']],
    // deliberately the three TIGHTEST items — if any basket fails, it is this one
    ['the tightest basket there is', ['rewire', 'flooring', 'plastering']],
  ];

  for (const [name, keys] of BASKETS) {
    it(`${name} still spreads at least 30% below the mid-point`, () => {
      expect(spreadOf(keys).down).toBeLessThanOrEqual(-30);
    });
    it(`${name} still spreads at least 30% above it`, () => {
      expect(spreadOf(keys).up).toBeGreaterThanOrEqual(30);
    });
  }

  it('and the upside is wider than the downside — overruns are not symmetric', () => {
    const s = spreadOf(['rewire', 'kitchen', 'bathroom', 'plastering']);
    expect(s.up).toBeGreaterThan(Math.abs(s.down));
  });
});

describe('R2 — region, labour and the shape the research must arrive in', () => {
  it('every region has a multiplier slot and a label', () => {
    expect(Object.keys(REGION_MULTIPLIERS).sort()).toEqual([...REGION_IDS].sort());
    expect(labelsCoverEveryRegion()).toBe(true);
    expect(Object.keys(REGION_LABELS).sort()).toEqual([...REGION_IDS].sort());
  });

  it('every labour option has a factor slot, and the default is the builder baseline', () => {
    expect(Object.keys(LABOUR_FACTORS).sort()).toEqual(LABOUR_OPTIONS.map((o) => o.id).sort());
    expect(LABOUR_OPTIONS.map((o) => o.id)).toContain(DEFAULT_LABOUR);
    expect(DEFAULT_LABOUR).toBe('builder');
  });

  it('the DIY option says out loud what it leaves out', () => {
    const diy = LABOUR_OPTIONS.find((o) => o.id === 'diy');
    expect(diy?.note.toLowerCase()).toContain('free');
  });

  it('every item declares how it scales, and the sized ones are sized', () => {
    const driverOf = (k: string) => REFURB_ITEMS.find((i) => i.key === k)?.driver;
    expect(driverOf('flooring')).toBe('perSqm');
    expect(driverOf('plastering')).toBe('perSqm');
    expect(driverOf('rewire')).toBe('beds');
    expect(driverOf('windows')).toBe('perUnit');
    for (const i of REFURB_ITEMS) expect(['flat', 'perSqm', 'beds', 'perUnit'], i.key).toContain(i.driver);
  });

  it('readiness needs an item AND every region AND every labour factor', () => {
    // all three are in, so the gate is open
    expect(suggestionsReady()).toBe(true);
  });
});
