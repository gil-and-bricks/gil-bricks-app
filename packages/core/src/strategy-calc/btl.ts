/**
 * BTL analysis — a COMPOSITION of src/lib/maths functions only: every figure
 * and breakdown comes from the canonical lib (no new formulas here; the
 * Green-lever solver binary-searches over the same lib functions). Verdict
 * thresholds come from StrategyConfig, never code.
 */
import type { Breakdown, WithBreakdown } from '../maths/breakdown';
import { cashIn as libCashIn, roi as libRoi } from '../maths/investment';
import { grossYield, netYield } from '../maths/yields';
import { stampDuty, type BuyerType, type StampCountry } from '../maths/stampduty';
import { fmtMoney } from '../maths/format';
import { rentalCore, type BuyingAs } from './rental';

export type { BuyingAs };

export interface BtlInputs {
  price: number;
  country: StampCountry;
  monthlyRent: number;
  depositPct: number;
  ratePct: number;
  buyingAs: BuyingAs;
  selfManaged: boolean;
  voidWeeks: number;
  agentPct: number;
  maintPct: number;
  insurancePerYear: number;
  legals: number;
  refurb: number;
  stressRatePct: number;
  taxBasis: BuyerType;
  thresholds: { minCashflowGreen: number; minRoiGreen: number; icrBasic: number; icrHigher: number };
}

import type { VerdictColour } from './verdict';

export interface BtlFigure {
  value: number;
  breakdown: Breakdown;
}

export interface BtlAnalysis {
  verdict: VerdictColour;
  verdictCopy: string;
  lever: string | null;
  stampDuty: WithBreakdown<import('../maths/stampduty').StampDutyResult>;
  cashIn: BtlFigure;
  loan: number;
  mortgageMonthly: BtlFigure;
  cashflowBeforeTax: BtlFigure;
  taxPerYear: BtlFigure;
  cashflowAfterTax: BtlFigure;
  grossYield: BtlFigure;
  netYield: BtlFigure;
  roi: BtlFigure;
  icr: { value: number; passes: boolean; threshold: number; breakdown: Breakdown };
}

/** The raw numbers, computed once per candidate (used by the lever solver). */
function computeCore(i: BtlInputs) {
  const sdlt = stampDuty({ price: i.price, country: i.country, buyerType: i.taxBasis });
  const deposit = i.price * (i.depositPct / 100);
  const loan = i.price - deposit;
  const cash = libCashIn({ deposit, sdlt: sdlt.value.tax, legals: i.legals, refurb: i.refurb, fees: 0 });
  const threshold = i.buyingAs === 'higher' ? i.thresholds.icrHigher : i.thresholds.icrBasic;
  const core = rentalCore({
    upkeepBasisPrice: i.price,
    monthlyRent: i.monthlyRent,
    loan,
    ratePct: i.ratePct,
    buyingAs: i.buyingAs,
    selfManaged: i.selfManaged,
    voidWeeks: i.voidWeeks,
    agentPct: i.agentPct,
    maintPct: i.maintPct,
    insurancePerYear: i.insurancePerYear,
    stressRatePct: i.stressRatePct,
    icrThreshold: threshold,
  });
  const roiRes = libRoi(core.after * 12, cash.value);
  return { sdlt, deposit, loan, cash, mortgage: core.mortgage, before: core.before, tax: core.tax, after: core.after, icrRes: core.icrRes, roiRes, threshold, runningAnnual: core.runningAnnual };
}

function colourOf(core: ReturnType<typeof computeCore>, t: BtlInputs['thresholds']): VerdictColour {
  if (!core.icrRes.passes || core.before.value < 0 || core.after < 0) return 'red';
  if (core.after >= t.minCashflowGreen && core.roiRes.value >= t.minRoiGreen) return 'green';
  return 'amber';
}

/** Smallest rent rise / price cut that reaches `target`, by binary search
 * over the SAME lib-composed computation (no separate formulas to drift). */
