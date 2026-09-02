/**
 * Small-HMO analysis (3–6 occupants, planning class C4) — a COMPOSITION of
 * src/lib/maths. BRICKS-AND-MORTAR ONLY: no commercial/investment valuation
 * exists anywhere here (hard rule). The operating-% cost model replaces
 * rentalCore's itemised costs, but tax/ICR/mortgage/yield all come from the
 * same lib functions, so treatments stay identical.
 *
 * Room-size minimums are the statutory HMO licensing floors
 * (Licensing of HMOs (Mandatory Conditions of Licences) (England)
 * Regulations 2018, SI 2018/616):
 * 6.51 sqm one adult, 10.22 sqm two adults, 4.64 sqm child under 10;
 * under 4.64 sqm cannot be a bedroom at all. Councils can require larger.
 */
import type { Breakdown } from '../maths/breakdown';
import { cashIn as libCashIn, roi as libRoi } from '../maths/investment';
import { grossYield, netYield } from '../maths/yields';
import { monthlyCashflow } from '../maths/cashflow';
import { icr as libIcr, mortgageInterestOnly } from '../maths/lending';
import { ltdTaxOnRentalProfit, taxOnRentalProfit } from '../maths/tax';
import { stampDuty, type BuyerType, type StampCountry } from '../maths/stampduty';
import { fmtMoney, fmtPct } from '../maths/format';
import type { BuyingAs } from './rental';

export const ROOM_MIN_SINGLE = 6.51;
export const ROOM_MIN_DOUBLE = 10.22;
export const ROOM_MIN_CHILD = 4.64;

export type RoomOccupancy = 'single' | 'double' | 'child';

export interface RoomCheck {
  sqm: number;
  occupancy: RoomOccupancy;
  ok: boolean;
  message: string;
}

/** Flags each room against the statutory minimums. */
export function checkRoomSizes(rooms: { sqm: number; occupancy: RoomOccupancy }[]): RoomCheck[] {
  return rooms.map(({ sqm, occupancy }) => {
    if (!Number.isFinite(sqm) || sqm <= 0) {
      return { sqm, occupancy, ok: false, message: 'Enter the room’s floor area' };
    }
    if (sqm < ROOM_MIN_CHILD) {
      return { sqm, occupancy, ok: false, message: `Under ${ROOM_MIN_CHILD} sqm — cannot be used as a bedroom at all` };
    }
    const min = occupancy === 'double' ? ROOM_MIN_DOUBLE : occupancy === 'single' ? ROOM_MIN_SINGLE : ROOM_MIN_CHILD;
    if (sqm < min) {
      return { sqm, occupancy, ok: false, message: `Under the ${min} sqm minimum for ${occupancy === 'double' ? 'two adults' : occupancy === 'single' ? 'one adult' : 'a child under 10'}` };
    }
    return { sqm, occupancy, ok: true, message: 'Meets the statutory minimum' };
  });
}

export interface HmoInputs {
  price: number;
  country: StampCountry;
  rooms: number;
  roomRent: number;
  billsIncluded: boolean;
  refurb: number;
  buyingAs: BuyingAs;
  selfManaged: boolean;
  depositPct: number;
  ratePct: number;
  opCostPct: number;
  licenceFee: number;
  licenceYears: number;
  compliancePerYear: number;
  legals: number;
  stressRatePct: number;
  taxBasis: BuyerType;
  /** Number of rooms below the legal minimum size, or null when unverified
   * (e.g. read from a sale listing with no room dimensions — E7). */
  roomSizeFailures: number | null;
  thresholds: { minCashflowGreen: number; minRoiGreen: number; icrBasic: number; icrHigher: number };
}

import type { VerdictColour } from './verdict';

export interface HmoAnalysis {
  verdict: VerdictColour;
  verdictCopy: string;
  lever: string | null;
  /** Raw green-target lever (surfaced for the Deal Score binding constraint). */
  greenLever: { rentUp: number | null; priceDown: number | null };
  licence: { level: 'mandatory' | 'maybe'; copy: string };
  grossIncome: { value: number; breakdown: Breakdown };
  operatingCosts: { value: number; breakdown: Breakdown };
  noi: { value: number; breakdown: Breakdown };
  cashflowBeforeTax: { value: number; breakdown: Breakdown };
  taxPerYear: { value: number; breakdown: Breakdown };
  cashflowAfterTax: { value: number; breakdown: Breakdown };
  grossYield: { value: number; breakdown: Breakdown };
  netYield: { value: number; breakdown: Breakdown };
  roi: { value: number; breakdown: Breakdown };
  cashIn: { value: number; breakdown: Breakdown };
  icr: { value: number; passes: boolean; threshold: number; breakdown: Breakdown };
  stampDutyTax: number;
}

