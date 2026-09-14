/**
 * CA1 — the area trajectory maths.
 *
 * The arithmetic is checked against figures worked by hand, never against the
 * function's own output, and the two rules that matter most — thirty sales or
 * nothing, and never a word that reads as a prediction — are asserted
 * directly.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_TRANSACTIONS,
  SCENARIO_WINDOW_YEARS,
  VARIABILITY_WINDOW_YEARS,
  annualChanges,
  compound,
  growthOver,
  historyPoints,
  ratePercentile,
  scenarioRates,
  trajectoryFor,
  variability,
  type AreaSeries,
  type TrajectoryFile,
} from './trajectory';

/** An area that doubles over ten years at exactly 10% a year (1.1^10 ≈ 2.5937). */
const steady = (rate: number, years: number, start = 100): number[] =>
  Array.from({ length: years + 1 }, (_, k) => Math.round(start * (1 + rate) ** k * 10) / 10);

const area = (over: Partial<AreaSeries> = {}): AreaSeries => ({
  n: 'Testshire', k: 'la', p: 200_000, v: 900, vTo: '2026-04', i: steady(0.05, 20), ...over,
});

const fileWith = (areas: Record<string, AreaSeries>): TrajectoryFile => ({
  schemaVersion: 1, source: 'UK House Price Index, HM Land Registry',
  licence: 'Open Government Licence v3.0', month: '2026-06', years: 21, areas,
});

describe('annual changes', () => {
  it('is a like-for-like year on year change, oldest first', () => {
    expect(annualChanges([100, 110, 99])).toEqual([0.10000000000000009, -0.09999999999999998]);
  });

  it('needs two points to say anything', () => {
    expect(annualChanges([100])).toEqual([]);
    expect(annualChanges([])).toEqual([]);
  });

  it('skips a pair it cannot divide rather than inventing a change', () => {
    expect(annualChanges([100, 0, 120])).toEqual([]);
  });
});

describe('ratePercentile', () => {
  // Worked by hand: for [1..10], rank = 9 × 0.1 = 0.9, so p10 = 1 + 0.9×(2−1) = 1.9.
  it('interpolates between the two nearest ranks', () => {
    const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(ratePercentile(ten, 0.1)).toBeCloseTo(1.9, 10);
    expect(ratePercentile(ten, 0.9)).toBeCloseTo(9.1, 10);
    expect(ratePercentile(ten, 0.5)).toBeCloseTo(5.5, 10);
  });

  it('does not care what order it is given', () => {
    expect(ratePercentile([10, 1, 5], 0.5)).toBe(5);
  });

  it('has nothing to say about an empty sample', () => {
    expect(ratePercentile([], 0.5)).toBeNull();
  });
});

describe('growth over a period', () => {
  it('cumulative and annualised agree with each other', () => {
    // 5% a year for 10 years: 1.05^10 − 1 = 62.89% cumulative, 5% annualised.
    const g = growthOver(steady(0.05, 10), 10)!;
    expect(g.cumulative.value).toBeCloseTo(0.6289, 3);
    expect(g.annualised.value).toBeCloseTo(0.05, 3);
  });

  it('refuses a period the data does not cover', () => {
    expect(growthOver(steady(0.05, 4), 5)).toBeNull();
  });

  it('shows its maths', () => {
    const g = growthOver([100, 150], 1)!;
    expect(g.cumulative.breakdown.substituted).toBe('150 ÷ 100 − 1');
    expect(g.cumulative.breakdown.result).toBe('50.0%');
  });
});