function solveLever(i: BtlInputs, target: VerdictColour): { rentUp: number | null; priceDown: number | null } {
  const reaches = (candidate: BtlInputs): boolean => {
    const c = computeCore(candidate);
    const colour = colourOf(c, i.thresholds);
    return target === 'green' ? colour === 'green' : colour !== 'red';
  };
  let rentUp: number | null = null;
  {
    let lo = 0;
    let hi = 5000;
    if (reaches({ ...i, monthlyRent: i.monthlyRent + hi })) {
      while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2;
        if (reaches({ ...i, monthlyRent: i.monthlyRent + mid })) hi = mid;
        else lo = mid;
      }
      rentUp = Math.ceil(hi / 5) * 5;
    }
  }
  let priceDown: number | null = null;
  {
    let lo = 0;
    let hi = i.price - 1000;
    if (hi > 0 && reaches({ ...i, price: i.price - hi })) {
      while (hi - lo > 25) {
        const mid = (lo + hi) / 2;
        if (reaches({ ...i, price: i.price - mid })) hi = mid;
        else lo = mid;
      }
      priceDown = Math.ceil(hi / 250) * 250;
    }
  }
  return { rentUp, priceDown };
}

export function analyseBtl(i: BtlInputs): BtlAnalysis {
  const core = computeCore(i);
  const colour = colourOf(core, i.thresholds);

  let verdictCopy: string;
  if (colour === 'green') {
    verdictCopy = 'Green — this cashflows after tax and passes the lender stress test.';
  } else if (colour === 'amber') {
    verdictCopy = 'Amber — it covers its costs, but the returns are thin for the cash you’d put in.';
  } else {
    verdictCopy = core.icrRes.passes
      ? 'Red — the running costs eat the rent; this loses money each month.'
      : 'Red — the rent doesn’t cover the mortgage at a stressed rate; most lenders won’t lend at this loan size.';
  }

  let lever: string | null = null;
  if (colour !== 'green') {
    const target = colour === 'amber' ? 'green' : 'amber';
    const { rentUp, priceDown } = solveLever(i, target);
    const to = target === 'green' ? 'Green' : 'Amber';
    const from = colour === 'amber' ? 'Amber' : 'Red';
    if (rentUp !== null && priceDown !== null) {
      lever = `A ${fmtMoney(priceDown)} lower price or ${fmtMoney(rentUp)} more rent a month would turn this ${from} to ${to}.`;
    } else if (priceDown !== null) {
      lever = `A ${fmtMoney(priceDown)} lower price would turn this ${from} to ${to}.`;
    } else if (rentUp !== null) {
      lever = `${fmtMoney(rentUp)} more rent a month would turn this ${from} to ${to}.`;
    }
  }

  const afterBreakdown: Breakdown = {
    label: 'Monthly cashflow after tax',
    formula: 'monthly cashflow before tax − the year’s tax spread monthly',
    substituted: `${fmtMoney(core.before.value)} − ${fmtMoney(core.tax.value / 12)}`,
    result: `${fmtMoney(core.after)} per month`,
    note: 'what actually lands in your pocket each month',
  };

  return {
    verdict: colour,
    verdictCopy,
    lever,
    stampDuty: core.sdlt,
    cashIn: { value: core.cash.value, breakdown: core.cash.breakdown },
    loan: core.loan,
    mortgageMonthly: { value: core.mortgage.value, breakdown: core.mortgage.breakdown },
    cashflowBeforeTax: { value: core.before.value, breakdown: core.before.breakdown },
    taxPerYear: { value: core.tax.value, breakdown: core.tax.breakdown },
    cashflowAfterTax: { value: core.after, breakdown: afterBreakdown },
    grossYield: (() => { const g = grossYield(i.monthlyRent * 12, i.price); return { value: g.value, breakdown: g.breakdown }; })(),
    netYield: (() => {
      // reuses computeCore's running costs — one derivation, no drift
      const n = netYield(i.monthlyRent * 12, core.runningAnnual, i.price + core.sdlt.value.tax + i.legals + i.refurb);
      return { value: n.value, breakdown: n.breakdown };
    })(),
    roi: { value: core.roiRes.value, breakdown: core.roiRes.breakdown },
    icr: { value: core.icrRes.value, passes: core.icrRes.passes, threshold: core.threshold, breakdown: core.icrRes.breakdown },
  };
}
