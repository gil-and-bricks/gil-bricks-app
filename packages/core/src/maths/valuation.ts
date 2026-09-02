import { assertPositive, type WithBreakdown } from './breakdown';
import { fmtMoney } from './format';

export type Confidence = 'high' | 'medium' | 'low';

const MARGINS: Record<Confidence, { pct: number; label: string }> = {
  high: { pct: 5, label: 'fairly reliable' },
  medium: { pct: 10, label: 'less certain' },
  low: { pct: 20, label: 'rough guide' },
};

export interface ValuationRange {
  low: number;
  high: number;
  marginPct: number;
  label: string;
}

/** ±5/10/20% around the estimate as a plain range (CLAUDE.md: no per-attribute adjustments). */
export function valuationRange(estimate: number, confidence: Confidence): WithBreakdown<ValuationRange> {
  assertPositive({ estimate });
  const m = MARGINS[confidence];
  if (!m) throw new RangeError(`confidence must be high, medium or low (got ${String(confidence)})`);
  // Whole pounds: a range endpoint is a display value, and float artifacts
  // (200000 x 1.1 = 220000.00000000003) would leak into comparisons.
  const low = Math.round(estimate * (1 - m.pct / 100));
  const high = Math.round(estimate * (1 + m.pct / 100));
  return {
    value: { low, high, marginPct: m.pct, label: m.label },
    breakdown: {
      label: 'Valuation range',
      formula: `estimate ± ${m.pct}%`,
      substituted: `${fmtMoney(estimate)} ± ${m.pct}%`,
      result: `${fmtMoney(low)} to ${fmtMoney(high)} (${m.label})`,
      note: 'a plain range around the estimate — wider when the evidence is thinner',
    },
  };
}
