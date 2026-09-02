/**
 * Flip analysis — a COMPOSITION of src/lib/maths (flipProfit, flipTax,
 * stampDuty, roi) plus the bridging cost arithmetic shared in spirit with
 * BRRRR (loan × monthly rate × months + fees — documented in docs/MATHS.md).
 * NO rental maths anywhere (a flip has no tenants). Thresholds from config.
 * Both tax scenarios are always computed side by side.
 */
import type { Breakdown } from '../maths/breakdown';
import { flipProfit } from '../maths/flip';
import { roi as libRoi } from '../maths/investment';
import { flipTax, type TaxBand } from '../maths/tax';
import { getVat } from '../maths/rates';
import { stampDuty, type BuyerType, type StampCountry } from '../maths/stampduty';
import { fmtMoney, fmtPct } from '../maths/format';

export interface FlipStrategyInputs {
  price: number;
  country: StampCountry;
  refurb: number;
  gdv: number;
  funding: 'bridging' | 'cash';
  months: number;
  agentSalePctExVat: number;
  saleLegals: number;
  flipAs: 'personal' | 'ltd';
  incomeBand: Exclude<TaxBand, 'additional'>;
  bridgeLoanPct: number;
  bridgeRatePctMonth: number;
  arrangementPct: number;
  exitPct: number;
  legals: number;
  contingencyPct: number;
  taxBasis: BuyerType;
  thresholds: { greenRoi: number; greenProfit: number; amberRoi: number };
}

import type { VerdictColour } from './verdict';

export interface FlipAnalysis {
  verdict: VerdictColour;
  verdictCopy: string;
  lever: string | null;
  taxBasisUsed: BuyerType;
  profitBeforeTax: { value: number; breakdown: Breakdown };
  profitOnGdvPct: { value: number; breakdown: Breakdown };
  totalCostIn: { value: number; breakdown: Breakdown };
  sellingCosts: { value: number; breakdown: Breakdown };
  cashInvested: { value: number; breakdown: Breakdown };
  financeCosts: { value: number; breakdown: Breakdown } | null;
  personalTax: { value: number; breakdown: Breakdown };
  companyTax: { value: number; breakdown: Breakdown };
  selectedTax: number;
  profitAfterTax: { value: number; breakdown: Breakdown };
  roiBeforeTax: { value: number; breakdown: Breakdown };
  roiAfterTax: { value: number; breakdown: Breakdown };
  maxOfferGreen: number | null;
  gdvNeededGreen: number | null;
  stampDutyTax: number;
}

const ZERO_TAX = (label: string): Breakdown => ({
  label,
  formula: 'no profit, no tax',
  substituted: 'profit ≤ £0',
  result: '£0',
  note: 'losses are outside this calculator — speak to an accountant about relief',
});

function core(i: FlipStrategyInputs) {
  // Companies ALWAYS pay the higher purchase-tax rates.
  const basis: BuyerType = i.flipAs === 'ltd' ? 'additional' : i.taxBasis;
  const sdlt = stampDuty({ price: i.price, country: i.country, buyerType: basis });
  const bridgeLoan = i.funding === 'bridging' ? i.price * (i.bridgeLoanPct / 100) : 0;
  const deposit = i.price - bridgeLoan;
  const interest = bridgeLoan * (i.bridgeRatePctMonth / 100) * i.months;
  const arrangement = bridgeLoan * (i.arrangementPct / 100);
  const exit = bridgeLoan * (i.exitPct / 100);
  const financeCosts = interest + arrangement + exit;
  const contingency = i.refurb * (i.contingencyPct / 100);
  const vat = getVat().standardRate;
  const sellingCosts = i.gdv * (i.agentSalePctExVat / 100) * (1 + vat) + i.saleLegals;
  const fp = flipProfit({
    gdv: i.gdv,
    purchase: i.price,
    refurb: i.refurb + contingency,
    purchaseCosts: sdlt.value.tax + i.legals,
    financeCosts,
    sellingCosts,
  });
  const profit = fp.value.profit;
  const totalCostIn = i.price + sdlt.value.tax + i.legals + i.refurb + contingency + financeCosts;
  const cashInvested = i.funding === 'bridging'
    ? deposit + arrangement + exit + interest + sdlt.value.tax + i.legals + i.refurb + contingency
    : totalCostIn;
  const personalTax = profit > 0 ? flipTax({ profit, taxedAs: i.incomeBand }) : { value: 0, breakdown: ZERO_TAX('Tax on flip profit (personal)') };
  const companyTax = profit > 0 ? flipTax({ profit, taxedAs: 'ltd' }) : { value: 0, breakdown: ZERO_TAX('Tax on flip profit (limited company)') };
  const selectedTax = i.flipAs === 'ltd' ? companyTax.value : personalTax.value;
  const profitAfterTax = profit - selectedTax;
  const roiBT = cashInvested > 0 ? libRoi(profit, cashInvested) : null;
  const roiAT = cashInvested > 0 ? libRoi(profitAfterTax, cashInvested) : null;
  return { basis, sdlt, bridgeLoan, deposit, interest, arrangement, exit, financeCosts, contingency, sellingCosts, fp, profit, totalCostIn, cashInvested, personalTax, companyTax, selectedTax, profitAfterTax, roiBT, roiAT, vat };
}

