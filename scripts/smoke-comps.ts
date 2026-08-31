/** Live smoke: runs the Comparables + Valuation engines against real R2 data. */
import { findComparables } from '../src/lib/comparables';
import { valueProperty } from '../src/lib/valuation';

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

// Valuation smoke: a Pontypridd terrace bought for £120,000 in March 2019, 90 sqm.
const v = await valueProperty({ postcode: 'CF37 1DL', lastSalePrice: 120000, lastSaleDate: '2019-03', floorAreaSqm: 90 });
console.log(
  `valuation CF37 1DL (last sale £120k 2019-03, 90sqm) → est £${Math.round(v.estimate).toLocaleString('en-GB')} ` +
    `| range £${v.range.low.toLocaleString('en-GB')}–£${v.range.high.toLocaleString('en-GB')} (${v.range.label}) ` +
    `| confidence ${v.confidence}: ${v.confidenceReason} | lines: ${v.lines.map((l) => `${l.label} £${Math.round(l.estimate).toLocaleString('en-GB')}`).join('; ')} | as of ${v.asOf}`,
);
