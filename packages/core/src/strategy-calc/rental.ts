/**
 * Shared rental cashflow composition — ONE derivation of the letting costs
 * and tax, used by every strategy that ends in a tenancy (BTL, BRRRR, …).
 * Composes src/lib/maths only; no new formulas.
 */
import { monthlyCashflow } from '../maths/cashflow';
import { icr as libIcr, mortgageInterestOnly } from '../maths/lending';
import { ltdTaxOnRentalProfit, taxOnRentalProfit } from '../maths/tax';

export type BuyingAs = 'basic' | 'higher' | 'ltd';

export interface RentalCoreInputs {
  /** The property value the upkeep budget is based on. */
  upkeepBasisPrice: number;
  monthlyRent: number;
  loan: number;
  ratePct: number;
  buyingAs: BuyingAs;
  selfManaged: boolean;
  voidWeeks: number;
  agentPct: number;
  maintPct: number;
  insurancePerYear: number;
  stressRatePct: number;
  icrThreshold: number;
}

export function rentalCore(i: RentalCoreInputs) {
  const mortgage = mortgageInterestOnly(i.loan, i.ratePct / 100);
  const management = i.selfManaged ? 0 : i.monthlyRent * (i.agentPct / 100);
  const maintenance = (i.upkeepBasisPrice * (i.maintPct / 100)) / 12;
  const insurance = i.insurancePerYear / 12;
  // void allowance: N weeks of lost rent a year, spread monthly
  const voidsAnnual = (i.monthlyRent * 12 / 52) * i.voidWeeks;
  const voids = voidsAnnual / 12;
  const before = monthlyCashflow({ rent: i.monthlyRent, mortgage: mortgage.value, management, maintenance, insurance, voids });
  const runningAnnual = (management + maintenance + insurance + voids) * 12;
  // Tax treatment (logged in S4.2): income = rent actually received (net of
  // voids); management/maintenance/insurance are the allowable costs.
  const receivedRent = i.monthlyRent * 12 - voidsAnnual;
  const allowable = (management + maintenance + insurance) * 12;
  const tax = i.buyingAs === 'ltd'
    ? ltdTaxOnRentalProfit({ annualRent: receivedRent, allowableCosts: allowable, mortgageInterest: mortgage.value * 12 })
    : taxOnRentalProfit({ annualRent: receivedRent, allowableCosts: allowable, mortgageInterest: mortgage.value * 12, taxBand: i.buyingAs });
  const after = before.value - tax.value / 12;
  const icrRes = libIcr(i.monthlyRent * 12, i.loan, i.stressRatePct / 100, i.icrThreshold);
  return { mortgage, management, maintenance, insurance, voids, voidsAnnual, before, runningAnnual, tax, after, icrRes };
}
