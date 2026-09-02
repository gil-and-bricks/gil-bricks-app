/**
 * BRRRR analysis — a COMPOSITION of src/lib/maths + the shared rentalCore,
 * plus the bridging cost arithmetic (loan × monthly rate × months + fees —
 * simple products, documented in docs/MATHS.md). Money-left-in wording
 * comes from the lib's brrrrOutcome (terminology is LAW); the max-price /
 * ARV-needed tiles bisect over this same computation. Thresholds come from
 * StrategyConfig.
 */
import type { Breakdown } from '../maths/breakdown';
import { brrrrOutcome, roi as libRoi } from '../maths/investment';
import { grossYield } from '../maths/yields';
import { stampDuty, type BuyerType, type StampCountry } from '../maths/stampduty';
import { fmtMoney, fmtPct } from '../maths/format';
import { rentalCore, type BuyingAs } from './rental';

export interface BrrrrStrategyInputs {
  price: number;
  country: StampCountry;
  refurb: number;
  arv: number;
  funding: 'bridging' | 'cash';
  bridgeMonths: number;
  monthlyRent: number;
  ltvPct: number;
  buyingAs: BuyingAs;
  bridgeLoanPct: number;
  bridgeRatePctMonth: number;
  arrangementPct: number;
  exitPct: number;
  legals: number;
  refiLegals: number;
  voidWeeks: number;
  agentPct: number;
  maintPct: number;
  insurancePerYear: number;
  refiRatePct: number;
  stressRatePct: number;
  taxBasis: BuyerType;
  thresholds: { allOutMax: number; minCashflowGreen: number; icrBasic: number; icrHigher: number };
}

import type { VerdictColour } from './verdict';

export interface BrrrrAnalysis {
  verdict: VerdictColour;
  verdictCopy: string;
  lever: string | null;
  outcomeVerdict: string;
  moneyLeftIn: number;
  surplus: number;
  cashInvested: { value: number; breakdown: Breakdown };
  refiLoan: { value: number; breakdown: Breakdown };
  bridging: { loan: number; interest: number; arrangement: number; exit: number; breakdown: Breakdown } | null;
  maxPriceAllOut: number | null;
  arvNeededAllOut: number | null;
  cashflowAfterTax: { value: number; breakdown: Breakdown };
  taxBreakdown: Breakdown;
  roiOnLeftIn: { value: number | null; breakdown: Breakdown };
  grossYieldOnCost: { value: number; breakdown: Breakdown };
  icr: { value: number; passes: boolean; threshold: number; breakdown: Breakdown };
  stampDutyTax: number;
  refinanceCoversBridge: boolean;
  outcomeBreakdown: Breakdown;
}

function core(i: BrrrrStrategyInputs) {
  const sdlt = stampDuty({ price: i.price, country: i.country, buyerType: i.taxBasis });
  const bridgeLoan = i.funding === 'bridging' ? i.price * (i.bridgeLoanPct / 100) : 0;
  const deposit = i.price - bridgeLoan;
  const bridgeInterest = bridgeLoan * (i.bridgeRatePctMonth / 100) * i.bridgeMonths;
  const arrangement = bridgeLoan * (i.arrangementPct / 100);
  const exit = bridgeLoan * (i.exitPct / 100);
  // Cash invested: everything paid out of pocket before the refinance
  // (bridging interest is treated as paid from cash during the term).
  const cashInvested = deposit + arrangement + exit + bridgeInterest + sdlt.value.tax + i.legals + i.refurb;
  const refiLoan = i.arv * (i.ltvPct / 100);
  // Refinance proceeds net of repaying the bridge and the refinance legals.
  const proceeds = refiLoan - bridgeLoan - i.refiLegals;
  // negative proceeds (refinance can't repay the bridge) flow through
  // honestly: the shortfall is genuinely more cash stuck in the deal
  const outcome = brrrrOutcome(cashInvested, proceeds);
  const refinanceCoversBridge = proceeds >= 0;
  const threshold = i.buyingAs === 'higher' ? i.thresholds.icrHigher : i.thresholds.icrBasic;
  const rental = rentalCore({
    upkeepBasisPrice: i.arv,
    monthlyRent: i.monthlyRent,
    loan: refiLoan,
    ratePct: i.refiRatePct,
    buyingAs: i.buyingAs,
    selfManaged: false,
    voidWeeks: i.voidWeeks,
    agentPct: i.agentPct,
    maintPct: i.maintPct,
    insurancePerYear: i.insurancePerYear,
    stressRatePct: i.stressRatePct,
    icrThreshold: threshold,
  });
  return { sdlt, bridgeLoan, deposit, bridgeInterest, arrangement, exit, cashInvested, refiLoan, proceeds, outcome, refinanceCoversBridge, rental, threshold };
}