describe('variability', () => {
  it('reports the worst year, the best year and how many fell', () => {
    const v = variability([0.1, -0.15, 0.02, -0.01, 0.2], 20)!;
    expect(v.worst).toBeCloseTo(-0.15, 10);
    expect(v.best).toBeCloseTo(0.2, 10);
    expect(v.fellCount).toBe(2);
    expect(v.years).toBe(5);
  });

  it('says nothing from fewer than three years', () => {
    expect(variability([0.1, 0.2], 20)).toBeNull();
  });

  /**
   * The window matters more than the numbers. Ten years of English data
   * contains no falling year at all, so a ten-year window would make every
   * area look like it has never fallen — see the note on the constant.
   */
  it('looks over twenty years, not ten', () => {
    expect(VARIABILITY_WINDOW_YEARS).toBe(20);
    const changes = [-0.149, ...Array.from({ length: 15 }, () => 0.05)];
    expect(variability(changes, 10)!.worst).toBeCloseTo(0.05, 10);
    expect(variability(changes, VARIABILITY_WINDOW_YEARS)!.worst).toBeCloseTo(-0.149, 10);
  });
});

describe('the three scenario rates', () => {
  it('are taken from the area\'s own last ten years', () => {
    const r = scenarioRates(steady(0.05, 20))!;
    expect(r.years).toBe(SCENARIO_WINDOW_YEARS);
    expect(r.central).toBeCloseTo(0.05, 2);
    expect(r.low).toBeCloseTo(0.05, 2);
    expect(r.high).toBeCloseTo(0.05, 2);
  });

  it('spread apart when the area itself was uneven', () => {
    const bumpy = [100, 90, 120, 95, 130, 100, 140, 110, 150, 120, 160];
    const r = scenarioRates(bumpy)!;
    expect(r.low).toBeLessThan(r.high);
  });

  it('says nothing from too little history', () => {
    expect(scenarioRates([100, 105, 110])).toBeNull();
  });
});

describe('compounding a price forward', () => {
  it('is plain compound arithmetic', () => {
    // £200,000 at 4% for 5 years = 200000 × 1.04^5 = £243,331.
    expect(compound(200_000, 0.04, 5).value).toBeCloseTo(243_330.58, 2);
  });

  it('shows its maths, and its note calls it an assumption', () => {
    const c = compound(200_000, 0.04, 5);
    expect(c.breakdown.formula).toBe('price × (1 + rate) ^ years');
    expect(c.breakdown.substituted).toBe('£200,000 × (1 + 4.0%) ^ 5');
    expect(c.breakdown.result).toBe('£243,331');
    expect(c.breakdown.note).toMatch(/assumption, not a prediction/);
  });

  it('falls when the rate is negative — prices can go down', () => {
    expect(compound(200_000, -0.03, 5).value).toBeLessThan(200_000);
  });
});

describe('thirty sales or nothing', () => {
  const codes = { la: 'LA1', region: 'RG1', country: 'E92000001' };

  it('never quotes a thin area\'s own trend', () => {
    const t = trajectoryFor(fileWith({
      LA1: area({ n: 'Thinshire', v: MIN_TRANSACTIONS - 1 }),
      RG1: area({ n: 'Region', k: 'region', v: 50_000 }),
      E92000001: area({ n: 'England', k: 'country', v: 500_000 }),
    }), codes, 200_000)!;
    expect(t.subject.name).not.toBe('Thinshire');
  });

  it('falls back to the region, and SAYS which area it could not use', () => {
    const t = trajectoryFor(fileWith({
      LA1: area({ n: 'Thinshire', v: 4 }),
      RG1: area({ n: 'Region', k: 'region', v: 50_000 }),
    }), codes, 200_000)!;
    expect(t.subject.name).toBe('Region');
    expect(t.subject.kind).toBe('region');
    expect(t.fellBackFrom).toEqual({ name: 'Thinshire', sales: 4 });
  });

  it('withholds entirely when there is nothing wider to fall back to', () => {
    const t = trajectoryFor(fileWith({ LA1: area({ v: MIN_TRANSACTIONS - 1 }) }), codes, 200_000)!;
    expect(t.scenarios).toBeNull();
    expect(t.withheld).toBe('too-few-sales');
  });

  it('says nothing about a fallback when none happened', () => {
    const t = trajectoryFor(fileWith({ LA1: area() }), codes, 200_000)!;
    expect(t.fellBackFrom).toBeNull();
  });

  it('shows the scenarios at exactly the floor', () => {
    const t = trajectoryFor(fileWith({ LA1: area({ v: MIN_TRANSACTIONS }) }), codes, 200_000)!;
    expect(t.withheld).toBeNull();
    expect(t.scenarios).not.toBeNull();
  });

  it('withholds when the sales count is unknown — never assumes enough', () => {
    const t = trajectoryFor(fileWith({ LA1: area({ v: null, vTo: null }) }), codes, 200_000)!;
    expect(t.subject.enoughSales).toBe(false);
    expect(t.scenarios).toBeNull();
  });
});

