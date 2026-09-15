/**
 * X1 — THE FOUR FIGURES ZONE ONE MAY SHOW, and why there are only four.
 *
 * EVERY ONE OF THESE IS DERIVABLE FROM THE LISTING ALONE. That is the whole
 * test for whether a number belongs on the panel: if it needs the user to tell
 * us the rent, the end value or the refurb budget, it is a number the panel
 * would be GUESSING, and a guessed figure presented in the same typeface as a
 * read one is indistinguishable from a fact.
 *
 * So the rent is gone, the end value is gone, and with them the cashflow, the
 * yield and the score. What is left is arithmetic on the asking price:
 *
 *   ASKING PRICE — read from the listing.
 *   PER SQUARE METRE — the price over the floor area. The one figure that can be
 *     put against real sold evidence, which `priceBand` then does.
 *   THE PURCHASE TAX — SDLT or LTT, from the price and the country, at the
 *     ADDITIONAL-PROPERTY rate. Investors are who this is for, the surcharge is
 *     usually most of the bill, and it is the number people get wrong; assuming
 *     the lower rate would understate the cash needed by thousands. The panel
 *     says the assumption out loud rather than hiding it.
 *   CASH NEEDED TO BUY — deposit + tax + legal costs. Not a forecast: three
 *     figures added up, each of which is stated.
 *
 * WHAT THIS DELIBERATELY DOES NOT RETURN is any ratio that reads as a verdict.
 * There is no score here and no rating, because there is no honest one to give.
 */
import { stampDuty, type StampCountry } from '../maths/stampduty';

/**
 * HOW THE PURCHASE IS FUNDED, which is the one thing about a strategy that
 * genuinely changes the cash you need on day one.
 *
 * A MORTGAGE takes a deposit and nothing else up front. A BRIDGE takes the same
 * kind of deposit AND an arrangement fee charged on the loan — typically 2% of
 * 75% of the price, which on a £164,000 house is £2,460 of real money that
 * appears nowhere on the listing and that people routinely forget.
 *
 * That difference is why the strategy buttons are not decoration: BTL and HMO
 * are mortgage purchases, Flip and BRRRR default to a bridge, and the cash
 * needed genuinely differs between them.
 */
export interface Funding {
  kind: 'mortgage' | 'bridging';
  /** Bridging only: the share of the price the bridge advances, percent. */
  loanPct?: number;
  /** Bridging only: the arrangement fee charged on that loan, percent. */
  arrangementPct?: number;
}

export interface TriageNumbersInput {
  askingPrice: number | null;
  floorAreaSqm: number | null;
  country: StampCountry;
  /** Cash share of the price, percent — from strategy config, never typed here. */
  depositPct: number;
  /** Conveyancing and survey, from strategy config. */
  legals: number;
  /** How this strategy funds the purchase. Defaults to a mortgage. */
  funding?: Funding;
  /** Transaction date for the band tables; injected so it is testable. */
  date?: string;
}

export interface TriageNumbers {
  askingPrice: number | null;
  /** Price per square metre, rounded. Null without a price or a floor area. */
  ppsqm: number | null;
  /** SDLT in England, LTT in Wales — the label differs, the field does not. */
  purchaseTax: number | null;
  /** Deposit + tax + legals (+ the bridge fee). Null without a price. */
  cashNeeded: number | null;
  depositPct: number;
  /** The bridging arrangement fee, where the strategy uses a bridge. */
  arrangementFee: number | null;
  isWales: boolean;
}

export function triageNumbers(input: TriageNumbersInput): TriageNumbers {
  const price = typeof input.askingPrice === 'number' && input.askingPrice > 0 ? input.askingPrice : null;
  const area = typeof input.floorAreaSqm === 'number' && input.floorAreaSqm > 0 ? input.floorAreaSqm : null;
  const isWales = input.country === 'W92000004';

  if (price === null) {
    return {
      askingPrice: null, ppsqm: null, purchaseTax: null, cashNeeded: null,
      depositPct: input.depositPct, arrangementFee: null, isWales,
    };
  }

  // 'additional' is the honest default for this audience. A tool for investors
  // that quoted the owner-occupier rate would understate the bill by thousands.
  const tax = stampDuty({ price, country: input.country, buyerType: 'additional', date: input.date });
  const purchaseTax = Math.round(tax.value.tax);
  const deposit = Math.round((price * input.depositPct) / 100);

  // The bridge's arrangement fee is cash on day one, and it is on no listing.
  const f = input.funding;
  const arrangementFee = f?.kind === 'bridging'
    ? Math.round((price * (f.loanPct ?? 75) / 100) * ((f.arrangementPct ?? 2) / 100))
    : null;

  return {
    askingPrice: price,
    ppsqm: area === null ? null : Math.round(price / area),
    purchaseTax,
    cashNeeded: deposit + purchaseTax + Math.round(input.legals) + (arrangementFee ?? 0),
    depositPct: input.depositPct,
    arrangementFee,
    isWales,
  };
}