function colourOf(c: ReturnType<typeof core>, i: BrrrrStrategyInputs): VerdictColour {
  if (!c.refinanceCoversBridge || !c.rental.icrRes.passes || c.rental.before.value < 0 || c.rental.after < 0) return 'red';
  if (c.outcome.moneyLeftIn <= i.thresholds.allOutMax && c.rental.after >= i.thresholds.minCashflowGreen) return 'green';
  return 'amber';
}

/** Highest price at which every pound comes back out (rounded DOWN to £250). */
export function maxPriceForAllOut(i: BrrrrStrategyInputs): number | null {
  const allOutAt = (price: number): boolean => {
    const c = core({ ...i, price });
    return c.refinanceCoversBridge && c.outcome.moneyLeftIn <= 1;
  };
  let lo = 1000;
  let hi = Math.max(i.arv * 2, i.price * 2);
  if (!allOutAt(lo)) return null;
  if (allOutAt(hi)) return Math.floor(hi / 250) * 250;
  while (hi - lo > 25) {
    const mid = (lo + hi) / 2;
    if (allOutAt(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / 250) * 250;
}

/** Smallest end value that pulls every pound back out (rounded UP to £250). */
export function arvNeededForAllOut(i: BrrrrStrategyInputs): number | null {
  const allOutAt = (arv: number): boolean => {
    const c = core({ ...i, arv });
    return c.refinanceCoversBridge && c.outcome.moneyLeftIn <= 1;
  };
  let lo = 1000;
  let hi = Math.max(i.arv * 4, i.price * 4);
  if (allOutAt(lo)) return Math.ceil(lo / 250) * 250;
  if (!allOutAt(hi)) return null;
  while (hi - lo > 25) {
    const mid = (lo + hi) / 2;
    if (allOutAt(mid)) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi / 250) * 250;
}

function solveLever(i: BrrrrStrategyInputs): { priceDown: number | null; arvUp: number | null } {
  const green = (candidate: BrrrrStrategyInputs): boolean => colourOf(core(candidate), i) === 'green';
  let priceDown: number | null = null;
  {
    let lo = 0;
    let hi = i.price - 1000;
    if (hi > 0 && green({ ...i, price: i.price - hi })) {
      while (hi - lo > 25) {
        const mid = (lo + hi) / 2;
        if (green({ ...i, price: i.price - mid })) hi = mid;
        else lo = mid;
      }
      priceDown = Math.ceil(hi / 250) * 250;
    }
  }
  let arvUp: number | null = null;
  {
    let lo = 0;
    let hi = i.arv * 3;
    if (green({ ...i, arv: i.arv + hi })) {
      while (hi - lo > 25) {
        const mid = (lo + hi) / 2;
        if (green({ ...i, arv: i.arv + mid })) hi = mid;
        else lo = mid;
      }
      arvUp = Math.ceil(hi / 250) * 250;
    }
  }
  return { priceDown, arvUp };
}

export function analyseBrrrr(i: BrrrrStrategyInputs): BrrrrAnalysis {
  const c = core(i);
  const colour = colourOf(c, i);

  let verdictCopy: string;
  if (colour === 'green') {
    verdictCopy = c.outcome.moneyLeftIn <= 1
      ? `Green — ${c.outcome.verdict.toLowerCase() === 'all money out' ? 'all your money comes back out' : 'all your money comes back out, plus some'}, and it cashflows after the refinance.`
      : 'Green — nearly all your money comes back out, and it cashflows after the refinance.';
  } else if (colour === 'amber') {
    verdictCopy = c.outcome.moneyLeftIn > i.thresholds.allOutMax
      ? `Amber — the deal works, but ${fmtMoney(c.outcome.moneyLeftIn)} stays locked in after the refinance.`
      : `Amber — your money comes back out, but the monthly cashflow is thin (under ${fmtMoney(i.thresholds.minCashflowGreen)} after tax).`;
  } else if (!c.refinanceCoversBridge) {
    verdictCopy = 'Red — the refinance wouldn’t even repay the bridging loan. The end value or the loan-to-value is far too low for this price.';
  } else if (!c.rental.icrRes.passes) {
    verdictCopy = 'Red — the rent doesn’t cover the refinance mortgage at a stressed rate; most lenders won’t refinance at this loan size.';
  } else {
    verdictCopy = 'Red — after the refinance the running costs eat the rent; this loses money each month.';
  }

  let lever: string | null = null;
  if (colour !== 'green') {
    const { priceDown, arvUp } = solveLever(i);
    // the smaller of the two moves, as absolute £
    if (priceDown !== null && (arvUp === null || priceDown <= arvUp)) {
      lever = `A ${fmtMoney(priceDown)} lower purchase price would make this Green.`;
    } else if (arvUp !== null) {
      lever = `A ${fmtMoney(arvUp)} higher end value would make this Green — only if the works genuinely justify it.`;
    }
  }

  const taxName = i.country === 'W92000004' ? 'Land Transaction Tax' : 'Stamp Duty';
  const cashInvestedBreakdown: Breakdown = {
    label: 'Cash invested',
    formula: i.funding === 'bridging'
      ? `deposit + bridging fees + bridging interest + ${taxName} + legals + refurb`
      : `full price + ${taxName} + legals + refurb`,
    substituted: i.funding === 'bridging'
      ? `${fmtMoney(c.deposit)} + ${fmtMoney(c.arrangement + c.exit)} + ${fmtMoney(c.bridgeInterest)} + ${fmtMoney(c.sdlt.value.tax)} + ${fmtMoney(i.legals)} + ${fmtMoney(i.refurb)}`
      : `${fmtMoney(i.price)} + ${fmtMoney(c.sdlt.value.tax)} + ${fmtMoney(i.legals)} + ${fmtMoney(i.refurb)}`,
    result: fmtMoney(c.cashInvested),
    note: 'every pound you put in before the refinance',
  };
  const refiBreakdown: Breakdown = {
    label: 'Refinance loan',
    formula: 'end value × loan-to-value',
    substituted: `${fmtMoney(i.arv)} × ${fmtPct(i.ltvPct)}`,
    result: fmtMoney(c.refiLoan),
    note: c.proceeds >= 0
      ? `the new mortgage; repaying the bridge and ${fmtMoney(i.refiLegals)} refinance legals leaves ${fmtMoney(c.proceeds)} out`
      : `the new mortgage falls ${fmtMoney(-c.proceeds)} short of repaying the bridge and refinance legals`,
  };
  const bridging = i.funding === 'bridging'
    ? {
        loan: c.bridgeLoan,
        interest: c.bridgeInterest,
        arrangement: c.arrangement,
        exit: c.exit,
        breakdown: {
          label: 'Bridging cost',
          formula: 'loan × monthly rate × months, plus fees',
          substituted: `${fmtMoney(c.bridgeLoan)} × ${fmtPct(i.bridgeRatePctMonth)}/month × ${i.bridgeMonths} months + ${fmtMoney(c.arrangement + c.exit)} fees`,
          result: fmtMoney(c.bridgeInterest + c.arrangement + c.exit),
          note: 'short-term money is expensive — the refinance pays the loan itself back',
        } as Breakdown,
      }
    : null;

  const totalCost = i.price + i.refurb + c.sdlt.value.tax + i.legals + i.refiLegals + (bridging ? c.bridgeInterest + c.arrangement + c.exit : 0);
  const gy = grossYield(i.monthlyRent * 12, totalCost);
  // the lib breakdown says "price"; this denominator is the whole project
  const gyBreakdown: Breakdown = {
    label: 'Gross yield on total cost',
    formula: 'annual rent ÷ everything the project cost × 100',
    substituted: `${fmtMoney(i.monthlyRent * 12)} ÷ ${fmtMoney(totalCost)} × 100`,
    result: fmtPct(gy.value),
    note: 'total cost = price + refurb + purchase tax + all legals + bridging costs',
  };

  let roiValue: number | null = null;
  let roiBreakdown: Breakdown;
  if (c.outcome.moneyLeftIn > 1) {
    const r = libRoi(c.rental.after * 12, c.outcome.moneyLeftIn);
    roiValue = r.value;
    // the lib breakdown calls the denominator "total cash in"; here it is the
    // money you could NOT pull back out — a much smaller number — so give it
    // its own honest wording (mirrors the else-branch)
    roiBreakdown = {
      label: 'Return on money left in',
      formula: 'your after-tax profit for the year ÷ the cash you couldn’t pull back out × 100',
      substituted: `${fmtMoney(c.rental.after * 12)} ÷ ${fmtMoney(c.outcome.moneyLeftIn)} × 100`,
      result: fmtPct(r.value),
      note: 'measured on the cash the refinance left stuck in the deal — not your whole cash in',
    };
  } else {
    roiBreakdown = {
      label: 'Return on money left in',
      formula: 'annual after-tax profit ÷ money left in',
      substituted: `${fmtMoney(c.rental.after * 12)} ÷ ${fmtMoney(0)}`,
      result: 'No cash left in — return is effectively infinite',
      note: 'with nothing left in the deal, every pound of profit is pure return',
    };
  }

  const outcomeBreakdown: Breakdown = {
    label: 'Money left in',
    formula: 'cash invested − (refinance loan − bridging repaid − refinance legals)',
    substituted: `${fmtMoney(c.cashInvested)} − (${fmtMoney(c.refiLoan)} − ${fmtMoney(c.bridgeLoan)} − ${fmtMoney(i.refiLegals)})`,
    result: c.outcome.verdict,
    note: 'refinancing pulls cash back out; whatever it does not cover stays in the deal',
  };

  return {
    verdict: colour,
    verdictCopy,
    lever,
    outcomeVerdict: c.outcome.verdict,
    moneyLeftIn: c.outcome.moneyLeftIn,
    surplus: c.outcome.surplus,
    cashInvested: { value: c.cashInvested, breakdown: cashInvestedBreakdown },
    refiLoan: { value: c.refiLoan, breakdown: refiBreakdown },
    bridging,
    maxPriceAllOut: maxPriceForAllOut(i),
    arvNeededAllOut: arvNeededForAllOut(i),
    cashflowAfterTax: {
      value: c.rental.after,
      breakdown: {
        label: 'Monthly cashflow after tax',
        formula: 'end-state rent − refinance mortgage − running costs − tax, monthly',
        substituted: `${fmtMoney(c.rental.before.value)} before tax − ${fmtMoney(c.rental.tax.value / 12)} tax`,
        result: `${fmtMoney(c.rental.after)} per month`,
        note: 'the deal you own AFTER the refinance',
      },
    },
    taxBreakdown: c.rental.tax.breakdown,
    roiOnLeftIn: { value: roiValue, breakdown: roiBreakdown },
    grossYieldOnCost: { value: gy.value, breakdown: gyBreakdown },
    icr: { value: c.rental.icrRes.value, passes: c.rental.icrRes.passes, threshold: c.threshold, breakdown: c.rental.icrRes.breakdown },
    stampDutyTax: c.sdlt.value.tax,
    refinanceCoversBridge: c.refinanceCoversBridge,
    outcomeBreakdown,
  };
}
