import http from 'node:http';
import https from 'node:https';
import { afterAll, describe, expect, it } from 'vitest';
import { loadListingCorpus, type LoadedListing } from './listings';

/**
 * Corpus health (E3). Fails LOUDLY if any saved page stops parsing or the corpus
 * loses a case it is meant to cover, so a future extractor/parser change can't
 * silently drop coverage. Reads local files only — portal fetching is a
 * hard-rule violation.
 */

// Hard network guard. ARMED BEFORE the corpus is loaded (below) and covering
// fetch + node http/https request/get, so the actual load runs with the network
// blocked — a loud failure if any parse path ever reached out. Restored after.
let netCalls = 0;
const boom = (): never => { netCalls++; throw new Error('NETWORK BLOCKED: the corpus must never hit the network'); };
const saved = { fetch: globalThis.fetch, hr: http.request, hg: http.get, sr: https.request, sg: https.get };
function armNetworkGuard(): void {
  globalThis.fetch = boom as unknown as typeof fetch;
  http.request = boom as never; http.get = boom as never;
  https.request = boom as never; https.get = boom as never;
}
armNetworkGuard();
const corpus = loadListingCorpus(); // loaded UNDER the guard, so netCalls must stay 0
afterAll(() => { globalThis.fetch = saved.fetch; http.request = saved.hr; http.get = saved.hg; https.request = saved.sr; https.get = saved.sg; });

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?$/i;

describe('listing fixture corpus health', () => {
  it('loads the corpus under a network block with zero calls', () => {
    // the initial load above ran with fetch/http/https armed to throw
    expect(netCalls).toBe(0);
    // re-run under the same guard to prove the loader path stays network-free
    expect(() => loadListingCorpus()).not.toThrow();
    expect(netCalls).toBe(0);
    // baseline coverage: >= keeps this true as fixtures are ADDED (no code change
    // needed, per the README), but still fails if coverage shrinks below today's.
    expect(corpus.filter((c) => c.portal === 'rightmove').length).toBeGreaterThanOrEqual(3);
    expect(corpus.filter((c) => c.portal === 'zoopla').length).toBeGreaterThanOrEqual(3);
    expect(corpus.length).toBeGreaterThanOrEqual(6);
  });

  it.each(corpus)('$portal/$filename parses the embedded data into core facts', (c: LoadedListing) => {
    const s = c.summary;
    expect(s.askingPrice, `${s.filename}: asking price`).toMatch(/£[\d,]+/);
    expect(s.propertyType, `${s.filename}: property type`).toBeTruthy();
    expect(s.beds, `${s.filename}: beds`).toBeGreaterThan(0);
    expect(s.tenure, `${s.filename}: tenure`).toBeTruthy();
    expect(s.postcode ?? '', `${s.filename}: postcode`).toMatch(UK_POSTCODE);
    // must be > 0: a dropped/empty description is a silent parse regression
    expect(s.descriptionLength, `${s.filename}: description`).toBeGreaterThan(0);
  });

  // Coverage the corpus must keep — a future parse change that drops any of these
  // fails here rather than silently narrowing what the extractors are tested on.
  it('keeps its coverage: tenures, floor plan, floor area, reduced, added, HMO candidate, new build', () => {
    const tenures = corpus.map((c) => (c.summary.tenure ?? '').toUpperCase());
    expect(tenures.some((t) => t.includes('LEASEHOLD')), 'a leasehold fixture').toBe(true);
    expect(tenures.some((t) => t.includes('FREEHOLD')), 'a freehold fixture').toBe(true);

    expect(corpus.some((c) => c.summary.floorPlanPresent), 'a fixture with a floor plan').toBe(true);
    expect(corpus.some((c) => c.summary.floorAreaSqFt != null), 'a fixture stating floor area').toBe(true);
    expect(corpus.some((c) => /reduced/i.test(c.summary.listingUpdateReason ?? '')), 'a reduced-price fixture').toBe(true);
    expect(corpus.some((c) => /added/i.test(c.summary.listingUpdateReason ?? '')), 'an added/first-listed fixture').toBe(true);
    expect(corpus.some((c) => (c.summary.beds ?? 0) >= 5), 'a 5+ bed HMO candidate').toBe(true);
    // new build: assert the PARSED signal (Zoopla listingCondition==="new"), not
    // the filename — a parse regression on the new-build case must fail here.
    expect(corpus.some((c) => c.summary.newBuild), 'a new-build fixture (parsed)').toBe(true);
  });

  it('Rightmove uses flatted __PAGE_MODEL and Zoopla uses App-Router flight (no __NEXT_DATA__)', () => {
    // Guards the two portal formats we actually depend on (documented deviations
    // from the older window.PAGE_MODEL / __NEXT_DATA__ assumptions).
    const rm = corpus.find((c) => c.portal === 'rightmove')!;
    expect(rm.summary.askingPrice).toMatch(/£/); // proved the flatted registry rebuilt
    const z = corpus.find((c) => c.portal === 'zoopla')!;
    expect((z.data as { flight: number }).flight).toBeGreaterThan(1000); // flight decoded
  });
});
