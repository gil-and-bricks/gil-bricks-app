/**
 * CA1 — WHAT THE AREA HAS DONE, and what it would mean if it repeated itself.
 *
 * THIS IS NOT A FORECAST AND MUST NEVER BECOME ONE. Every number here is either
 * a fact from the UK House Price Index or an arithmetic consequence of the
 * area's OWN past — never an opinion about the future. The distinction is not
 * pedantry:
 *
 *  • The OBR, which has a full macroeconomic model and a statutory remit to
 *    forecast, missed five-year house price growth by around fifteen
 *    percentage points. Nobody forecasts a local market, and no free official
 *    dataset even attempts anything below regional level.
 *  • The ASA has upheld complaints against property firms for growth claims
 *    whose basis was not apparent, and for returns rested on historical
 *    success. A confident line with small print is the thing that gets upheld
 *    against you. Labelled history and clearly-flagged assumptions are not.
 *
 * So: a scenario here is "if it repeated its own last ten years", stated as an
 * assumption, with the maths shown. It is never a prediction, a projection, an
 * expectation or a forecast, and the copy layer has a test that fails on those
 * words.
 *
 * IT NEVER TOUCHES THE DEAL SCORE. Nothing in this module is imported by
 * `scoreDeal` or by any strategy calculator, and a test asserts the score is
 * byte-identical with the panel on and off. A projection inside a score built
 * only on evidence would corrupt the one number the product rests on.
 */
import type { Breakdown, WithBreakdown } from '../maths/breakdown';
import { assertFinite } from '../maths/breakdown';

/** One area as the monthly pipeline publishes it. Short keys: this file is fetched. */
export interface AreaSeries {
  /** The area's published name, e.g. "Telford and Wrekin". */
  n: string;
  k: 'la' | 'region' | 'country';
  /** Latest average price, or null where UK HPI publishes none. */
  p: number | null;
  /** Sales REGISTERED in the twelve months ending `vTo`. Understates by design. */
  v: number | null;
  /** The month that sales window ends, e.g. "2026-04". */
  vTo: string | null;
  /** Index values, the same month in each year, oldest first. */
  i: number[];
  /** House price to earnings, ONS residence-based. Absent where ONS has none. */
  a?: number;
}

export interface TrajectoryFile {
  schemaVersion: number;
  source: string;
  licence: string;
  /** The month every index value is taken at, e.g. "2026-06". */
  month: string;
  years: number;
  /** WHICH ratio `a` is, and when it is from. The panel names the measure. */
  affordability?: { measure: 'residence' | 'workplace'; period: string | null };
  areas: Record<string, AreaSeries>;
}

/**
 * THIRTY SALES OR NOTHING.
 *
 * Below this, an area's index is moved by a handful of transactions and a
 * "trend" drawn through it is noise with a line on it. The panel shows no
 * growth figure for such an area and says why, exactly as the valuation
 * demotes a thin sector rather than quietly averaging four sales.
 */
export const MIN_TRANSACTIONS = 30;

/** The window the scenarios are anchored to: the area's own last ten years. */
export const SCENARIO_WINDOW_YEARS = 10;

/**
 * THE WINDOW THE VARIABILITY IS SHOWN OVER — and why it is not the same ten.
 *
 * Measured over the last ten years, Telford and Wrekin's worst year is +0.2%
 * and not one year fell. Over twenty it is −14.9%, with three falling years.
 * The same is true of the West Midlands (−12.8%) and of England (−12.1%): the
 * last decade contains no housing downturn at all, so a ten-year window makes
 * every area in the country look like it has never fallen.
 *
 * The whole purpose of this section is to stop the history reading as a smooth
 * line, so it uses every year the data gives — and names the window, because a
 * worst year means nothing without knowing how long you looked.
 */
export const VARIABILITY_WINDOW_YEARS = 20;

/** The horizons the panel can show. Five is the headline; ten is illustrative. */
export const HORIZONS = [5, 10] as const;
export type Horizon = (typeof HORIZONS)[number];

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const money = (x: number): string => `£${Math.round(x).toLocaleString('en-GB')}`;

/**
 * Year-on-year changes as decimals, oldest first. `i` holds the same month in
 * each year, so each change is a like-for-like twelve months — not a December
 * measured against a June.
 */
export function annualChanges(index: readonly number[]): number[] {
  const out: number[] = [];
  for (let k = 1; k < index.length; k += 1) {
    const before = index[k - 1];
    const after = index[k];
    if (!(before > 0) || !(after > 0)) continue;
    out.push(after / before - 1);
  }
  return out;
}

/**
 * A percentile of a sample of RATES, by linear interpolation between the two
 * nearest ranks — the method NumPy and Excel's PERCENTILE use.
 *
 * WHY THIS IS NOT `percentile` FROM maths/stats. That one ends in
 * `Math.round(...)`, because it exists to pick a typical PRICE and a price to
 * the nearest pound is the right answer. These are annual growth rates in
 * decimals: 0.043 rounded to the nearest whole number is zero, which would
 * silently flatten every scenario in this file to nothing. Two different jobs,
 * deliberately two functions — do not "deduplicate" them.
 */
