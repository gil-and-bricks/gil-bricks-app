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
 *
 * NOT ONE WORD OF IT IS WRITTEN HERE. The labels and the basis lines are
 * user-facing copy and live in web config like every other string the product
 * says (charter rule 2); this file holds the SHAPE — which figures a pack may
 * carry, in what order, and that each arrives with its basis attached.
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
  /**
   * The same money figures as raw numbers, for chart geometry. The formatted
   * strings above are what gets printed; these are what gets measured. A chart
   * never parses a formatted string back into a number.
   */
  amounts: {
    price: number;
    stampDuty: number;
    refurb: number;
    legals: number;
    additional: number | null;
    totalIn: number;
  };
}

/**
 * The words. Supplied by the caller from config, never written here.
 *
 * A LABEL AND ITS BASIS TRAVEL TOGETHER. They are one object with one key per
 * figure, because a basis that has drifted away from the figure it explains is
 * worse than no basis at all — this shape makes the pair impossible to edit
 * apart.
 */
export interface FigureCopy {
  label: string;
  basis: string;
}

export interface PackFigureCopy {
  price: FigureCopy;
  stampDuty: FigureCopy;
  /** Wales pays Land Transaction Tax, and the label has to say which. */
  stampDutyWales: FigureCopy;
  refurb: FigureCopy;
  legals: FigureCopy;
  additional: FigureCopy;
  totalIn: FigureCopy;
  roi: FigureCopy;
  roce: FigureCopy;
  grossYield: FigureCopy;
  monthlyRent: FigureCopy;
  endValue: FigureCopy;
}

/**
 * A yearly figure as the monthly one a pack prints.
 *
 * Here rather than at the call site because it is arithmetic on a domain value,
 * and those live in this package (charter rule 3). An HMO's income arrives from
 * its analysis as a year's gross room income; the pack's line says "Monthly
 * rent", so it is the analysis's own figure divided by twelve — never rooms
 * multiplied by a room rent again, which would be a second place the same
 * number is worked out.
 */
export function perMonth(perYear: number): number {
  return perYear / 12;
}

/** One figure from one copy entry, so no call site can pair them wrongly. */
const of = (c: FigureCopy, value: string, projected = false, amount?: number): EvidencedFigure => {
  const f = figure(c.label, value, c.basis, projected);
  return amount === undefined ? f : { ...f, amount };
};

/**
 * Build the pack's numbers from a deal.
 *
 * Anything absent is simply absent — a pack with no rent figure shows no yield,
 * rather than a dash or a zero that reads as a real number.
 */
export function packNumbers(s: PackSource, copy: PackFigureCopy): PackNumbers {
  const costs: EvidencedFigure[] = [
    of(copy.price, s.price, false, s.amounts.price),
    of(s.inWales ? copy.stampDutyWales : copy.stampDuty, s.stampDuty, false, s.amounts.stampDuty),
    of(copy.refurb, s.refurb, true, s.amounts.refurb),
    of(copy.legals, s.legals, false, s.amounts.legals),
  ];
  if (s.additional !== null) costs.push(of(copy.additional, s.additional, false, s.amounts.additional ?? undefined));
  costs.push(of(copy.totalIn, s.totalIn, true, s.amounts.totalIn));

  const returns: EvidencedFigure[] = [];
  if (s.returnPct !== null) {
    returns.push(of(s.returnIsRoce ? copy.roce : copy.roi, s.returnPct, true));
  }
  if (s.grossYield !== null) returns.push(of(copy.grossYield, s.grossYield, true));
  if (s.monthlyRent !== null) returns.push(of(copy.monthlyRent, s.monthlyRent, true));

  /** The lead numbers differ by strategy: a flip leads on the end value, a
   *  let leads on what it returns. */
  const headline: EvidencedFigure[] = [];
  if ((s.strategy === 'flip' || s.strategy === 'brrrr') && s.endValue !== null) {
    headline.push(of(copy.endValue, s.endValue, true));
  }
  if (returns[0]) headline.push(returns[0]);
  if (headline.length === 0 && costs[0]) headline.push(costs[0]);

  return { headline, costs, returns };
}

/**
 * DP2 — DO THESE FIGURES ACTUALLY ADD UP TO THAT TOTAL?
 *
 * THIS EXISTS BECAUSE THE FIRST CHART LIED. The cost page drew a waterfall —
 * price, then tax, then refurb, then legals, stacking to a total — and on a
 * financed deal the parts do not sum to the total at all. A BRRRR's cash going
 * in was £78,890 against a £120,000 purchase price, because most of the
 * purchase is borrowed. The bars stacked anyway and the page told the reader
 * that £120,000 + £6,000 + £35,000 + £1,500 came to £78,890.
 *
 * A chart that implies an arithmetic relationship which does not hold is worse
 * than the table it replaced. So the shape is chosen from the figures rather
 * than assumed: when the parts genuinely sum, a stack is the right picture and
 * says something true; when they do not, the same bars are drawn from a shared
 * baseline, which claims nothing about addition.
 *
 * A pound of tolerance, because every figure has already been rounded for
 * display and a rounding difference is not a financing difference.
 */
export function partsSumToTotal(n: PackNumbers): boolean {
  const amounts = n.costs.map((f) => f.amount).filter((a): a is number => typeof a === 'number');
  if (amounts.length < 3) return false;
  const total = amounts[amounts.length - 1];
  const parts = amounts.slice(0, -1).reduce((sum, a) => sum + a, 0);
  return Math.abs(parts - total) <= 1;
}

/**
 * Everything a pack may print about the numbers, flattened — so one test can
 * walk every figure in a pack and assert each has a basis.
 */
export function everyFigure(n: PackNumbers): EvidencedFigure[] {
  return [...n.headline, ...n.costs, ...n.returns];
}
