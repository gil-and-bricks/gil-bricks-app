/**
 * C1 — WHAT COUNTS AS A COMPARABLE. ONE DEFINITION, FOR EVERY SURFACE.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * Every valuation, every end value, every BRRRR refinance figure and every flip
 * margin rests on which sold properties the subject is compared against. A wrong
 * end value is the most expensive mistake this product can hand somebody.
 *
 * Before this file there were SEVEN definitions of "a comparable" in the repo,
 * disagreeing on all four axes. The worst of them was silent: exactly one
 * surface filtered by property type, so a flat was valued off detached-house
 * £/sqm by default — and `valuation/typeMismatch.ts` existed to WARN about that
 * after the fact rather than prevent it.
 *
 * ── THE THREE RULES ─────────────────────────────────────────────────────────
 * SAME TYPE as the subject. A terrace and a detached house are not the same
 *   market at any size, and type is the one attribute Land Registry publishes
 *   reliably for every sale.
 *
 * SOLD IN THE LAST 12 MONTHS. Older evidence is a different market, and a year
 *   is long enough to gather a set in most places without reaching into one.
 *
 * WITHIN HALF A MILE. Far enough to find sales, close enough that the subject's
 *   own street, school catchment and station are still the ones in play.
 *
 * ── WHAT WE CANNOT MATCH, AND SAY SO ────────────────────────────────────────
 * Bedrooms, gardens, parking, condition, whether it is a townhouse or a country
 * house — none of that is in free sold data. Type plus a tight window and a
 * tight radius is the honest best that can be done AUTOMATICALLY, and the copy
 * says exactly that rather than implying the list has been vetted. The list
 * still has to be looked at by a person, which is why the valuation waits.
 *
 * ── TUNING ──────────────────────────────────────────────────────────────────
 * Every number here is a knob, and each one's note says what moves when you turn
 * it. Changing them changes every surface at once, which is the point.
 */

import type { ComparablesInput, ComparablesResult } from './engine';

/** The radii the engine will accept. Widening uses the next one up. */
export type RadiusMiles = 0.25 | 0.5 | 1;
/** The windows the engine will accept. Widening uses the next one up. */
export type PeriodMonths = 6 | 12 | 24;

export const COMPARABLE_RULES = {
  /**
   * HOW FAR. Turn it down and the list shrinks toward the subject's own street;
   * turn it up and you reach a different market with a similar postcode.
   * Half a mile is roughly a fifteen-minute walk.
   */
  radiusMiles: 0.5 as RadiusMiles,

  /**
   * HOW RECENT. Turn it down and only the freshest evidence counts, but many
   * areas will not have five sales in six months; turn it up and you are
   * comparing against a market that has since moved.
   */
  periodMonths: 12 as PeriodMonths,

  /**
   * MATCH THE SUBJECT'S TYPE. Off, and a flat is compared against detached
   * houses — which is what the product did before this file existed. Only
   * turn it off if you are deliberately looking at a whole street.
   */
  matchPropertyType: true,

  /**
   * HOW FEW IS TOO FEW. Below this the middle of the set is an accident of
   * which four houses happened to sell, so the product widens once and, failing
   * that, shows no valuation at all. Turn it up for a stricter product that
   * refuses more often; turn it down and you will value off thin evidence.
   */
  minComparables: 5,

  /**
   * THE ONE WIDENING STEP, AND ITS ORDER.
   *
   * TIME FIRST, THEN DISTANCE, and the order is the whole argument. Widening
   * the radius changes WHERE: a different street, a different catchment,
   * sometimes the other side of a main road — and location is the one thing no
   * index can correct for afterwards. Widening time keeps the geography exactly
   * as it is and reaches back for older sales in the same place, which house
   * price indexation can at least partly account for.
   *
   * So a thin set first looks further back on the same streets, and only then
   * looks further out. Each step is stated on screen; neither happens silently.
   */
  widen: {
    periodMonths: 24 as PeriodMonths,
    radiusMiles: 1 as RadiusMiles,
  },
} as const;

/** The stages a comparables run can be at, in the order they are tried. */
export type WidenStage = 'default' | 'wider-time' | 'wider-area' | 'exhausted';