describe('the trajectory as the panel receives it', () => {
  const codes = { la: 'LA1', region: 'RG1', country: 'E92000001' };
  const full = () => trajectoryFor(fileWith({
    LA1: area(),
    RG1: area({ n: 'Region', k: 'region', v: 50_000 }),
    E92000001: area({ n: 'England', k: 'country', v: 500_000 }),
  }), codes, 250_000)!;

  it('carries the area, its region and its country for comparison', () => {
    const t = full();
    expect(t.subject.name).toBe('Testshire');
    expect(t.region?.name).toBe('Region');
    expect(t.country?.name).toBe('England');
  });

  it('offers five and ten year bands, each with three scenarios', () => {
    const t = full();
    expect(Object.keys(t.scenarios!.bands)).toEqual(['5', '10']);
    expect(t.scenarios!.bands[5].map((b) => b.key)).toEqual(['low', 'central', 'high']);
  });

  it('compounds from the DEAL\'s price, not the area average', () => {
    const t = full();
    expect(t.scenarios!.bands[5][1].end.breakdown.substituted).toContain('£250,000');
  });

  it('falls back to the area average when the deal has no price', () => {
    const t = trajectoryFor(fileWith({ LA1: area() }), codes, null)!;
    expect(t.scenarios!.bands[5][1].end.breakdown.substituted).toContain('£200,000');
  });

  it('the ten-year band is always wider than the five-year one', () => {
    const t = full();
    const width = (h: 5 | 10) => t.scenarios!.bands[h][2].end.value - t.scenarios!.bands[h][0].end.value;
    expect(width(10)).toBeGreaterThan(width(5));
  });

  it('has nothing to say about an area it does not hold', () => {
    expect(trajectoryFor(fileWith({}), codes, 200_000)).toBeNull();
  });
});

describe('the history line', () => {
  it('is rebased to 100 at the start, one point a year, ending at now', () => {
    const pts = historyPoints([50, 75, 100]);
    expect(pts.map((p) => p.value)).toEqual([100, 150, 200]);
    expect(pts.map((p) => p.year)).toEqual([-2, -1, 0]);
  });

  it('draws nothing from nothing', () => {
    expect(historyPoints([])).toEqual([]);
    expect(historyPoints([0, 100])).toEqual([]);
  });
});

/**
 * THE WORDS. Every breakdown this module produces is shown to a person, so the
 * ban on forecast language applies here as much as to the copy config.
 */
describe('nothing this module writes reads as a prediction', () => {
  const BANNED = /\b(forecast|predict|projected|projection|expected|will be)\b/i;

  it('no breakdown string uses a forecast word', () => {
    const t = trajectoryFor(fileWith({ LA1: area() }), { la: 'LA1', region: null, country: null }, 250_000)!;
    const strings: string[] = [];
    for (const g of Object.values(t.subject.growth)) {
      strings.push(...Object.values(g.cumulative.breakdown), ...Object.values(g.annualised.breakdown));
    }
    for (const h of [5, 10] as const) {
      for (const b of t.scenarios!.bands[h]) strings.push(...Object.values(b.end.breakdown));
    }
    const offenders = strings.filter((s) => BANNED.test(s));
    expect(offenders, `these read as predictions: ${offenders.join(' / ')}`).toEqual([]);
  });
});
