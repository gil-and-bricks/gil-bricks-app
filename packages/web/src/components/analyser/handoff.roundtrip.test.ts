// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildAnalyserHandoff, found, missing, strategyById, type NormalisedListing } from '@gil-bricks/core';
import { parseQuery, initStrategyParams, strategyParams, type StrategyFieldSpec } from './state';

/**
 * Round-trip contract (E6): every param the extension writes for "Send to my
 * analyser" is read back by the web app's OWN parser (parseQuery +
 * initStrategyParams). Uses the real config fields, so a drift on either side
 * fails here.
 */
function btlFields(): StrategyFieldSpec[] {
  const cfg = strategyById('btl')!;
  return [...cfg.strategyInputs, ...cfg.assumptions].map((f) => ({
    key: f.key,
    kind: f.kind === 'select' ? 'select' : 'number',
    default: f.default,
    options: f.options,
  }));
}

const listing: NormalisedListing = {
  portal: 'rightmove',
  extractorVersion: 'rm-1.0.0',
  configVersion: 'test',
  source: 'embedded',
  listingId: found('123'),
  url: found('https://www.rightmove.co.uk/properties/123'),
  postcode: found('SA1 8AJ'),
  outcode: found('SA1'),
  address: found({ paon: '31', saon: 'Flat 2', street: 'Kings Road', town: 'Swansea' }),
  askingPrice: found(170000),
  propertyType: found('Semi-Detached'),
  tenure: found('FREEHOLD'),
  bedrooms: found(3),
  bathrooms: found(2),
  floorAreaSqm: missing(),
  floorAreaSqmRange: missing(),
  floorPlanImageUrls: missing(),
  newBuild: found(false),
  listingUpdate: missing(),
  firstVisibleDate: missing(),
  description: found('x'),
  isAuction: missing(),
};

describe('analyser handoff round-trips through the web parser', () => {
  it('reads back every param the extension writes', () => {
    const { route, params } = buildAnalyserHandoff(listing, {
      strategy: 'btl',
      floorAreaSqm: 68,
      fields: { rent: '1100', deposit: '30', rate: '4.5', buyingAs: 'higher', mgmt: 'self', taxBasis: 'standard' },
    });
    expect(route).toBe('/buy-to-let/analyser');

    // put the params on the URL exactly as the extension would open the tab
    const qs = new URLSearchParams(params).toString();
    window.history.replaceState({}, '', `${route}?${qs}`);

    const subject = parseQuery(location.search) as unknown as Record<string, string>;
    initStrategyParams(btlFields());
    const strat = strategyParams.value;

    const SUBJECT_KEYS = new Set(['postcode', 'price', 'type', 'area', 'beds', 'baths', 'paon', 'saon']);
    // every subject field this listing supplies MUST actually be written (so a
    // dropped write fails here rather than being silently skipped by the loop)
    for (const k of ['postcode', 'price', 'type', 'area', 'beds', 'baths', 'paon', 'saon']) {
      expect(params, `handoff must write "${k}"`).toHaveProperty(k);
    }
    // EVERY written param is read back with the same value, by the real parser
    for (const [k, v] of Object.entries(params)) {
      const readBack = SUBJECT_KEYS.has(k) ? subject[k] : strat[k];
      expect(readBack, `param "${k}" round-trip`).toBe(v);
    }

    // spot-check the important mappings
    expect(subject.postcode).toBe('SA1 8AJ');
    expect(subject.price).toBe('170000');
    expect(subject.type).toBe('S'); // Semi-Detached → S (not D)
    expect(subject.area).toBe('68');
    expect(subject.beds).toBe('3');
    expect(subject.baths).toBe('2');
    expect(subject.paon).toBe('31');
    expect(subject.saon).toBe('Flat 2');
    expect(strat.rent).toBe('1100');
    expect(strat.deposit).toBe('30');
    expect(strat.buyingAs).toBe('higher');
    expect(strat.mgmt).toBe('self');
  });
});
