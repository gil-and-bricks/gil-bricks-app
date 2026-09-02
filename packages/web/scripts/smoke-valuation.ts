/** Live smoke: automatic Land Registry sale-history lookup + valuation. */
import { findComparables } from '@gil-bricks/core';
import { fetchSaleHistory, getTransaction } from '@gil-bricks/core';
import { valueProperty } from '@gil-bricks/core';

// CF37 1DL itself has no recorded PPI transactions (probed live) — show that
// honestly, then demonstrate the auto-fill on 6 Vaughan Street, CF37 1HR.
const dl = await fetchSaleHistory({ postcode: 'CF37 1DL', paon: '1' });
console.log(`CF37 1DL history: ${dl.kind === 'ok' ? `${dl.sales.length} sales` : 'ambiguous'} (postcode has no PPI records — honest none)`);

const v = await valueProperty({ postcode: 'CF37 1HR', paon: '6', floorAreaSqm: 90 });
const a = v.lines.find((l) => l.label === 'Indexed last sale');
console.log(
  `6 Vaughan Street CF37 1HR (auto) → source=${v.lastSaleSource} | ${a?.breakdown.note ?? ''} | ` +
    `est £${Math.round(v.estimate).toLocaleString('en-GB')} | range £${v.range.low.toLocaleString('en-GB')}–£${v.range.high.toLocaleString('en-GB')} (${v.range.label}) | confidence ${v.confidence}`,
);
const history = await fetchSaleHistory({ postcode: 'CF37 1HR', paon: '6' });
if (history.kind === 'ok') {
  console.log(`history: ${history.sales.map((s) => `${s.date} £${s.price.toLocaleString('en-GB')} (${s.category})`).join('; ')}`);
}

// One comp's transaction detail page
const comps = await findComparables({ postcode: 'CF37 1HR', radiusMiles: 0.25, periodMonths: 12, propertyType: 'all', tenure: 'any', age: 'all' });
const guid = comps.comps[0].id;
const t = await getTransaction(guid);
console.log(`detail ${guid}: ${t.date} £${t.price.toLocaleString('en-GB')} | ${t.address.saon ? t.address.saon + ' ' : ''}${t.address.paon} ${t.address.street}, ${t.address.town} ${t.address.postcode} | type ${t.propertyType} | ${t.estateType} | newBuild ${t.newBuild} | cat ${t.category}`);
