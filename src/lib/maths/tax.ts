import { assertNonNegative, type WithBreakdown } from './breakdown';
import { fmtMoney, fmtPct } from './format';
import { CORPORATION_TAX, FINANCE_COST_CREDIT_RATE, INCOME_TAX_RATES } from './constants';

export type TaxBand = 'basic' | 'higher' | 'additional';

export interface RentalTaxInputs {
  annualRent: number;
  /** Deductible running costs — NOT mortgage interest. */
  allowableCosts: number;
  mortgageInterest: number;
  taxBand: TaxBand;
}

/**
 * Section 24 (individuals): mortgage interest is NOT deductible; instead a
 * 20% tax credit applies to it, capped at the property profit. Simplified:
 * personal allowance and other income are outside this calculator's scope.
 */
export function taxOnRentalProfit(inputs: RentalTaxInputs): WithBreakdown {
  assertNonNegative({
    annualRent: inputs.annualRent,
    allowableCosts: inputs.allowableCosts,
    mortgageInterest: inputs.mortgageInterest,
  });
  const rate = INCOME_TAX_RATES[inputs.taxBand];
  if (rate === undefined) {
    throw new RangeError(`taxBand must be basic, higher or additional (got ${String(inputs.taxBand)})`);
  }
  const taxableProfit = Math.max(0, inputs.annualRent - inputs.allowableCosts);
  const taxBeforeCredit = taxableProfit * rate;
  // The S24 credit is limited to 20% of the LOWER of finance costs and profit.
  const credit = FINANCE_COST_CREDIT_RATE * Math.min(inputs.mortgageInterest, taxableProfit);
  const value = Math.max(0, taxBeforeCredit - credit);
  return {
    value,
    breakdown: {
      label: 'Tax on rental profit (personal)',
      formula: '(rent − allowable costs) × your tax rate, minus a 20% credit on mortgage interest',
      substituted: `${fmtMoney(taxableProfit)} taxable × ${fmtPct(rate * 100)} − ${fmtMoney(credit)} credit`,
      result: `${fmtMoney(value)} a year`,
      note: 'since Section 24, individuals cannot deduct mortgage interest — only credit it at 20%',
    },
  };
}

export interface LtdTaxInputs {
  annualRent: number;
  allowableCosts: number;
  mortgageInterest: number;
}

/**
 * Limited company path: interest IS fully deductible; corporation tax applies
 * with marginal relief between the small and main rate limits.
 */
export function ltdTaxOnRentalProfit(inputs: LtdTaxInputs): WithBreakdown {
  assertNonNegative({ ...inputs });
  const profit = Math.max(0, inputs.annualRent - inputs.allowableCosts - inputs.mortgageInterest);
  const { smallRate, mainRate, lowerLimit, upperLimit, marginalReliefFraction } = CORPORATION_TAX;
  let value: number;
  let how: string;
  if (profit <= lowerLimit) {
    value = profit * smallRate;
    how = `${fmtMoney(profit)} × ${fmtPct(smallRate * 100)}`;
  } else if (profit >= upperLimit) {
    value = profit * mainRate;
    how = `${fmtMoney(profit)} × ${fmtPct(mainRate * 100)}`;
  } else {
    const relief = (upperLimit - profit) * marginalReliefFraction;
    value = profit * mainRate - relief;
    how = `${fmtMoney(profit)} × ${fmtPct(mainRate * 100)} − ${fmtMoney(relief)} marginal relief`;
  }
  return {
    value,
    breakdown: {
      label: 'Tax on rental profit (limited company)',
      formula: '(rent − allowable costs − mortgage interest) × corporation tax',
      substituted: how,
      result: `${fmtMoney(value)} a year`,
      note: 'companies deduct mortgage interest in full — Section 24 does not apply',
    },
  };
}