export interface StageFilters {
  radiusMiles: RadiusMiles;
  periodMonths: PeriodMonths;
}

/**
 * The filters for each stage. Exported so every surface widens identically and
 * a test can walk the ladder without rebuilding it.
 */
export function filtersForStage(stage: WidenStage): StageFilters {
  switch (stage) {
    case 'wider-time':
      return { radiusMiles: COMPARABLE_RULES.radiusMiles, periodMonths: COMPARABLE_RULES.widen.periodMonths };
    case 'wider-area':
    case 'exhausted':
      return { radiusMiles: COMPARABLE_RULES.widen.radiusMiles, periodMonths: COMPARABLE_RULES.widen.periodMonths };
    default:
      return { radiusMiles: COMPARABLE_RULES.radiusMiles, periodMonths: COMPARABLE_RULES.periodMonths };
  }
}

/** The next stage to try, or null when there is nowhere left to widen to. */
export function nextStage(stage: WidenStage): WidenStage | null {
  if (stage === 'default') return 'wider-time';
  if (stage === 'wider-time') return 'wider-area';
  return null;
}

/**
 * The subject's own type, as the comparables filter expects it.
 *
 * An UNKNOWN subject type gives 'all' — never a guess. A property whose type we
 * do not know cannot be type-matched, and pretending otherwise would filter the
 * evidence by something invented.
 */
export function typeFilterForSubject(subjectType: string | null | undefined): 'D' | 'S' | 'T' | 'F' | 'all' {
  if (!COMPARABLE_RULES.matchPropertyType) return 'all';
  const t = (subjectType ?? '').trim().toUpperCase();
  return t === 'D' || t === 'S' || t === 'T' || t === 'F' ? t : 'all';
}

/**
 * C1 — THE COMPARABLES RUN, INCLUDING ITS ONE WIDENING STEP.
 *
 * Every surface that draws a comparison calls this, so the ladder is climbed
 * the same way everywhere and the stage it stopped at travels with the result.
 * Nothing widens silently: the caller is told which stage produced the set, and
 * every surface prints it.
 *
 * It widens at most twice — time, then distance — and then stops. A set that is
 * still too thin after both is reported as too thin, because "we looked as far
 * as is honest and there is not enough" is a useful answer and a valuation built
 * on four sales is not.
 */
export interface RunInput extends Omit<ComparablesInput, 'radiusMiles' | 'periodMonths' | 'propertyType'> {
  /** The subject's own type letter. Unknown gives an unfiltered run, honestly. */
  subjectType?: string | null;
  /** Override the type filter — only where a person has chosen one themselves. */
  propertyType?: ComparablesInput['propertyType'];
}

export interface RunOutcome {
  result: ComparablesResult;
  /** Which rung produced this set. Always shown; never inferred by the caller. */
  stage: WidenStage;
  /** True once anything was widened at all — the one-line "we widened" test. */
  widened: boolean;
  /** Still short of `minComparables` even after widening as far as is honest. */
  tooFew: boolean;
}

/**
 * Run the comparables, widening in one deliberate step where the default set is
 * too thin. `find` is injected so this stays pure and testable; every caller
 * passes `findComparables`.
 */
export async function runComparables(
  input: RunInput,
  find: (i: ComparablesInput) => Promise<ComparablesResult>,
): Promise<RunOutcome> {
  const propertyType = input.propertyType ?? typeFilterForSubject(input.subjectType);
  let stage: WidenStage = 'default';
  let result = await find({ ...input, ...filtersForStage(stage), propertyType });

  // `included` is what a person is left with after their own exclusions, and it
  // is what every figure is computed from — so it is what "too few" counts.
  const enough = (r: ComparablesResult): boolean =>
    r.comps.filter((c) => c.included).length >= COMPARABLE_RULES.minComparables;

  while (!enough(result)) {
    const next = nextStage(stage);
    if (next === null) break;
    stage = next;
    result = await find({ ...input, ...filtersForStage(stage), propertyType });
  }

  return {
    result,
    stage,
    widened: stage !== 'default',
    tooFew: !enough(result),
  };
}
