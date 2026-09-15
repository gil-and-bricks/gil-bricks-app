// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  buildAnalyserHandoff, customKeysFor, found, missing, unavailable, strategyById, thresholdsFor,
  SUBJECT_TENURE_PARAM, FINDINGS_PARAM, findingsFromCodes, type NormalisedListing,
} from '@gil-bricks/core';
import { parseQuery, initStrategyParams, strategyParams, toQuery, state, type StrategyFieldSpec } from './state';

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
  floorPlanImageUrls: missing(), photoUrls: missing(),
  newBuild: found(false),
  listingUpdate: missing(),
  firstVisibleDate: missing(),
  description: found('x'),
  isAuction: missing(),
  epcUrls: unavailable(), councilTaxBand: unavailable(), leaseYearsRemaining: unavailable(),
  annualGroundRent: unavailable(), annualServiceCharge: unavailable(),
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
    /**
     * Metadata the web reads once at load and never parses into field state
     * (E11): the arrival marker, the floor-area provenance and — since X1.1 —
     * the subject's own tenure.
     *
     * EXEMPTING A KEY FROM A DERIVED LOOP IS HOW A TEST GOES QUIET. Every one of
     * these therefore has its own named assertion below; the set only says "this
     * is not a form field", never "stop checking this".
     */
    const META_KEYS = new Set(['src', 'areaSrc', SUBJECT_TENURE_PARAM, FINDINGS_PARAM]);
    // every subject field this listing supplies MUST actually be written (so a
    // dropped write fails here rather than being silently skipped by the loop)
    for (const k of ['postcode', 'price', 'type', 'area', 'beds', 'baths', 'paon', 'saon']) {
      expect(params, `handoff must write "${k}"`).toHaveProperty(k);
    }
    // EVERY written FIELD param is read back with the same value, by the real parser
    for (const [k, v] of Object.entries(params)) {
      if (META_KEYS.has(k)) continue;
      const readBack = SUBJECT_KEYS.has(k) ? subject[k] : strat[k];
      expect(readBack, `param "${k}" round-trip`).toBe(v);
    }
    // metadata is present and correct, but is NOT parsed into state (stays off the URL after first edit)
    expect(params.src).toBe('ext');
    // the listing has no floor area of its own (floorAreaSqm missing) but 68 was
    // resolved elsewhere, so it is honestly 'carried', never claimed off the listing
    expect(params.areaSrc).toBe('carried');

    /**
     * X1.1 — THE SUBJECT'S TENURE IS WRITTEN, IS NOT PARSED INTO THE FORM, AND
     * IS NOT THE COMPARABLES FILTER.
     *
     * All three matter. It must travel (a leasehold flat arriving as a freehold
     * house is the lease nobody asked about); it must not become form state
     * (nothing on the page edits it); and it must never land in `tenure`, which
     * the analyser owns as its comps filter — that key's allowed values are
     * any/F/L, so the subject's tenure would be clamped away AND would silently
     * narrow the evidence the engine draws on.
     */
    /**
     * X2 — THE FINDINGS TRAVEL AS CODES, and like the tenure they are a fact
     * about the deal rather than a field on this form. They are shown on the
     * deal's own page, which is why they must survive the trip.
     */
    expect(params[FINDINGS_PARAM], 'this listing has no floor area and no plan').toBeTruthy();
    expect(findingsFromCodes(params[FINDINGS_PARAM]).length).toBeGreaterThan(0);
    expect(params[FINDINGS_PARAM].length, 'codes, never sentences').toBeLessThan(60);
    expect(
      new URLSearchParams(toQuery(state.value, strategyParams.value).replace(/^\?/, '')).get(FINDINGS_PARAM),
      'carried, not discarded',
    ).toBe(params[FINDINGS_PARAM]);

    expect(params[SUBJECT_TENURE_PARAM], 'this listing is freehold').toBe('F');
    expect(params.tenure, 'the comps filter is not ours to set').toBeUndefined();
    expect(subject.tenure, 'and it stays at its own default').toBe('any');
    // Carried through the writer untouched, which is what "not a form field" has
    // to mean in practice — present in the address after the page writes it.
    expect(
      new URLSearchParams(toQuery(state.value, strategyParams.value).replace(/^\?/, '')).get(SUBJECT_TENURE_PARAM),
      'carried, not discarded',
    ).toBe('F');

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

/**
 * D4 — the person's own minimums and their own measurements must survive the
 * click. Both used to die at it: the analyser silently reverted to the
 * strategy's defaults and threw away the only real evidence about room sizes.
 */
describe('criteria and measurements survive the handoff (D4)', () => {
  const paramsOf = (h: Parameters<typeof buildAnalyserHandoff>[1]) =>
    new URLSearchParams(buildAnalyserHandoff(listing, h).params);

  it('writes every minimum the person actually set, and none they did not', () => {
    const p = paramsOf({ strategy: 'btl', criteria: { minCashflow: 400, minIcr: 1.5 } });
    expect(p.get('minCashflow')).toBe('400');
    expect(p.get('minIcr')).toBe('1.5');
    expect(p.get('minRoi'), 'never set, so never claimed').toBeNull();
    expect(p.get('minProfit')).toBeNull();
  });

  it('the analyser reads them back as the bar it judges by', () => {
    const p = paramsOf({ strategy: 'btl', criteria: { minCashflow: 400 } });
    const t = thresholdsFor('btl', { minCashflow: Number(p.get('minCashflow')) });
    expect(t.minCashflowGreen).toBe(400);
    expect(customKeysFor({ minCashflow: 400 }, 'btl').has('cashflow')).toBe(true);
  });

  it('carries a measured ZERO — every room passed is a real answer, not an absence', () => {
    const p = paramsOf({ strategy: 'hmo', measured: { roomSizeFailures: 0, roomsMeasured: 4 } });
    expect(p.get('roomFails')).toBe('0');
    expect(p.get('roomsMeasured')).toBe('4');
  });

  it('carries failures, and stays silent when nothing was measured', () => {
    expect(paramsOf({ strategy: 'hmo', measured: { roomSizeFailures: 2, roomsMeasured: 4 } }).get('roomFails')).toBe('2');
    expect(paramsOf({ strategy: 'hmo', measured: { roomSizeFailures: null, roomsMeasured: 0 } }).get('roomFails')).toBeNull();
    expect(paramsOf({ strategy: 'hmo' }).get('roomFails')).toBeNull();
  });

  it('a handoff with neither is byte-identical to one built before D4', () => {
    const before = new URLSearchParams(buildAnalyserHandoff(listing, { strategy: 'btl' }).params).toString();
    const after = paramsOf({ strategy: 'btl', criteria: {}, measured: { roomSizeFailures: null, roomsMeasured: null } }).toString();
    expect(after).toBe(before);
  });
});
