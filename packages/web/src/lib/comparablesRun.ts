/**
 * C1 — HOW EACH SURFACE ASKS FOR ITS COMPARABLES, AND NOTHING ELSE.
 *
 * ── WHY THESE ARE FUNCTIONS AND NOT LINES INSIDE COMPONENTS ─────────────────
 * The rules themselves live in `@gil-bricks/core`'s `comparables/rules.ts`, and
 * always did. What did NOT live anywhere was the work of ASKING — which filters
 * a surface passes, whether it widens, what it does with a person's own
 * choices — and that is precisely where the surfaces had drifted apart. The
 * analyser widened; the deal pack took the eight highest-priced sales in the
 * whole postcode sector and called them comparables.
 *
 * Buried in a component, that work cannot be driven by a test without mounting
 * the component, its data fetches and its auth. So each surface's ASK is a
 * named function here, and `comparablesAgree.test.ts` runs both of them over
 * one dataset and compares the SETS THEY PRODUCE — not the arguments they were
 * built from, which is the check that has passed while two paths disagreed.
 */
import { COMPARABLE_RULES, findComparables, runComparables, type Comp, type RunOutcome } from '@gil-bricks/core';

const MIN = COMPARABLE_RULES.minComparables;
import type { UrlState } from '../components/analyser/state';
import { laddered, resolvedFilters } from './comparables';

/**
 * THE ANALYSER'S ASK.
 *
 * A person's own filters always win. Where they have left the radius and the
 * window alone, this runs the product's own definition — the subject's type,
 * twelve months, half a mile — and climbs the one widening ladder if that is
 * too thin. The rung it stopped at travels back with the result so the section
 * can say what happened; nothing widens silently.
 */
export async function analyserComparables(s: UrlState): Promise<RunOutcome> {
  const shared = {
    postcode: s.postcode,
    tenure: s.tenure,
    age: s.cage,
    minAreaSqm: s.minArea === '' ? undefined : Number(s.minArea),
    maxAreaSqm: s.maxArea === '' ? undefined : Number(s.maxArea),
    minPrice: s.minPrice === '' ? undefined : Number(s.minPrice),
    maxPrice: s.maxPrice === '' ? undefined : Number(s.maxPrice),
    excludedIds: s.excluded === '' ? [] : s.excluded.split(','),
  };
  const filters = resolvedFilters(s);
  if (laddered(s)) {
    return runComparables({ ...shared, subjectType: s.type, propertyType: filters.propertyType }, findComparables);
  }
  const result = await findComparables({ ...shared, ...filters });
  // Filters somebody set themselves are not overruled, so nothing widens — but
  // a thin set is still REPORTED as thin. What does not apply is the ladder,
  // not the count: the valuation refuses on four sales either way.
  return {
    result,
    stage: 'default',
    widened: false,
    tooFew: result.comps.filter((c) => c.included).length < MIN,
  };
}

/**
 * THE DEAL PACK'S ASK.
 *
 * The same one engine on the same one definition, from a saved deal's own
 * parameters. It used to be `salesByPrice(sector, 8)` — the dearest houses in
 * the sector, no type, no window, no radius — in a document somebody sends to
 * an investor. Failure is null, which the page renders as no comparables list
 * rather than as a list built on a different rule.
 */
export async function packComparables(params: URLSearchParams): Promise<Comp[] | null> {
  const postcode = (params.get('postcode') ?? '').trim();
  if (postcode === '') return null;
  try {
    const run = await runComparables({
      postcode,
      subjectType: params.get('type'),
      tenure: 'any',
      age: 'all',
    }, findComparables);
    return run.result.comps;
  } catch {
    return null;
  }
}
