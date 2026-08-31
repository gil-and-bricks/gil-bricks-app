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
    typicalPpsqm: ppsqms.length >= 3 ? iqm(ppsqms) : null,  // <3 areas = too thin to summarise
    p10Price: percentile(prices, 0.1),
    p90Price: percentile(prices, 0.9),
  };
}

// --- S5.1 additive area stats, published in area/{OUTCODE}.json companions (docs/DATA_SCHEMA.md) ---

/** IQM sold price per property type; null when a type has <3 sales. O excluded. */
export function typicalPriceByType(sales) {
  const out = {};
  for (const t of ['D', 'S', 'T', 'F']) {
    const prices = sales.filter((s) => s.type === t).map((s) => s.price);
    out[t] = prices.length >= 3 ? iqm(prices) : null;
  }
  return out;
}

/** Fraction of sales matching pred, 3dp. */
export function saleShare(sales, pred) {
  return Math.round((sales.filter(pred).length / sales.length) * 1000) / 1000;
}

/** The 12 window months oldest→newest ending at ppdMonth ("YYYY-MM"). */
export function windowMonths(ppdMonth) {
  const [y, m] = ppdMonth.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const k = m - 11 + i;
    const yy = k <= 0 ? y - 1 : y;
    const mm = k <= 0 ? k + 12 : k;
    return `${yy}-${String(mm).padStart(2, '0')}`;
  });
}

/** Sales count per window month, oldest→newest (12 numbers). */
export function salesByMonth(sales, ppdMonth) {
  const months = windowMonths(ppdMonth);
  const idx = new Map(months.map((mo, i) => [mo, i]));
  const out = Array(12).fill(0);
  for (const s of sales) {
    const i = idx.get(s.date.slice(0, 7));
    if (i !== undefined) out[i] += 1;
  }
  return out;
}

/**
 * Most common decile in a {decile: count} tally; ties go to the LOWER
 * (more deprived) decile — flag, never flatter. Null on an empty tally.
 */
export function modalDecile(tally) {
  let best = null;
  for (const [d, n] of Object.entries(tally)) {
    const dec = Number(d);
    if (best === null || n > best.n || (n === best.n && dec < best.dec)) best = { dec, n };
  }
  return best ? best.dec : null;
}
