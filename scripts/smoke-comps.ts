/** Live smoke: runs the ComparablesEngine against the real R2 data. */
import { findComparables } from '../src/lib/comparables';

const cases = [
  { postcode: 'CF37 1DL', radiusMiles: 0.5, periodMonths: 12 },
  { postcode: 'LS27 0AA', radiusMiles: 1, periodMonths: 6 },
] as const;

for (const c of cases) {
  const r = await findComparables({
    postcode: c.postcode,
    radiusMiles: c.radiusMiles,
    periodMonths: c.periodMonths,
    propertyType: 'all',
    tenure: 'any',
    age: 'all',
  });
  console.log(
    `${c.postcode} @ ${c.radiusMiles}mi/${c.periodMonths}mo → ` +
      `${r.stats.count} comps | typical £${r.stats.typicalPrice?.toLocaleString('en-GB') ?? '—'} | ` +
      `typical £/sqm ${r.stats.typicalPpsqm?.toLocaleString('en-GB') ?? '—'} | ` +
      `sqft coverage ${r.stats.sqftCoveragePct ?? '—'}% | ` +
      `sectors searched ${r.sectorsSearched.length} (${r.sectorsSearched.join(', ')}) | as of ${r.asOf}`,
  );
}
