/**
 * DP1 — HOW LONG THE REFURB TAKES, as a range and never as a number.
 *
 * WHY THIS EXISTS AND WHY IT IS A RANGE. The deal pack has to say how long the
 * work takes, and a single figure there would be the most dangerous number in
 * the document: it is the one an investor plans their money around. Every
 * output here is a band, carries the word estimate, and carries the basis it
 * was drawn from.
 *
 * THE WHOLE RUNWAY, NOT THE TIME ON TOOLS. This is the gap beginners' numbers
 * fall into. A kitchen is "two weeks" and the deal is modelled as two weeks —
 * ignoring that nobody starts tomorrow, that snagging is real, and that rent or
 * a sale does not begin the day the last tradesman leaves. So a duration here
 * is four parts and says so:
 *
 *    lead-in  →  on tools  →  snagging  →  void before rent or sale
 *
 * WHERE THE NUMBERS COME FROM, stated plainly because it matters. The operator's
 * guidance is qualitative: light cosmetic work is weeks, a full standard refurb
 * is months, structural work is longer. The WEEK COUNTS that turn that into a
 * band are a banding of those words, held in config so they are one edit — they
 * are not a sourced dataset, and the product never pretends otherwise. That is
 * exactly why every output is a range, labelled an estimate, with its basis
 * shown, and why the user can replace the whole thing with their builder's own
 * figure. See docs/DECISIONS_LOG.md (DP1).
 *
 * THIS FILE COMPUTES. The numbers live in config; the banding rule and the
 * arithmetic live here, so a component never does either.
 */
import type { Breakdown, WithBreakdown } from '../maths/breakdown';

/** How heavy the job is, from what was actually ticked. */
export type RefurbBand = 'none' | 'cosmetic' | 'standard' | 'structural';

/** A span in whole weeks. Always a range — `from` may equal `to`, never null. */
export interface WeekRange {
  from: number;
  to: number;
}

/** The four parts of the runway, each its own range. */
export interface DurationParts {
  leadIn: WeekRange;
  onTools: WeekRange;
  snagging: WeekRange;
  voidPeriod: WeekRange;
}

/**
 * The config this engine reads. Every number the product shows for duration
 * comes from here, so changing the banding is one edit in one file.
 */
export interface DurationConfig {
  /** Time on tools for each band, in weeks. */
  onTools: Record<Exclude<RefurbBand, 'none'>, WeekRange>;
  /** The three parts that are not time on tools. */
  leadIn: WeekRange;
  snagging: WeekRange;
  /** Before rent or a sale begins. */
  voidPeriod: WeekRange;
  /**
   * Which ticked items push the job into which band. An item in `structural`
   * wins over one in `standard`, which wins over cosmetic — the heaviest thing
   * ticked sets the band, because a roof does not get quicker for being beside
   * a decoration.
   */
  structuralItems: readonly string[];
  standardItems: readonly string[];
}

const add = (a: WeekRange, b: WeekRange): WeekRange => ({ from: a.from + b.from, to: a.to + b.to });

/** "6 to 10 weeks", or "6 weeks" when a band has collapsed to a point. */
export function sayWeeks(r: WeekRange): string {
  if (r.from === r.to) return `${r.from} week${r.from === 1 ? '' : 's'}`;
  return `${r.from} to ${r.to} weeks`;
}

/** The same span in months, for anything past a couple of months. */
export function sayMonths(r: WeekRange): string {
  const lo = Math.round((r.from / 4.345) * 10) / 10;
  const hi = Math.round((r.to / 4.345) * 10) / 10;
  if (lo === hi) return `${lo} month${lo === 1 ? '' : 's'}`;
  return `${lo} to ${hi} months`;
}

/**
 * THE HEAVIEST THING TICKED SETS THE BAND.
 *
 * Not a count and not a sum: one roof makes a job structural whatever else is
 * on the list, and ten cosmetic items do not add up to a rewire.
 */
export function bandFor(ticked: readonly string[], config: DurationConfig): RefurbBand {
  if (ticked.length === 0) return 'none';
  if (ticked.some((k) => config.structuralItems.includes(k))) return 'structural';
  if (ticked.some((k) => config.standardItems.includes(k))) return 'standard';
  return 'cosmetic';
}

/** The four parts for a band, straight from config. */
export function partsFor(band: RefurbBand, config: DurationConfig): DurationParts | null {
  if (band === 'none') return null;
  return {
    leadIn: config.leadIn,
    onTools: config.onTools[band],
    snagging: config.snagging,
    voidPeriod: config.voidPeriod,
  };
}

/** The whole runway: the four parts summed. */
export function totalOf(parts: DurationParts): WeekRange {
  return add(add(parts.leadIn, parts.onTools), add(parts.snagging, parts.voidPeriod));
}

export interface RefurbDuration {
  band: RefurbBand;
  parts: DurationParts;
  /** Lead-in + on tools + snagging + void. */
  total: WeekRange;
  /** True when the user replaced the estimate with their own figure. */
  fromBuilder: boolean;
  /** The maths, shown — never a bare number. */
  breakdown: Breakdown;
}

/**
 * The suggested duration for a ticked scope, or null when nothing is ticked.
 *
 * `ownWeeks` is the user's own builder's figure. When they give one it REPLACES
 * the time on tools — not the whole runway — because a builder quotes their own
 * work, not your lead-in or your void. That distinction is the entire point of
 * this module and the pack says it out loud.
 */
export function refurbDuration(
  ticked: readonly string[],
  config: DurationConfig,
  ownWeeks?: WeekRange | null,
): RefurbDuration | null {
  const band = bandFor(ticked, config);
  const suggested = partsFor(band, config);
  if (suggested === null) return null;

  const fromBuilder = ownWeeks != null && ownWeeks.from > 0 && ownWeeks.to >= ownWeeks.from;
  const parts: DurationParts = fromBuilder
    ? { ...suggested, onTools: ownWeeks as WeekRange }
    : suggested;
  const total = totalOf(parts);

  const breakdown: Breakdown = {
    label: 'How long the work takes',
    formula: 'lead-in + on tools + snagging + void before rent or sale',
    substituted: `${sayWeeks(parts.leadIn)} + ${sayWeeks(parts.onTools)} `
      + `+ ${sayWeeks(parts.snagging)} + ${sayWeeks(parts.voidPeriod)}`,
    result: sayWeeks(total),
    note: fromBuilder
      ? 'On-tools time is your builder’s figure. The rest is estimated.'
      : 'An estimate from the scope ticked, not a quote.',
  };

  return { band, parts, total, fromBuilder, breakdown };
}

/**
 * The duration as the pack prints it: a value with its own breakdown, so it
 * cannot appear without its basis. Presentation formats this; it never sums it.
 */
export function durationForPack(d: RefurbDuration): WithBreakdown<WeekRange> {
  return { value: d.total, breakdown: d.breakdown };
}
