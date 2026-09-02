import { assertNonNegative, type WithBreakdown } from './breakdown';
import { fmtMoney, fmtPct } from './format';
import { getClass4Nic, getCorporationTax, getFinanceCostCredit, getIncomeTax } from './rates';

export type TaxBand = 'basic' | 'higher' | 'additional';

export interface RentalTaxInputs {
  annualRent: number;
  /** Deductible running costs — NOT mortgage interest. */
  allowableCosts: number;
  mortgageInterest: number;
  taxBand: TaxBand;
  /** ISO date the rates apply on; defaults to today. */
  date?: string;
}

/**
 * Section 24 (individuals): mortgage interest is NOT deductible; instead a
 * tax credit (rate from rates.json) applies to it, capped at the property
 * profit. Simplified:
 * personal allowance and other income are outside this calculator's scope.
 */
export function taxOnRentalProfit(inputs: RentalTaxInputs): WithBreakdown {
  assertNonNegative({
    annualRent: inputs.annualRent,
    allowableCosts: inputs.allowableCosts,
    mortgageInterest: inputs.mortgageInterest,
  });
  const income = getIncomeTax(inputs.date);
  const credit = getFinanceCostCredit(inputs.date);
  const rate = income.rates[inputs.taxBand];
  if (rate === undefined) {
    throw new RangeError(`taxBand must be basic, higher or additional (got ${String(inputs.taxBand)})`);
  }
  const taxableProfit = Math.max(0, inputs.annualRent - inputs.allowableCosts);
  const taxBeforeCredit = taxableProfit * rate;
  // The S24 credit is limited to the LOWER of finance costs and profit.
  const creditAmount = credit.rate * Math.min(inputs.mortgageInterest, taxableProfit);
  const value = Math.max(0, taxBeforeCredit - creditAmount);
  const creditPct = fmtPct(credit.rate * 100);
  return {
    value,
    breakdown: {
      label: 'Tax on rental profit (personal)',
      formula: `(rent − allowable costs) × your tax rate, minus a ${creditPct} credit on mortgage interest`,
      substituted: `${fmtMoney(taxableProfit)} taxable × ${fmtPct(rate * 100)} − ${fmtMoney(creditAmount)} credit`,
      result: `${fmtMoney(value)} a year`,
      note: `since Section 24, individuals cannot deduct mortgage interest — only credit it at ${creditPct}`,
    },
  };
}

export interface LtdTaxInputs {
  annualRent: number;
  allowableCosts: number;
  mortgageInterest: number;
  date?: string;
}

/** Corporation tax on a profit, with marginal relief between the limits. */
function corporationTax(profit: number, onDate?: string): { tax: number; how: string } {
  const ct = getCorporationTax(onDate);
  if (profit <= ct.lowerLimit) {
    return { tax: profit * ct.smallRate, how: `${fmtMoney(profit)} × ${fmtPct(ct.smallRate * 100)}` };
  }
  if (profit >= ct.upperLimit) {
    return { tax: profit * ct.mainRate, how: `${fmtMoney(profit)} × ${fmtPct(ct.mainRate * 100)}` };
  }
  const relief = (ct.upperLimit - profit) * ct.marginalReliefFraction;
  return {
    tax: profit * ct.mainRate - relief,
    how: `${fmtMoney(profit)} × ${fmtPct(ct.mainRate * 100)} − ${fmtMoney(relief)} marginal relief`,
  };
}

/**
 * Limited company path: interest IS fully deductible; corporation tax applies
 * with marginal relief between the small and main rate limits.
 */
export function ltdTaxOnRentalProfit(inputs: LtdTaxInputs): WithBreakdown {
  assertNonNegative({
    annualRent: inputs.annualRent,
    allowableCosts: inputs.allowableCosts,
    mortgageInterest: inputs.mortgageInterest,
  });
  const profit = Math.max(0, inputs.annualRent - inputs.allowableCosts - inputs.mortgageInterest);
  const { tax, how } = corporationTax(profit, inputs.date);
  return {
    value: tax,
    breakdown: {
      label: 'Tax on rental profit (limited company)',
      formula: '(rent − allowable costs − mortgage interest) × corporation tax',
      substituted: how,
      result: `${fmtMoney(tax)} a year`,
      note: 'companies deduct mortgage interest in full — Section 24 does not apply',
    },
  };
}

export interface FlipTaxInputs {
  profit: number;
  /** Personal tax band, or 'ltd' for a limited company. */
  taxedAs: TaxBand | 'ltd';
  date?: string;
}

/**
 * Tax on a flip's profit. Flips are trading income: individuals pay income
 * tax at their band PLUS Class 4 National Insurance; companies pay
 * corporation tax. Simplified per-deal view — the band and NIC are applied
 * to this profit alone, ignoring other income.
 */
export function flipTax(inputs: FlipTaxInputs): WithBreakdown {
  assertNonNegative({ profit: inputs.profit });
  if (inputs.taxedAs === 'ltd') {
    const { tax, how } = corporationTax(inputs.profit, inputs.date);
    return {
      value: tax,
      breakdown: {
        label: 'Tax on flip profit (limited company)',
        formula: 'flip profit × corporation tax',
        substituted: how,
        result: fmtMoney(tax),
        note: 'flip profits are trading income — corporation tax for a company',
      },
    };
  }
  const income = getIncomeTax(inputs.date);
  const nic = getClass4Nic(inputs.date);
  const rate = income.rates[inputs.taxedAs];
  if (rate === undefined) {
    throw new RangeError(`taxedAs must be basic, higher, additional or ltd (got ${String(inputs.taxedAs)})`);
  }
  const incomeTax = inputs.profit * rate;
  const nicMain = nic.mainRate * Math.min(Math.max(inputs.profit - nic.lowerLimit, 0), nic.upperLimit - nic.lowerLimit);
  const nicUpper = nic.upperRate * Math.max(inputs.profit - nic.upperLimit, 0);
  const value = incomeTax + nicMain + nicUpper;
  return {
    value,
    breakdown: {
      label: 'Tax on flip profit (personal)',
      formula: 'flip profit × your tax rate, plus Class 4 National Insurance',
      substituted: `${fmtMoney(inputs.profit)} × ${fmtPct(rate * 100)} + ${fmtMoney(nicMain + nicUpper)} National Insurance`,
      result: fmtMoney(value),
      note: 'flips count as trading income, not capital gains — simplified to this deal alone',
    },
  };
}