function colourOf(c: ReturnType<typeof core>, t: FlipStrategyInputs['thresholds']): VerdictColour {
  const atRoi = c.roiAT?.value ?? -Infinity;
  if (c.profit <= 0 || atRoi < t.amberRoi) return 'red';
  if (atRoi >= t.greenRoi && c.profit >= t.greenProfit) return 'green';
  return 'amber';
}

/** Highest price that keeps the flip Green (floor £250). */
export function maxOfferForGreen(i: FlipStrategyInputs): number | null {
  const greenAt = (price: number): boolean => colourOf(core({ ...i, price }), i.thresholds) === 'green';
  let lo = 1000;
  let hi = i.price * 2;
  if (!greenAt(lo)) return null;
  if (greenAt(hi)) return Math.floor(hi / 250) * 250;
  while (hi - lo > 25) {
    const mid = (lo + hi) / 2;
    if (greenAt(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / 250) * 250;
}

/** Smallest sale price that makes the flip Green (ceil £250). */
export function gdvNeededForGreen(i: FlipStrategyInputs): number | null {
  const greenAt = (gdv: number): boolean => colourOf(core({ ...i, gdv }), i.thresholds) === 'green';
  let lo = 1000;
  let hi = Math.max(i.gdv * 4, i.price * 4);
  if (greenAt(lo)) return Math.ceil(lo / 250) * 250;
  if (!greenAt(hi)) return null;
  while (hi - lo > 25) {
    const mid = (lo + hi) / 2;
    if (greenAt(mid)) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi / 250) * 250;
}

export function analyseFlip(i: FlipStrategyInputs): FlipAnalysis {
  const c = core(i);
  const colour = colourOf(c, i.thresholds);
  const t = i.thresholds;

  let verdictCopy: string;
  if (colour === 'green') {
    verdictCopy = 'Green — a solid margin even after tax, with room for surprises.';
  } else if (colour === 'amber') {
    verdictCopy = c.profit < t.greenProfit
      ? `Amber — it makes money, but under ${fmtMoney(t.greenProfit)} profit leaves little room for surprises.`
      : 'Amber — the return is workable but thin for the risk of a refurb-and-resale.';
  } else if (c.profit <= 0) {
    verdictCopy = 'Red — this flip loses money before tax even lands.';
  } else {
    verdictCopy = 'Red — the margin is too thin; one overrun would wipe it out.';
  }

  let lever: string | null = null;
  const maxOffer = maxOfferForGreen(i);
  const gdvNeeded = gdvNeededForGreen(i);
  if (colour !== 'green') {
    const priceMove = maxOffer !== null ? i.price - maxOffer : null;
    const gdvMove = gdvNeeded !== null ? gdvNeeded - i.gdv : null;
    if (priceMove !== null && (gdvMove === null || priceMove <= gdvMove)) {
      lever = `Max offer for a Green flip: ${fmtMoney(maxOffer as number)} (${fmtMoney(priceMove)} below the asking price).`;
    } else if (gdvMove !== null) {
      lever = `Sale price needed for Green: ${fmtMoney(gdvNeeded as number)} — only believe it if the sold evidence does.`;
    }
  }

  const taxName = i.country === 'W92000004' ? 'Land Transaction Tax' : 'Stamp Duty';
  const totalCostBreakdown: Breakdown = {
    label: 'Total cost in',
    formula: `price + ${taxName} + legals + refurb + contingency + finance costs`,
    substituted: `${fmtMoney(i.price)} + ${fmtMoney(c.sdlt.value.tax)} + ${fmtMoney(i.legals)} + ${fmtMoney(i.refurb)} + ${fmtMoney(c.contingency)} + ${fmtMoney(c.financeCosts)}`,
    result: fmtMoney(c.totalCostIn),
    note: 'everything it costs to own the finished property, before selling it',
  };
  const sellingBreakdown: Breakdown = {
    label: 'Selling costs',
    formula: 'sale price × agent fee (+ VAT) + selling legals',
    substituted: `${fmtMoney(i.gdv)} × ${fmtPct(i.agentSalePctExVat)} × ${(1 + c.vat).toFixed(2)} + ${fmtMoney(i.saleLegals)}`,
    result: fmtMoney(c.sellingCosts),
    note: 'agent fees are quoted before VAT — the taxman adds the rest',
  };
  const cashBreakdown: Breakdown = {
    label: 'Cash invested',
    formula: i.funding === 'bridging'
      ? `deposit + bridging fees + interest + ${taxName} + legals + refurb + contingency`
      : 'the full cost — no borrowing',
    substituted: i.funding === 'bridging'
      ? `${fmtMoney(c.deposit)} + ${fmtMoney(c.arrangement + c.exit)} + ${fmtMoney(c.interest)} + ${fmtMoney(c.sdlt.value.tax)} + ${fmtMoney(i.legals)} + ${fmtMoney(i.refurb + c.contingency)}`
      : fmtMoney(c.totalCostIn),
    result: fmtMoney(c.cashInvested),
    note: 'the cash you actually tie up during the project',
  };
  const financeBreakdown: Breakdown | null = i.funding === 'bridging'
    ? {
        label: 'Finance costs',
        formula: 'bridging loan × monthly rate × months, plus fees',
        substituted: `${fmtMoney(c.bridgeLoan)} × ${fmtPct(i.bridgeRatePctMonth)}/month × ${i.months} months + ${fmtMoney(c.arrangement + c.exit)} fees`,
        result: fmtMoney(c.financeCosts),
        note: 'most buyers’ lenders won’t mortgage a resale within 6 months — plan the term around it',
      }
    : null;

  const profitBTBreakdown: Breakdown = {
    label: 'Profit before tax',
    formula: 'sale price − total cost in − selling costs',
    substituted: `${fmtMoney(i.gdv)} − ${fmtMoney(c.totalCostIn)} − ${fmtMoney(c.sellingCosts)}`,
    result: fmtMoney(c.profit),
    note: 'what the project makes before the taxman arrives',
  };
  const profitATBreakdown: Breakdown = {
    label: 'Profit after tax',
    formula: `profit before tax − ${i.flipAs === 'ltd' ? 'corporation tax' : 'income tax and National Insurance'}`,
    substituted: `${fmtMoney(c.profit)} − ${fmtMoney(c.selectedTax)}`,
    result: fmtMoney(c.profitAfterTax),
    note: i.flipAs === 'ltd' ? 'what the company keeps, before you draw it out to yourself' : 'what you keep after income tax on the profit',
  };
  const NO_CASH: Breakdown = {
    label: 'Return on investment',
    formula: 'profit ÷ cash invested × 100',
    substituted: 'no cash invested',
    result: 'not meaningful — nothing was put in',
    note: 'a return needs an investment to measure against',
  };
  const roiBTBreakdown: Breakdown = c.roiBT
    ? {
        label: 'Project return before tax',
        formula: 'profit before tax ÷ cash invested × 100',
        substituted: `${fmtMoney(c.profit)} ÷ ${fmtMoney(c.cashInvested)} × 100`,
        result: fmtPct(c.roiBT.value),
        note: 'a project return over the whole flip, not a yearly rate — measured against all the cash you put in',
      }
    : NO_CASH;
  const roiATBreakdown: Breakdown = c.roiAT === null ? NO_CASH : {
    label: 'Project return after tax',
    formula: 'profit after tax ÷ cash invested × 100',
    substituted: `${fmtMoney(c.profitAfterTax)} ÷ ${fmtMoney(c.cashInvested)} × 100`,
    result: fmtPct(c.roiAT?.value ?? 0),
    note: `after ${i.flipAs === 'ltd' ? 'corporation tax' : 'income tax and National Insurance'} — a project return, not a yearly rate`,
  };

  const profitOnGdvBreakdown: Breakdown = {
    label: 'Profit on sale price',
    formula: 'profit ÷ sale price × 100',
    substituted: `${fmtMoney(c.profit)} ÷ ${fmtMoney(i.gdv)}`,
    result: fmtPct(c.fp.value.profitOnGdv),
    note: 'developers often want 15–20%+ of the end value as margin',
  };

  return {
    verdict: colour,
    verdictCopy,
    lever,
    taxBasisUsed: c.basis,
    profitBeforeTax: { value: c.profit, breakdown: profitBTBreakdown },
    profitOnGdvPct: { value: c.fp.value.profitOnGdv, breakdown: profitOnGdvBreakdown },
    totalCostIn: { value: c.totalCostIn, breakdown: totalCostBreakdown },
    sellingCosts: { value: c.sellingCosts, breakdown: sellingBreakdown },
    cashInvested: { value: c.cashInvested, breakdown: cashBreakdown },
    financeCosts: financeBreakdown ? { value: c.financeCosts, breakdown: financeBreakdown } : null,
    personalTax: { value: c.personalTax.value, breakdown: c.personalTax.breakdown },
    companyTax: { value: c.companyTax.value, breakdown: c.companyTax.breakdown },
    selectedTax: c.selectedTax,
    profitAfterTax: { value: c.profitAfterTax, breakdown: profitATBreakdown },
    roiBeforeTax: { value: c.roiBT?.value ?? 0, breakdown: roiBTBreakdown },
    roiAfterTax: { value: c.roiAT?.value ?? 0, breakdown: roiATBreakdown },
    maxOfferGreen: maxOffer,
    gdvNeededGreen: gdvNeeded,
    stampDutyTax: c.sdlt.value.tax,
  };
}
