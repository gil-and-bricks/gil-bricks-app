import { assertFinite, assertNonNegative, assertPositive, type Breakdown, type WithBreakdown } from './breakdown';
import { fmtMoney, fmtPct } from './format';

export interface CashInInputs {
  deposit: number;
  sdlt: number;
  legals: number;
  refurb: number;
  fees: number;
}

/** Total cash in — INCLUDES SDLT/LTT + legals + refurb + fees (docs/definitions.md). */
export function cashIn(inputs: CashInInputs): WithBreakdown {
  assertNonNegative({ ...inputs });
  const { deposit, sdlt, legals, refurb, fees } = inputs;
  const value = deposit + sdlt + legals + refurb + fees;
  return {
    value,
    breakdown: {
      label: 'Total cash in',
      formula: 'deposit + stamp duty + legals + refurb + fees',
      substituted: `${fmtMoney(deposit)} + ${fmtMoney(sdlt)} + ${fmtMoney(legals)} + ${fmtMoney(refurb)} + ${fmtMoney(fees)}`,
      result: fmtMoney(value),
      note: 'cash in includes stamp duty — never quote a return that leaves it out',
    },
  };
}

/** ROI = annual net profit ÷ total cash in × 100 (docs/definitions.md). */
export function roi(annualNetProfit: number, totalCashIn: number): WithBreakdown {
  assertFinite({ annualNetProfit });
  assertPositive({ totalCashIn });
  const value = (annualNetProfit / totalCashIn) * 100;
  return {
    value,
    breakdown: {
      label: 'Return on investment (ROI)',
      formula: 'annual net profit ÷ total cash in × 100',
      substituted: `${fmtMoney(annualNetProfit)} ÷ ${fmtMoney(totalCashIn)} × 100`,
      result: fmtPct(value),
      note: 'cash in includes stamp duty, legals, refurb and fees',
    },
  };
}

export interface BrrrrInputs {
  cashInvested: number;
  /** Decimal fraction, e.g. 0.75 for a 75% refinance. */
  refinanceLtv: number;
  /** After-repair value. */
  arv: number;
}

export interface BrrrrResult {
  refinanceProceeds: number;
  /** Positive = cash stuck in the deal; 0 = all out (any surplus is in `surplus`). Differences under £1 count as 0. */
  moneyLeftIn: number;
  surplus: number;
  verdict: string;
}

/**
 * BRRRR money-left-in (docs/definitions.md): refinance proceeds ≥ cash
 * invested → "All money out" (a surplus of £1+ is shown), else "£X left in".
 */
export function brrrr(inputs: BrrrrInputs): WithBreakdown<BrrrrResult> {
  assertNonNegative({ cashInvested: inputs.cashInvested });
  assertPositive({ refinanceLtv: inputs.refinanceLtv, arv: inputs.arv });
  const refinanceProceeds = inputs.arv * inputs.refinanceLtv;
  const rawDiff = refinanceProceeds - inputs.cashInvested;
  // Within £1 either way is float noise at deal scale: plain "All money out"
  // (never "+£0" or "£0 left in").
  const diff = Math.abs(rawDiff) < 1 ? 0 : rawDiff;
  const moneyLeftIn = diff < 0 ? -diff : 0;
  const surplus = diff > 0 ? diff : 0;
  let verdict: string;
  if (diff < 0) verdict = `${fmtMoney(moneyLeftIn)} left in`;
  else if (diff > 0) verdict = `All money out + ${fmtMoney(surplus)}`;
  else verdict = 'All money out';
  const breakdown: Breakdown = {
    label: 'BRRRR — money left in',
    formula: 'refinance proceeds (new value × the loan share) compared with cash invested',
    substituted: `${fmtMoney(inputs.arv)} × ${fmtPct(inputs.refinanceLtv * 100)} = ${fmtMoney(refinanceProceeds)} vs ${fmtMoney(inputs.cashInvested)} invested`,
    result: verdict,
    note: 'refinancing pulls cash back out; whatever it does not cover stays in the deal',
  };
  return { value: { refinanceProceeds, moneyLeftIn, surplus, verdict }, breakdown };
}
