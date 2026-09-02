import { assertNonNegative, assertPositive, type WithBreakdown } from './breakdown';
import { fmtMoney, fmtPct } from './format';

/** Gross yield = annual rent ÷ price (docs/definitions.md). Value is a %. */
export function grossYield(annualRent: number, price: number): WithBreakdown {
  assertNonNegative({ annualRent });
  assertPositive({ price });
  const value = (annualRent / price) * 100;
  return {
    value,
    breakdown: {
      label: 'Gross yield',
      formula: 'annual rent ÷ price × 100',
      substituted: `${fmtMoney(annualRent)} ÷ ${fmtMoney(price)} × 100`,
      result: fmtPct(value),
      note: 'before any costs — the headline letting return',
    },
  };
}

/** Net yield = (annual rent − running costs) ÷ all-in cost (docs/definitions.md). */
export function netYield(annualRent: number, runningCosts: number, allInCost: number): WithBreakdown {
  assertNonNegative({ annualRent, runningCosts });
  assertPositive({ allInCost });
  const value = ((annualRent - runningCosts) / allInCost) * 100;
  return {
    value,
    breakdown: {
      label: 'Net yield',
      formula: '(annual rent − running costs) ÷ all-in cost × 100',
      substituted: `(${fmtMoney(annualRent)} − ${fmtMoney(runningCosts)}) ÷ ${fmtMoney(allInCost)} × 100`,
      result: fmtPct(value),
      note: 'running costs are letting costs only — management, maintenance, insurance and voids, not the mortgage; all-in cost = price + buying + refurb',
    },
  };
}
