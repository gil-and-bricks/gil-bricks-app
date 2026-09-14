/**
 * DP1 — BUILDING THE PACK'S NUMBERS.
 *
 * The pack is NOT a copy of the analyser. The analyser exists to help the user
 * judge a deal; the pack exists to present one. So this takes the same engines
 * — the numbers must agree, and there is only one place maths lives — and
 * deliberately picks a SHORT ALLOW-LIST out of them.
 *
 * WHY AN ALLOW-LIST AND NOT AN OMIT-LIST. `BtlAnalysis` carries `verdict`,
 * `verdictCopy` and `lever` alongside the figures. Spreading it and deleting
 * three keys would mean the next field added to an analysis silently appears in
 * somebody's investor document. Naming what goes IN means a new field never
 * arrives by accident, and the test that asserts no verdict reaches a pack is
 * then checking a property the code already has.
 *
 * EVERY FIGURE GOES THROUGH `figure()`, which refuses one with no basis. That
 * is the whole design: the pack cannot print a number it cannot explain,
 * because there is no code path that produces one.
 */
import { figure, type EvidencedFigure } from './honesty';

/** What the pack shows, per strategy. Nothing else crosses the boundary. */
export interface PackNumbers {
  /** The one or two numbers that lead for this strategy. */
  headline: EvidencedFigure[];
  /** Purchase, tax, refurb, costs — the basics, kept basic. */
  costs: EvidencedFigure[];
  /** Return and yield. */
  returns: EvidencedFigure[];
}

/** The money figures a pack can be built from, already formatted by the caller. */
export interface PackSource {
  strategy: 'btl' | 'flip' | 'brrrr' | 'hmo';
  /** Formatted, e.g. "£150,000". */
  price: string;
  stampDuty: string;
  /** Whether the tax is the Welsh one, so the label is right. */
  inWales: boolean;
  legals: string;
  refurb: string;
  additional: string | null;
  totalIn: string;
  monthlyRent: string | null;
  /** Return on cash (BTL/HMO) or on capital employed (flip/BRRRR). */
  returnPct: string | null;
  returnIsRoce: boolean;
  grossYield: string | null;
  /** Flip/BRRRR only. */
  endValue: string | null;
}

/**
 * The bases. Held here rather than in the copy config because each one is tied
 * to the figure it explains — separating them is how they drift apart, and a
 * basis that has drifted from its figure is worse than none.
 */
const BASIS = {
  price: 'The asking price you entered.',
  stampDuty: 'Calculated from the purchase price using the current bands.',
  legals: 'Your figure for legal and buying costs.',
  refurb: 'Your refurb figure, from the scope ticked in the analyser.',
  additional: 'Your figure for additional costs.',
  totalIn: 'Purchase price, tax, refurb and costs added together.',
  rent: 'Your monthly rent figure.',
  roi: 'Annual return divided by the cash going in, from the figures in this pack. Before tax.',
  roce: 'Profit divided by the capital employed, from the figures in this pack. Before tax.',
  yield: 'Annual rent divided by the purchase price.',
  endValue: 'Your end value figure. An estimate, not a valuation.',
} as const;

/**
 * Build the pack's numbers from a deal.
 *
 * Anything absent is simply absent — a pack with no rent figure shows no yield,
 * rather than a dash or a zero that reads as a real number.
 */
export function packNumbers(s: PackSource): PackNumbers {
  const costs: EvidencedFigure[] = [
    figure('Purchase price', s.price, BASIS.price),
    figure(s.inWales ? 'Land Transaction Tax' : 'Stamp duty', s.stampDuty, BASIS.stampDuty),
    figure('Refurb cost', s.refurb, BASIS.refurb, true),
    figure('Legal and buying costs', s.legals, BASIS.legals),
  ];
  if (s.additional !== null) costs.push(figure('Additional costs', s.additional, BASIS.additional));
  costs.push(figure('Total going in', s.totalIn, BASIS.totalIn, true));

  const returns: EvidencedFigure[] = [];
  if (s.returnPct !== null) {
    returns.push(figure(
      s.returnIsRoce ? 'Return on capital employed' : 'Return on cash',
      s.returnPct,
      s.returnIsRoce ? BASIS.roce : BASIS.roi,
      true,
    ));
  }
  if (s.grossYield !== null) returns.push(figure('Rental yield', s.grossYield, BASIS.yield, true));
  if (s.monthlyRent !== null) returns.push(figure('Monthly rent', s.monthlyRent, BASIS.rent, true));

  /** The lead numbers differ by strategy: a flip leads on the end value, a
   *  let leads on what it returns. */
  const headline: EvidencedFigure[] = [];
  if ((s.strategy === 'flip' || s.strategy === 'brrrr') && s.endValue !== null) {
    headline.push(figure('Estimated end value', s.endValue, BASIS.endValue, true));
  }
  if (returns[0]) headline.push(returns[0]);
  if (headline.length === 0 && costs[0]) headline.push(costs[0]);

  return { headline, costs, returns };
}

/**
 * Everything a pack may print about the numbers, flattened — so one test can
 * walk every figure in a pack and assert each has a basis.
 */
export function everyFigure(n: PackNumbers): EvidencedFigure[] {
  return [...n.headline, ...n.costs, ...n.returns];
}
