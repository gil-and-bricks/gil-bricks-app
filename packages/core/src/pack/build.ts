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
const of = (c: FigureCopy, value: string, projected = false): EvidencedFigure =>
  figure(c.label, value, c.basis, projected);

/**
 * Build the pack's numbers from a deal.
 *
 * Anything absent is simply absent — a pack with no rent figure shows no yield,
 * rather than a dash or a zero that reads as a real number.
 */
export function packNumbers(s: PackSource, copy: PackFigureCopy): PackNumbers {
  const costs: EvidencedFigure[] = [
    of(copy.price, s.price),
    of(s.inWales ? copy.stampDutyWales : copy.stampDuty, s.stampDuty),
    of(copy.refurb, s.refurb, true),
    of(copy.legals, s.legals),
  ];
  if (s.additional !== null) costs.push(of(copy.additional, s.additional));
  costs.push(of(copy.totalIn, s.totalIn, true));

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
 * Everything a pack may print about the numbers, flattened — so one test can
 * walk every figure in a pack and assert each has a basis.
 */
export function everyFigure(n: PackNumbers): EvidencedFigure[] {
  return [...n.headline, ...n.costs, ...n.returns];
}
