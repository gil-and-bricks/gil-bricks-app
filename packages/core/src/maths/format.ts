/** Money formatted £1,234 — whole pounds, thousands separators. */
export function fmtMoney(v: number): string {
  const rounded = Math.round(Math.abs(v));
  const s = rounded.toLocaleString('en-GB');
  // no signed zero: -£0.40 rounds to £0, not "-£0"
  return `${v < 0 && rounded > 0 ? '-' : ''}£${s}`;
}

/** Percentages to 1 decimal place, e.g. "8.4%". */
export function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

/** Plain ratio to 2 decimal places, e.g. "1.62". */
export function fmtRatio(v: number): string {
  return v.toFixed(2);
}
