/**
 * Canonical stats maths — MUST match docs/DATA_SCHEMA.md exactly:
 * IQM = sort, drop floor(n/4) from each end, mean, round.
 * Percentiles = linear interpolation between closest ranks (type-7), round.
 */
export function iqm(values) {
  const s = [...values].sort((a, b) => a - b);
  const k = Math.floor(s.length / 4);
  const mid = s.slice(k, s.length - k);
  return Math.round(mid.reduce((a, b) => a + b, 0) / mid.length);
}

export function percentile(values, p) {
  const s = [...values].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return Math.round(s[lo] + (s[hi] - s[lo]) * (idx - lo));
}

export function sectorStats(sales) {
  const prices = sales.map((s) => s.price);
  const ppsqms = sales.filter((s) => s.ppsqm !== null).map((s) => s.ppsqm);
  return {
    count: sales.length,
    typicalPrice: iqm(prices),
    typicalPpsqm: ppsqms.length > 0 ? iqm(ppsqms) : null,
    p10Price: percentile(prices, 0.1),
    p90Price: percentile(prices, 0.9),
  };
}
