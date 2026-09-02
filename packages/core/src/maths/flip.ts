import { assertNonNegative, assertPositive, type WithBreakdown } from './breakdown';
import { fmtMoney, fmtPct } from './format';
import { roi } from './investment';

export interface FlipInputs {
  /** Gross development value — the expected sale price. */
  gdv: number;
  purchase: number;
  refurb: number;
  purchaseCosts: number;
  financeCosts: number;
  sellingCosts: number;
}

export interface FlipResult {
  profit: number;
  /** Profit on GDV, % (docs/definitions.md: profit ÷ GDV). */
  profitOnGdv: number;
  /** Project ROI, % — profit over the cash employed. */
  roi: number;
  cashIn: number;
}

export function flipProfit(inputs: FlipInputs): WithBreakdown<FlipResult> {
  assertPositive({ gdv: inputs.gdv, purchase: inputs.purchase });
  assertNonNegative({
    refurb: inputs.refurb,
    purchaseCosts: inputs.purchaseCosts,
    financeCosts: inputs.financeCosts,
    sellingCosts: inputs.sellingCosts,
  });
  const { gdv, purchase, refurb, purchaseCosts, financeCosts, sellingCosts } = inputs;
  const profit = gdv - purchase - refurb - purchaseCosts - financeCosts - sellingCosts;
  const profitOnGdv = (profit / gdv) * 100;
  // Cash employed: everything paid out before the sale. Selling costs come
  // out of the sale proceeds, so they reduce profit but are not cash in.
  const flipCashIn = purchase + purchaseCosts + refurb + financeCosts;
  const projectRoi = roi(profit, flipCashIn).value;
  return {
    value: { profit, profitOnGdv, roi: projectRoi, cashIn: flipCashIn },
    breakdown: {
      label: 'Flip profit',
      formula: 'sale price − purchase − refurb − buying costs − finance costs − selling costs',
      substituted: `${fmtMoney(gdv)} − ${fmtMoney(purchase)} − ${fmtMoney(refurb)} − ${fmtMoney(purchaseCosts)} − ${fmtMoney(financeCosts)} − ${fmtMoney(sellingCosts)}`,
      result: `${fmtMoney(profit)} profit (${fmtPct(profitOnGdv)} of the sale price, ${fmtPct(projectRoi)} on ${fmtMoney(flipCashIn)} cash employed)`,
      note: 'project return for the whole flip — not a yearly rate',
    },
  };
}
