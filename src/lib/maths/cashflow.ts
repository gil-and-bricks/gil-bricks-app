import { assertNonNegative, type WithBreakdown } from './breakdown';
import { fmtMoney } from './format';

export interface CashflowInputs {
  rent: number;
  mortgage: number;
  management: number;
  maintenance: number;
  insurance: number;
  voids: number;
}

/** Monthly cashflow = rent − mortgage − management − maintenance − insurance − voids. */
export function monthlyCashflow(inputs: CashflowInputs): WithBreakdown {
  assertNonNegative({ ...inputs });
  const { rent, mortgage, management, maintenance, insurance, voids } = inputs;
  const value = rent - mortgage - management - maintenance - insurance - voids;
  return {
    value,
    breakdown: {
      label: 'Monthly cashflow',
      formula: 'rent − mortgage − management − maintenance − insurance − voids',
      substituted: `${fmtMoney(rent)} − ${fmtMoney(mortgage)} − ${fmtMoney(management)} − ${fmtMoney(maintenance)} − ${fmtMoney(insurance)} − ${fmtMoney(voids)}`,
      result: `${fmtMoney(value)} per month`,
      note: 'what is left each month after every regular cost',
    },
  };
}