function core(i: HmoInputs) {
  // A company (Ltd/SPV) buying residential always pays the additional-property
  // rates — it can never be 'only property' or a first-time buyer (E8.1). Mirrors flip.ts.
  const basis: BuyerType = i.buyingAs === 'ltd' ? 'additional' : i.taxBasis;
  const sdlt = stampDuty({ price: i.price, country: i.country, buyerType: basis });
  const deposit = i.price * (i.depositPct / 100);
  const loan = i.price - deposit;
  const cash = libCashIn({ deposit, sdlt: sdlt.value.tax, legals: i.legals, refurb: i.refurb, fees: 0 });
  const mortgage = mortgageInterestOnly(loan, i.ratePct / 100);
  const grossIncome = i.rooms * i.roomRent * 12;
  const opCosts = grossIncome * (i.opCostPct / 100);
  const licenceAnnual = i.licenceFee / i.licenceYears;
  const otherAnnual = i.compliancePerYear + licenceAnnual;
  const noi = grossIncome - opCosts - otherAnnual;
  // lib monthlyCashflow gives the VALUE; the honest labels live in our own breakdown
  const before = monthlyCashflow({
    rent: grossIncome / 12,
    mortgage: mortgage.value,
    management: opCosts / 12,
    maintenance: i.compliancePerYear / 12,
    insurance: licenceAnnual / 12,
    voids: 0,
  });
  const allowable = opCosts + otherAnnual;
  const tax = i.buyingAs === 'ltd'
    ? ltdTaxOnRentalProfit({ annualRent: grossIncome, allowableCosts: allowable, mortgageInterest: mortgage.value * 12 })
    : taxOnRentalProfit({ annualRent: grossIncome, allowableCosts: allowable, mortgageInterest: mortgage.value * 12, taxBand: i.buyingAs });
  const after = before.value - tax.value / 12;
  const threshold = i.buyingAs === 'higher' ? i.thresholds.icrHigher : i.thresholds.icrBasic;
  const icrRes = libIcr(grossIncome, loan, i.stressRatePct / 100, threshold);
  const totalCost = i.price + sdlt.value.tax + i.legals + i.refurb;
  // gross yield is rent ÷ PRICE (docs/definitions.md); net yield below uses the all-in cost
  const gy = grossYield(grossIncome, i.price);
  const ny = netYield(grossIncome, allowable, totalCost);
  const roiRes = libRoi(after * 12, cash.value);
  return { sdlt, deposit, loan, cash, mortgage, grossIncome, opCosts, licenceAnnual, otherAnnual, noi, before, tax, after, threshold, icrRes, totalCost, gy, ny, roiRes };
}

function colourOf(c: ReturnType<typeof core>, i: HmoInputs): VerdictColour {
  if (!c.icrRes.passes || c.before.value < 0 || c.after < 0) return 'red';
  const green = c.after >= i.thresholds.minCashflowGreen && c.roiRes.value >= i.thresholds.minRoiGreen && i.roomSizeFailures === 0;
  return green ? 'green' : 'amber';
}

function solveLever(i: HmoInputs): { rentUp: number | null; priceDown: number | null } {
  // levers can't fix failing room sizes — solve with failures set aside
  const green = (candidate: HmoInputs): boolean => colourOf(core(candidate), { ...candidate, roomSizeFailures: 0 }) === 'green';
  let rentUp: number | null = null;
  {
    let lo = 0;
    let hi = 2000;
    if (green({ ...i, roomRent: i.roomRent + hi })) {
      while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2;
        if (green({ ...i, roomRent: i.roomRent + mid })) hi = mid;
        else lo = mid;
      }
      rentUp = Math.ceil(hi / 5) * 5;
    }
  }
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
  return { rentUp, priceDown };
}

