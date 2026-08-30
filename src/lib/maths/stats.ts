/**
 * LOCKED stats maths (docs/definitions.md + docs/DATA_SCHEMA.md):
 * IQM = sort, drop floor(n/4) from each end, mean, round.
 * Percentiles = linear interpolation between closest ranks (type-7), round.
 *
 * This mirrors pipeline/stats.mjs (the pipeline stays plain-JS runnable);
 * a parity test in maths.test.ts keeps the two identical.
 */
import type { WithBreakdown } from './breakdown';
import { fmtMoney } from './format';

function assertValues(values: number[], fn: string): void {
  if (values.length === 0) throw new RangeError(`${fn} needs at least one value`);
  values.forEach((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new TypeError(`values[${i}] must be a finite number (got ${String(v)})`);
    }
  });
}

export function iqm(values: number[]): number {
  assertValues(values, 'iqm');
  const s = [...values].sort((a, b) => a - b);
  const k = Math.floor(s.length / 4);
  const mid = s.slice(k, s.length - k);
  return Math.round(mid.reduce((a, b) => a + b, 0) / mid.length);
}

export function percentile(values: number[], p: number): number {
  assertValues(values, 'percentile');
  if (!Number.isFinite(p) || p < 0 || p > 1) {
    throw new RangeError(`p must be between 0 and 1 (got ${String(p)})`);
  }
  const s = [...values].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return Math.round(s[lo] + (s[hi] - s[lo]) * (idx - lo));
}

export interface TypicalPrice {
  typical: number;
  p10: number;
  p90: number;
}

/** Typical price = interquartile mean, with the 80% range (p10–p90). */
export function typicalPrice(values: number[]): WithBreakdown<TypicalPrice> {
  assertValues(values, 'typicalPrice');
  const typical = iqm(values);
  const p10 = percentile(values, 0.1);
  const p90 = percentile(values, 0.9);
  const k = Math.floor(values.length / 4);
  return {
    value: { typical, p10, p90 },
    breakdown: {
      label: 'Typical price',
      formula: 'sort the prices, set aside the top and bottom quarter, average the middle half',
      substituted: `${values.length} prices, ${k} set aside at each end, average of the middle ${values.length - 2 * k}`,
      result: `${fmtMoney(typical)} (80% of sales between ${fmtMoney(p10)} and ${fmtMoney(p90)})`,
      note: 'the middle-half average ignores extreme sales at both ends',
    },
  };
}
