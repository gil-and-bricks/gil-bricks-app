/**
 * Gross and net rental yield for the standalone tool (T2). PURE: hand it a
 * price, a rent and the running costs and it does the arithmetic.
 *
 * It composes the LOCKED definitions (grossYield, netYield) and mirrors the
 * analyser's letting-cost model exactly (strategy-calc/rental.ts): management
 * on the rent, maintenance on the price, insurance and ground rent as annual
 * figures, voids as N weeks of lost rent. No new formula lives here.
 *
 * ONE difference, stated everywhere it matters: this divides by the PRICE,
 * because the tool asks for nothing else. The analyser divides by the all-in
 * cost — price plus stamp duty, buying costs and refurb — so its net yield is
 * lower on the same property, and that is the honest number to buy on.
 */
import { fmtMoney, fmtPct } from '../maths/format';
import { grossYield, netYield } from '../maths/yields';
import { assertNonNegative, assertPositive, type Breakdown } from '../maths/breakdown';
import { strategies } from '../strategies';

export interface RentalCosts {
  /** Letting agent fee, % of rent. Zero when they self-manage. */
  managementPct: number;
  /** Yearly upkeep budget, % of the price. */
  maintPct: number;
  /** Landlord insurance, £ a year. */
  insurance: number;
  /** Weeks a year with no tenant. */
  voidWeeks: number;
  /** Ground rent or service charge, £ a year. Zero for most freeholds. */
  groundRent: number;
}

export interface RentalYieldInput {
  price: number;
  monthlyRent: number;
  costs: RentalCosts;
}

export interface CostLines {
  management: number;
  maintenance: number;
  insurance: number;
  voids: number;
  groundRent: number;
}

export interface RentalYieldResult {
  /** Rent for a full year, before any voids. */
  annualRent: number;
  /** Each running cost for a year. */
  lines: CostLines;
  totalCosts: number;
  /** Annual rent ÷ price. */
  gross: number;
  /** (Annual rent − running costs) ÷ price. */
  net: number;
  /** How many percentage points the costs take off the headline. Taken from
   *  the figures as they are SHOWN (one decimal place), so the sentence
   *  "gross is X, net is Y, the gap is Z" always adds up on screen. */
  gap: number;
  /** Both workings, straight from the locked definitions, for the maths panel. */
  breakdowns: { gross: Breakdown; net: Breakdown };
  /** The net working — the number that matters. */
  breakdown: Breakdown;
}

/**
 * The defaults the analyser already uses, read from the buy-to-let strategy
 * config so a change there moves the tool too. Ground rent is not an analyser
 * field: most freehold houses have none, so it starts at zero.
 */
export function rentalCostDefaults(): RentalCosts {
  const btl = strategies.find((s) => s.id === 'btl');
  const val = (key: string, fallback: number): number => {
    const field = btl?.assumptions.find((f) => f.key === key);
    const n = Number(field?.default);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    managementPct: val('agentPct', 12),
    maintPct: val('maintPct', 1),
    insurance: val('insurance', 300),
    voidWeeks: val('voidWeeks', 5),
    groundRent: 0,
  };
}

/** One decimal place — the precision fmtPct shows. */
const round1 = (n: number): number => Math.round(n * 10) / 10;

export function rentalYield(input: RentalYieldInput): RentalYieldResult {
  const { price, monthlyRent, costs } = input;
  assertPositive({ price });
  assertNonNegative({
    monthlyRent,
    managementPct: costs.managementPct,
    maintPct: costs.maintPct,
    insurance: costs.insurance,
    voidWeeks: costs.voidWeeks,
    groundRent: costs.groundRent,
  });
  if (costs.voidWeeks > 52) throw new RangeError('voidWeeks cannot be more than 52');

  const annualRent = monthlyRent * 12;
  // Same shapes as the analyser: agent fee on the rent, upkeep on the price,
  // voids as weeks of lost rent.
  const lines: CostLines = {
    management: annualRent * (costs.managementPct / 100),
    maintenance: price * (costs.maintPct / 100),
    insurance: costs.insurance,
    voids: (annualRent / 52) * costs.voidWeeks,
    groundRent: costs.groundRent,
  };
  const totalCosts = lines.management + lines.maintenance + lines.insurance + lines.voids + lines.groundRent;
  const grossWork = grossYield(annualRent, price);
  const netWork = netYield(annualRent, totalCosts, price);
  const gross = grossWork.value;
  const net = netWork.value;

  return {
    annualRent,
    lines,
    totalCosts,
    gross,
    net,
    gap: round1(gross) - round1(net),
    breakdowns: { gross: grossWork.breakdown, net: netWork.breakdown },
    breakdown: {
      label: 'Net yield',
      formula: '(annual rent − running costs) ÷ price × 100',
      substituted: `(${fmtMoney(annualRent)} − ${fmtMoney(totalCosts)}) ÷ ${fmtMoney(price)} × 100`,
      result: `${fmtPct(net)} net, against ${fmtPct(gross)} gross`,
      note: 'costs are yours to set; the mortgage is not in either figure',
    },
  };
}