export function ratePercentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (sorted.length - 1) * p;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (rank - lo) * (sorted[hi] - sorted[lo]);
}

/** Cumulative growth over the last `years` years, and the same as an annual rate. */
export function growthOver(index: readonly number[], years: number): {
  cumulative: WithBreakdown;
  annualised: WithBreakdown;
} | null {
  if (index.length < years + 1) return null;
  const then = index[index.length - 1 - years];
  const now = index[index.length - 1];
  if (!(then > 0) || !(now > 0)) return null;
  assertFinite({ then, now, years });

  const cumulative = now / then - 1;
  const annualised = (now / then) ** (1 / years) - 1;
  return {
    cumulative: {
      value: cumulative,
      breakdown: {
        label: `${years}-year change`,
        formula: 'index now ÷ index then − 1',
        substituted: `${now} ÷ ${then} − 1`,
        result: pct(cumulative),
        note: 'UK House Price Index, same month each year.',
      },
    },
    annualised: {
      value: annualised,
      breakdown: {
        label: `${years}-year change a year`,
        formula: '(index now ÷ index then) ^ (1 ÷ years) − 1',
        substituted: `(${now} ÷ ${then}) ^ (1 ÷ ${years}) − 1`,
        result: pct(annualised),
        note: 'The one yearly rate that joins those two points.',
      },
    },
  };
}

export interface Variability {
  /** The weakest single year in the window, as a decimal. */
  worst: number;
  /** The strongest single year in the window. */
  best: number;
  /** How many of the years in the window fell. */
  fellCount: number;
  /** How many years the window actually holds. */
  years: number;
}

/**
 * HOW UNEVEN IT HAS BEEN. This is what stops the history reading as a smooth
 * line: the worst year, the best year, and how many of them fell.
 */
export function variability(changes: readonly number[], windowYears: number): Variability | null {
  const window = changes.slice(-windowYears);
  if (window.length < 3) return null;
  return {
    worst: Math.min(...window),
    best: Math.max(...window),
    fellCount: window.filter((c) => c < 0).length,
    years: window.length,
  };
}

export interface ScenarioRates {
  low: number;
  central: number;
  high: number;
  /** How many annual observations the rates were taken from. */
  years: number;
}

/**
 * THE THREE RATES, anchored to the area's own history and to nothing else.
 *
 *  low     — the tenth percentile of its own annual changes
 *  central — the rate that actually joins the start and end of the window
 *  high    — the ninetieth percentile of its own annual changes
 *
 * There is no view of the future in any of them. That is the point: a scenario
 * is what the arithmetic says IF the area repeated what it has already done.
 */
export function scenarioRates(index: readonly number[], windowYears = SCENARIO_WINDOW_YEARS): ScenarioRates | null {
  const changes = annualChanges(index);
  const window = changes.slice(-windowYears);
  if (window.length < 5) return null;
  const over = growthOver(index, window.length);
  const low = ratePercentile(window, 0.1);
  const high = ratePercentile(window, 0.9);
  if (over === null || low === null || high === null) return null;
  return { low, central: over.annualised.value, high, years: window.length };
}

/** A price compounded forward at one rate, with the maths shown. */
export function compound(price: number, rate: number, years: number): WithBreakdown {
  assertFinite({ price, rate, years });
  const value = price * (1 + rate) ** years;
  return {
    value,
    breakdown: {
      label: `If it repeated ${pct(rate)} a year for ${years} years`,
      formula: 'price × (1 + rate) ^ years',
      substituted: `${money(price)} × (1 + ${pct(rate)}) ^ ${years}`,
      result: money(value),
      note: 'An assumption, not a prediction. Cash amounts, before inflation.',
    },
  };
}

export interface ScenarioBand {
  key: 'low' | 'central' | 'high';
  rate: number;
  end: WithBreakdown;
}

export interface AreaFacts {
  code: string;
  name: string;
  kind: AreaSeries['k'];
  /** Sales registered in the trailing year, and whether that clears the floor. */
  sales: number | null;
  salesTo: string | null;
  enoughSales: boolean;
  /** Cumulative + annualised growth at each horizon the data supports. */
  growth: Record<number, { cumulative: WithBreakdown; annualised: WithBreakdown }>;
  variability: Variability | null;
  /** The index values themselves, so the chart can draw the line it describes. */
  series: number[];
  averagePrice: number | null;
  /** House price to earnings — the ONS residence-based ratio, or null. */
  affordability: number | null;
}

