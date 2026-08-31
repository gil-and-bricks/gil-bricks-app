import { assertNonNegative, assertPositive, type Breakdown, type WithBreakdown } from './breakdown';
import { fmtMoney, fmtPct, fmtRatio } from './format';

// Rates throughout this library are decimal fractions (5.5% = 0.055);
// breakdowns format them as percentages for humans.

/** Interest-only mortgage: value = monthly payment. */
export function mortgageInterestOnly(loan: number, annualRate: number): WithBreakdown {
  assertNonNegative({ loan });
  assertPositive({ annualRate });
  const annual = loan * annualRate;
  const value = annual / 12;
  return {
    value,
    breakdown: {
      label: 'Mortgage payment (interest-only)',
      formula: 'loan × interest rate ÷ 12',
      substituted: `${fmtMoney(loan)} × ${fmtPct(annualRate * 100)} ÷ 12`,
      result: `${fmtMoney(value)} per month (${fmtMoney(annual)} a year)`,
      note: 'interest-only: the loan itself is not being paid down',
    },
  };
}

/** Repayment mortgage: standard annuity formula; value = monthly payment. */
export function mortgageRepayment(loan: number, annualRate: number, years: number): WithBreakdown {
  assertNonNegative({ loan });
  assertPositive({ annualRate, years });
  const r = annualRate / 12;
  const n = years * 12;
  const value = (loan * r) / (1 - (1 + r) ** -n);
  return {
    value,
    breakdown: {
      label: 'Mortgage payment (repayment)',
      formula: 'loan × monthly rate ÷ (1 − (1 + monthly rate) to the power of −months)',
      substituted: `${fmtMoney(loan)} × ${(r * 100).toFixed(3)}% ÷ (1 − ${(1 + r).toFixed(5)} to the power of −${n})`,
      result: `${fmtMoney(value)} per month`,
      note: 'pays off the whole loan by the end of the term',
    },
  };
}

export interface IcrResult extends WithBreakdown {
  /** true when the ratio meets or beats the threshold. */
  passes: boolean;
}

/**
 * ICR = rent ÷ (loan × stress rate) (docs/definitions.md).
 * threshold is a ratio: 1.25 (125%) or 1.45 (145%). Meeting it exactly passes.
 */
export function icr(annualRent: number, loan: number, stressRate: number, threshold: number): IcrResult {
  assertNonNegative({ annualRent });
  assertPositive({ loan, stressRate, threshold });
  const stressedInterest = loan * stressRate;
  const value = annualRent / stressedInterest;
  const passes = value >= threshold;
  const breakdown: Breakdown = {
    label: 'Interest coverage ratio (ICR)',
    formula: 'rent for a year ÷ (loan × the higher ‘stress’ rate the lender tests with, not your real rate)',
    substituted: `${fmtMoney(annualRent)} ÷ (${fmtMoney(loan)} × ${fmtPct(stressRate * 100)})`,
    result: `${fmtRatio(value)} (${fmtPct(value * 100)}) — ${passes ? 'passes' : 'fails'} the ${fmtPct(threshold * 100)} test`,
    note: 'lenders stress-test whether rent comfortably covers the interest',
  };
  return { value, breakdown, passes };
}