export function analyseHmo(i: HmoInputs): HmoAnalysis {
  const c = core(i);
  const colour = colourOf(c, i);

  let verdictCopy: string;
  if (colour === 'green') {
    verdictCopy = 'Green — the rooms cashflow well after tax, the lender stress test passes and the room sizes are legal.';
  } else if (colour === 'amber') {
    const rf = i.roomSizeFailures ?? 0; // null (unverified) ⇒ no room-fail copy
    const roomsPhrase = rf === 1 ? 'one room fails' : `${rf} rooms fail`;
    const moneyAloneGreen = c.after >= i.thresholds.minCashflowGreen && c.roiRes.value >= i.thresholds.minRoiGreen;
    if (rf > 0 && moneyAloneGreen) {
      verdictCopy = `Amber — the money works, but ${roomsPhrase} the legal size minimums.`;
    } else if (rf > 0) {
      verdictCopy = `Amber — the returns are thin for an HMO’s extra work, and ${roomsPhrase} the legal size minimums.`;
    } else {
      verdictCopy = 'Amber — it covers its costs, but the returns are thin for an HMO’s extra work.';
    }
  } else if (!c.icrRes.passes) {
    verdictCopy = 'Red — the room income doesn’t cover the mortgage at a stressed rate; most lenders won’t lend at this loan size.';
  } else if (c.before.value >= 0) {
    verdictCopy = 'Red — the tax bill pushes this underwater; it loses money each month after tax.';
  } else {
    verdictCopy = 'Red — the running costs eat the room income; this loses money each month.';
  }

  let lever: string | null = null;
  if (colour !== 'green' && i.roomSizeFailures === 0) {
    const { rentUp, priceDown } = solveLever(i);
    if (rentUp !== null && priceDown !== null) {
      lever = `${fmtMoney(rentUp)} more rent per room, or a ${fmtMoney(priceDown)} lower price, would make this Green.`;
    } else if (rentUp !== null) {
      lever = `${fmtMoney(rentUp)} more rent per room would make this Green.`;
    } else if (priceDown !== null) {
      lever = `A ${fmtMoney(priceDown)} lower price would make this Green.`;
    }
  }

  // Licensing (logged simplification: occupants ≈ one per lettable room)
  const licence = i.rooms >= 5
    ? { level: 'mandatory' as const, copy: 'Mandatory HMO licence required — 5 or more occupants from two or more households. The licence fee is already in the running costs.' }
    : { level: 'maybe' as const, copy: 'A licence may still be needed — many councils run additional licensing schemes; check yours.' };

  const grossBreakdown: Breakdown = {
    label: 'Gross room income',
    formula: 'rooms × rent per room × 12',
    substituted: `${i.rooms} × ${fmtMoney(i.roomRent)} × 12`,
    result: `${fmtMoney(c.grossIncome)} a year`,
    note: i.billsIncluded ? 'bills included in the rent — the operating costs cover them' : 'bills paid by the tenants on top',
  };
  const opBreakdown: Breakdown = {
    label: 'Operating costs',
    formula: 'gross room income × operating %',
    substituted: `${fmtMoney(c.grossIncome)} × ${fmtPct(i.opCostPct)}`,
    result: `${fmtMoney(c.opCosts)} a year`,
    note: `covers ${i.billsIncluded ? 'bills, broadband, ' : ''}cleaning, voids, maintenance, insurance${i.selfManaged ? '' : ' and management'} — plus ${fmtMoney(i.compliancePerYear)}/yr compliance and ${fmtMoney(c.licenceAnnual)}/yr licence on top`,
  };
  const noiBreakdown: Breakdown = {
    label: 'Net operating income',
    formula: 'gross room income − operating costs − compliance − licence',
    substituted: `${fmtMoney(c.grossIncome)} − ${fmtMoney(c.opCosts)} − ${fmtMoney(i.compliancePerYear)} − ${fmtMoney(c.licenceAnnual)}`,
    result: `${fmtMoney(c.noi)} a year`,
    note: 'what the building earns before the mortgage and tax',
  };
  const beforeBreakdown: Breakdown = {
    label: 'Monthly cashflow before tax',
    formula: 'net operating income ÷ 12 − mortgage',
    substituted: `${fmtMoney(c.noi / 12)} − ${fmtMoney(c.mortgage.value)}`,
    result: `${fmtMoney(c.before.value)} per month`,
    note: 'the whole house, not per room',
  };
  const afterBreakdown: Breakdown = {
    label: 'Monthly cashflow after tax',
    formula: 'cashflow before tax − the year’s tax spread monthly',
    substituted: `${fmtMoney(c.before.value)} − ${fmtMoney(c.tax.value / 12)}`,
    result: `${fmtMoney(c.after)} per month`,
    note: 'what actually lands in your pocket each month',
  };

  return {
    verdict: colour,
    verdictCopy,
    lever,
    greenLever: solveLever(i),
    licence,
    grossIncome: { value: c.grossIncome, breakdown: grossBreakdown },
    operatingCosts: { value: c.opCosts, breakdown: opBreakdown },
    noi: { value: c.noi, breakdown: noiBreakdown },
    cashflowBeforeTax: { value: c.before.value, breakdown: beforeBreakdown },
    taxPerYear: { value: c.tax.value, breakdown: c.tax.breakdown },
    cashflowAfterTax: { value: c.after, breakdown: afterBreakdown },
    grossYield: { value: c.gy.value, breakdown: c.gy.breakdown },
    netYield: { value: c.ny.value, breakdown: c.ny.breakdown },
    roi: { value: c.roiRes.value, breakdown: c.roiRes.breakdown },
    cashIn: { value: c.cash.value, breakdown: c.cash.breakdown },
    icr: { value: c.icrRes.value, passes: c.icrRes.passes, threshold: c.threshold, breakdown: c.icrRes.breakdown },
    stampDutyTax: c.sdlt.value.tax,
  };
}