export interface AreaTrajectory {
  /** The area the figures are FOR — the local authority, or a fallback. */
  subject: AreaFacts;
  /** Its region and its country, for comparison. Either may be absent. */
  region: AreaFacts | null;
  country: AreaFacts | null;
  /** Absent when the subject has too few sales to quote a trend. */
  scenarios: { rates: ScenarioRates; bands: Record<Horizon, ScenarioBand[]> } | null;
  /** Why no scenarios, when there are none. */
  withheld: 'too-few-sales' | 'too-little-history' | null;
  /**
   * The area we could NOT use, when the floor pushed us out to a wider one.
   * The panel says this plainly rather than swapping the geography silently —
   * a reader who thinks they are looking at their town must not be looking at
   * their region without being told.
   */
  fellBackFrom: { name: string; sales: number | null } | null;
  /** The month every index value is taken at. */
  month: string;
  /** Which affordability ratio the figures are, and when it is from. */
  affordability: { measure: 'residence' | 'workplace'; period: string | null } | null;
}

const factsFor = (code: string, a: AreaSeries): AreaFacts => {
  const changes = annualChanges(a.i);
  const growth: AreaFacts['growth'] = {};
  for (const years of [5, 10, 20]) {
    const g = growthOver(a.i, years);
    if (g !== null) growth[years] = g;
  }
  return {
    code,
    name: a.n,
    kind: a.k,
    sales: a.v,
    salesTo: a.vTo,
    enoughSales: a.v !== null && a.v >= MIN_TRANSACTIONS,
    growth,
    variability: variability(changes, VARIABILITY_WINDOW_YEARS),
    series: [...a.i],
    averagePrice: a.p,
    affordability: typeof a.a === 'number' ? a.a : null,
  };
};

/**
 * The whole panel's numbers, for one place.
 *
 * `price` is the deal's own asking price where there is one, so the scenarios
 * are about THIS property rather than an area average. Where there is none the
 * area's average price is used and the panel says so.
 */
export function trajectoryFor(
  file: TrajectoryFile,
  codes: { la: string | null; region: string | null; country: string | null },
  price: number | null,
): AreaTrajectory | null {
  const la = codes.la ? file.areas[codes.la] : undefined;
  const region = codes.region ? file.areas[codes.region] : undefined;
  const country = codes.country ? file.areas[codes.country] : undefined;

  /**
   * THE FALLBACK, and it is said out loud rather than swapped in silently.
   * With too few sales the local authority's own index is not a trend, so the
   * panel steps out to the region and tells the reader it has done so.
   */
  const thin = la !== undefined && !(la.v !== null && la.v >= MIN_TRANSACTIONS);
  const source = la !== undefined && !thin ? { code: codes.la!, series: la }
    : region !== undefined ? { code: codes.region!, series: region }
      : country !== undefined ? { code: codes.country!, series: country }
        : la !== undefined ? { code: codes.la!, series: la } : null;
  if (source === null) return null;

  const subject = factsFor(source.code, source.series);
  const rates = scenarioRates(source.series.i);
  const basis = price !== null && price > 0 ? price : source.series.p;

  let scenarios: AreaTrajectory['scenarios'] = null;
  let withheld: AreaTrajectory['withheld'] = null;
  if (!subject.enoughSales) withheld = 'too-few-sales';
  else if (rates === null || basis === null || !(basis > 0)) withheld = 'too-little-history';
  else {
    const bands = {} as Record<Horizon, ScenarioBand[]>;
    for (const h of HORIZONS) {
      bands[h] = ([['low', rates.low], ['central', rates.central], ['high', rates.high]] as const)
        .map(([key, rate]) => ({ key, rate, end: compound(basis, rate, h) }));
    }
    scenarios = { rates, bands };
  }

  return {
    subject,
    fellBackFrom: thin && la !== undefined && source.code !== codes.la
      ? { name: la.n, sales: la.v }
      : null,
    region: region !== undefined && codes.region !== null && codes.region !== source.code
      ? factsFor(codes.region, region) : null,
    country: country !== undefined && codes.country !== null && codes.country !== source.code
      ? factsFor(codes.country, country) : null,
    scenarios,
    withheld,
    month: file.month,
    affordability: file.affordability ?? null,
  };
}

/**
 * Where the shaded band ends, in the SAME rebased units the history line is
 * drawn in — so the chart can put the two on one pair of axes without doing any
 * arithmetic of its own. A component may format a figure, never compute one.
 */
export function bandEnds(index: readonly number[], rates: ScenarioRates, years: number): { low: number; high: number } | null {
  const points = historyPoints(index);
  const now = points.at(-1)?.value;
  if (now === undefined) return null;
  return { low: now * (1 + rates.low) ** years, high: now * (1 + rates.high) ** years };
}

/** The history line the chart draws: one point per year, rebased to 100 at the start. */
export function historyPoints(index: readonly number[]): { year: number; value: number }[] {
  if (index.length === 0 || !(index[0] > 0)) return [];
  const base = index[0];
  return index.map((v, k) => ({ year: k - (index.length - 1), value: (v / base) * 100 }));
}

export type { Breakdown };
