/**
 * DP1 — ONE REAL DEAL, shared by every pack test.
 *
 * WHY IT LIVES IN src/fixtures AND NOT BESIDE THE TESTS. It is test data, not
 * product code: "Rebecca Hall" and "Hillside Property Partners" are a fictional
 * investor and a fictional business, and they must never end up in the config
 * the product ships its words from. The inline-copy ratchet governs
 * components/ and lib/ — the product tree — and this is deliberately outside
 * it. `reversibility.test.ts` check G fails if any product file imports from
 * here, so the boundary is enforced rather than promised.
 *
 * A REAL ONE, DELIBERATELY. These parameters are the shape a saved BRRRR deal
 * actually has, and every figure in the tests below is computed from them by
 * the same engines the analyser uses. A hand-written model would let the tests
 * pass while the wiring that produces a real pack was broken.
 */
import { refurbDuration, sayWeeks } from '@gil-bricks/core';
import { REFURB_ITEMS } from '../config/refurb';
import { DURATION_COPY, REFURB_DURATION } from '../config/refurbDuration';
import { packNumbersFor, tickedKeys, tickedScope } from '../lib/pack/fromDeal';
import { partsSumToTotal } from '@gil-bricks/core';
import { compsFrom, heroAndStrip, waterfallFrom } from '../lib/pack/packData';
import type { PackModel } from '../components/pack/PackDocument';

/** A Welsh BRRRR: a repossession bought back, refurbished and refinanced. */
export const BRRRR_PARAMS = 'postcode=CF37+1HR&price=120000&refurbCost=35000&arv=200000&rent=1100&ltv=75'
  + '&legals=2500&refiLegals=1200&funding=bridging&bridgeMonths=9'
  + '&rfList=1&rfKitchen=8000&rfBathroom=4500&rfRewire=5500&rfPlastering=6000'
  + '&rfDecoration=3500&rfFlooring=3500&rfOther=4000';

export const DEAL_TITLE = 'Terraced house · CF37 1HR · £120,000';

/** Every section on. Tests that need one off take it out themselves. */
export const ALL_ON = [
  'cover', 'photos', 'returns', 'summary', 'purchase', 'plan', 'scope', 'duration',
  'floorplan', 'area', 'comps', 'gallery', 'basis', 'compliance', 'disclaimer',
];

/** The default reading order of the pages the user may move. */
export const ORDER = ['returns', 'purchase', 'plan', 'area', 'comps', 'gallery'];

export function packModel(over: Partial<PackModel> = {}): PackModel {
  const numbers = packNumbersFor('brrrr', BRRRR_PARAMS);
  if (numbers === null) throw new Error('the fixture deal must produce figures');
  const runway = refurbDuration(tickedKeys(BRRRR_PARAMS, REFURB_ITEMS), REFURB_DURATION, null);
  if (runway === null) throw new Error('the fixture deal must produce a duration');
  const { hero, strip } = heroAndStrip(numbers);
  const weeks = (r: { from: number; to: number }) => ({ from: r.from, to: r.to, display: sayWeeks(r) });
  return {
    address: DEAL_TITLE,
    strategy: 'brrrr',
    investorName: 'Rebecca Hall',
    summary: 'Bought below the local typical price and refinanced after the work.',
    preparedOn: '14 September 2026',
    branding: {
      businessName: 'Hillside Property Partners',
      accentColour: '#8a1f4b',
      onAccent: '#ffffff',
      logoDataUri: '',
      duotone: false,
    },
    compliance: {
      businessName: 'Hillside Property Partners',
      redressScheme: 'The Property Ombudsman',
      redressNumber: 'T12345',
      hmrcAml: 'XZML00000123',
      ico: 'ZB123456',
      piInsurer: 'Hiscox',
      piExpiry: '30 June 2027',
    },
    hero,
    strip,
    costs: numbers.costs,
    returns: numbers.returns,
    waterfall: waterfallFrom(numbers),
    waterfallStacks: partsSumToTotal(numbers),
    scope: tickedScope(BRRRR_PARAMS, REFURB_ITEMS),
    runway: {
      phases: [
        { name: DURATION_COPY.parts.leadIn, ...weeks(runway.parts.leadIn) },
        { name: DURATION_COPY.parts.onTools, ...weeks(runway.parts.onTools) },
        { name: DURATION_COPY.parts.snagging, ...weeks(runway.parts.snagging) },
        { name: DURATION_COPY.parts.voidPeriod, ...weeks(runway.parts.voidPeriod) },
      ],
      total: sayWeeks(runway.total),
      basis: runway.breakdown.note ?? '',
    },
    photos: [],
    floorPlan: null,
    area: [
      { label: 'Typical sold price in this postcode sector', value: '£132,000', sourceName: 'HM Land Registry Price Paid Data', sourceAsOf: 'June 2026' },
    ],
    growth: null,
    comps: compsFrom(null, 120000),
    mapImage: null,
    order: ORDER,
    on: ALL_ON,
    ...over,
  };
}
