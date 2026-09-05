/**
 * Equity from a purchase price and the house price index (T1). PURE: no fetch,
 * no DOM, no config — hand it the two index readings and it does the maths, so
 * a tool page and the analyser can never drift on how equity is worked out.
 *
 * It is an INDEXED ESTIMATE, not a valuation: it knows the purchase price and
 * how prices moved in that country, and nothing at all about the property.
 */
import { fmtMoney, fmtPct } from '../maths/format';
import type { Breakdown } from '../maths/breakdown';

export interface EquityInput {
  /** What they paid, in whole pounds. */
  paid: number;
  /** What they still owe, in whole pounds. Zero is valid (owned outright). */
  owed: number;
  /** UK HPI reading for the month they bought. */
  indexThen: number;
  /** UK HPI reading for the latest month we hold. */
  indexNow: number;
}

export interface EquityResult {
  /** The indexed estimate of what it is worth now. */
  value: number;
  /** value − owed. Can be negative: say so rather than hide it. */
  equity: number;
  /** Loan to value as a percentage of the estimated value; 0 when owed is 0. */
  ltv: number;
  /** How much prices moved, as a multiplier (1.24 = up 24%). */
  multiplier: number;
  breakdown: Breakdown;
}

export function equityFromHpi(input: EquityInput): EquityResult {
  const { paid, owed, indexThen, indexNow } = input;
  if (!(paid > 0)) throw new Error('The purchase price must be more than £0');
  if (owed < 0) throw new Error('What you owe cannot be less than £0');
  if (!(indexThen > 0) || !(indexNow > 0)) throw new Error('The house price index readings must be positive');

  const multiplier = indexNow / indexThen;
  const value = paid * multiplier;
  const equity = value - owed;
  const ltv = owed === 0 ? 0 : (owed / value) * 100;

  return {
    value,
    equity,
    ltv,
    multiplier,
    breakdown: {
      label: 'Equity from the house price index',
      formula: 'what you paid × (index now ÷ index when you bought) − what you still owe',
      substituted: `${fmtMoney(paid)} × (${indexNow} ÷ ${indexThen}) − ${fmtMoney(owed)}`,
      result: `${fmtMoney(value)} − ${fmtMoney(owed)} = ${fmtMoney(equity)} (LTV ${fmtPct(ltv)})`,
      note: 'An index estimate for the whole country, not a valuation of this property.',
    },
  };
}
