import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { clearDataCache } from '../data/client';
import { siteConfig } from '../../site.config';
import {
  ComparablesError,
  compLinks,
  computeStats,
  distanceMiles,
  findComparables,
  geocodePostcode,
  periodStart,
  sortComps,
  type Comp,
  type ComparablesInput,
} from './index';

// The real CF37 1 fixture (12 sales around Pontypridd, window to 2026-07).
const sectorFixture = JSON.parse(
  readFileSync(new URL('../../../data/fixtures/sectors/CF37/CF37-1.json', import.meta.url), 'utf8'),
);
const manifestFixture = JSON.parse(
  readFileSync(new URL('../../../data/fixtures/manifest.json', import.meta.url), 'utf8'),
);

// Synthetic companions: a postcode map + a one-sector index around the fixture.
const SUBJECT = [51.6014, -3.3405, 'W92000004', 'CF37 1'];
const postcodeMap = {
  CF371DL: SUBJECT,
  CF371XX: [51.7, -3.3405, 'W92000004', 'CF37 1'], // ~6.8 miles north
};
const sectorsIndex = [
  { sectorId: 'CF37 1', lat: 51.6014, lng: -3.3405, country: 'W92000004', salesCount: 12, spanMiles: 1.2 },
  { sectorId: 'CF37 2', lat: 53.0, lng: -3.3405, country: 'W92000004', salesCount: 5, spanMiles: 1.0 }, // ~97mi away
];

const BASE = siteConfig.dataBaseUrl.replace(/\/+$/, '');
const fetchMock = vi.fn();

function route(url: string): Response {
  const path = url.replace(`${BASE}/`, '');
  const bodies: Record<string, unknown> = {
    'manifest.json': manifestFixture,
    'sectors-index.json': sectorsIndex,
    'postcodes/CF37.json': postcodeMap,
    'sectors/CF37/CF37-1.json': sectorFixture,
  };
  if (path in bodies) {
    return new Response(JSON.stringify(bodies[path]), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response('not found', { status: 404 });
}

beforeEach(() => {
  clearDataCache();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => route(url));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const baseInput: ComparablesInput = {
  postcode: 'CF37 1DL',
  radiusMiles: 1,
  periodMonths: 12,
  propertyType: 'all',
  tenure: 'any',
  age: 'all',
};

describe('distanceMiles', () => {
  it('0.01° of latitude ≈ 0.691 miles', () => {
    expect(distanceMiles(51.6, -3.34, 51.61, -3.34)).toBeCloseTo(0.6909, 3);
  });
  it('London → Cardiff ≈ 131 miles', () => {
    expect(distanceMiles(51.5074, -0.1278, 51.4816, -3.1791)).toBeCloseTo(131.0, 0);
  });
  it('zero for identical points', () => {
    expect(distanceMiles(51.6, -3.34, 51.6, -3.34)).toBe(0);
  });
});

describe('periodStart (counts back from asOf, not today)', () => {
  it('6 months ending 2026-07 start 2026-02-01', () => {
    expect(periodStart('2026-07', 6)).toBe('2026-02-01');
  });
  it('12 months ending 2026-07 start 2025-08-01', () => {
    expect(periodStart('2026-07', 12)).toBe('2025-08-01');
  });
  it('year boundary: 6 months ending 2026-03 start 2025-10-01', () => {
    expect(periodStart('2026-03', 6)).toBe('2025-10-01');
  });
});

describe('geocodePostcode', () => {
  it('resolves a known postcode with display formatting', async () => {
    const g = await geocodePostcode('cf371dl');
    expect(g).toEqual({ postcode: 'CF37 1DL', lat: 51.6014, lng: -3.3405, country: 'W92000004', sectorId: 'CF37 1' });
  });
  it('rejects Scottish and NI areas without fetching', async () => {
    for (const pc of ['EH1 1AA', 'G1 1AA', 'BT1 1AA']) {
      await expect(geocodePostcode(pc)).rejects.toMatchObject({ kind: 'OutsideEnglandWales' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('border areas (TD, DG) are NOT hard-rejected — they fall through to lookup', async () => {
    // DG16 has English postcodes at Gretna; a lookup miss gets the softer message
    await expect(geocodePostcode('DG1 1AA')).rejects.toMatchObject({ kind: 'UnknownPostcode' });
    await expect(geocodePostcode('TD1 1AA')).rejects.toMatchObject({ kind: 'UnknownPostcode' });
  });
  it('rejects unknown postcodes and garbage clearly', async () => {
    await expect(geocodePostcode('CF37 9ZZ')).rejects.toMatchObject({ kind: 'UnknownPostcode' });
    await expect(geocodePostcode('NOT A PC')).rejects.toMatchObject({ kind: 'BadInput' });
  });
  it('maps a missing outcode file (404) to UnknownPostcode', async () => {
    await expect(geocodePostcode('ZZ9 9ZZ')).rejects.toMatchObject({ kind: 'UnknownPostcode' });
  });
});

describe('findComparables — radius, period, sectors', () => {
  it('finds the fixture sales within a mile, sorted by distance', async () => {
    const r = await findComparables(baseInput);
    expect(r.subject.postcode).toBe('CF37 1DL');
    expect(r.sectorsSearched).toEqual(['CF37 1']); // CF37 2 is ~97mi away — never fetched
    expect(r.comps.length).toBeGreaterThan(0);
    expect(r.asOf).toBe('2026-07');
    const dists = r.comps.map((c) => c.distanceMiles);
    expect([...dists].sort((a, b) => a - b)).toEqual(dists);
    for (const c of r.comps) expect(c.distanceMiles).toBeLessThanOrEqual(1);
  });
  it('a tighter radius returns fewer or equal comps, never more', async () => {
    const wide = await findComparables(baseInput);
    const tight = await findComparables({ ...baseInput, radiusMiles: 0.25 });
    expect(tight.comps.length).toBeLessThanOrEqual(wide.comps.length);
  });
  it('rejects a radius above the hard cap — never auto-widens', async () => {
    await expect(findComparables({ ...baseInput, radiusMiles: 2 as never })).rejects.toMatchObject({ kind: 'BadInput' });
  });
  it('period boundary uses asOf: 6 months excludes sales before 2026-02-01', async () => {
    const r6 = await findComparables({ ...baseInput, periodMonths: 6 });
    for (const c of r6.comps) expect(c.date >= '2026-02-01').toBe(true);
    const r12 = await findComparables(baseInput);
    expect(r6.comps.length).toBeLessThan(r12.comps.length);
  });
});

describe('findComparables — filters', () => {
  it('propertyType T / houses / DS / F behave as groupings', async () => {
    const t = await findComparables({ ...baseInput, propertyType: 'T' });
    expect(t.comps.every((c) => c.type === 'T')).toBe(true);
    const houses = await findComparables({ ...baseInput, propertyType: 'houses' });
    expect(houses.comps.every((c) => 'DST'.includes(c.type))).toBe(true);
    const ds = await findComparables({ ...baseInput, propertyType: 'DS' });
    expect(ds.comps.every((c) => 'DS'.includes(c.type))).toBe(true);
    const f = await findComparables({ ...baseInput, propertyType: 'F' });
    expect(f.comps.every((c) => c.type === 'F')).toBe(true);
    expect(t.comps.length + f.comps.length).toBeLessThanOrEqual((await findComparables(baseInput)).comps.length);
  });
  it('tenure and age filters', async () => {
    const lease = await findComparables({ ...baseInput, tenure: 'L' });
    expect(lease.comps.every((c) => c.tenure === 'L')).toBe(true);
    const free = await findComparables({ ...baseInput, tenure: 'F' });
    expect(free.comps.every((c) => c.tenure === 'F')).toBe(true);
    const oldOnly = await findComparables({ ...baseInput, age: 'old' });
    expect(oldOnly.comps.every((c) => !c.newBuild)).toBe(true);
    // the fixture holds no new-builds, so 'new' honestly returns none
    const newOnly = await findComparables({ ...baseInput, age: 'new' });
    expect(newOnly.comps).toEqual([]);
  });
  it('single D and S types, maxAreaSqm, and unknown excluded ids', async () => {
    const d = await findComparables({ ...baseInput, propertyType: 'D' });
    expect(d.comps.every((c) => c.type === 'D')).toBe(true);
    const s = await findComparables({ ...baseInput, propertyType: 'S' });
    expect(s.comps.every((c) => c.type === 'S')).toBe(true);
    const small = await findComparables({ ...baseInput, maxAreaSqm: 90 });
    expect(small.comps.every((c) => c.floorAreaSqm !== null && c.floorAreaSqm <= 90)).toBe(true);
    const ghost = await findComparables({ ...baseInput, excludedIds: ['{NOT-A-REAL-ID}'] });
    expect(ghost.comps.every((c) => c.included)).toBe(true);
  });
  it('rejects unknown propertyType/tenure/age as BadInput', async () => {
    await expect(findComparables({ ...baseInput, propertyType: 'X' as never })).rejects.toMatchObject({ kind: 'BadInput' });
    await expect(findComparables({ ...baseInput, tenure: 'X' as never })).rejects.toMatchObject({ kind: 'BadInput' });
    await expect(findComparables({ ...baseInput, age: 'X' as never })).rejects.toMatchObject({ kind: 'BadInput' });
  });
  it('price and area bounds (unknown areas excluded when bounds set)', async () => {
    const cheap = await findComparables({ ...baseInput, maxPrice: 130000 });
    expect(cheap.comps.every((c) => c.price <= 130000)).toBe(true);
    const sized = await findComparables({ ...baseInput, minAreaSqm: 80 });
    expect(sized.comps.every((c) => c.floorAreaSqm !== null && c.floorAreaSqm >= 80)).toBe(true);
  });
});

describe('include/exclude — live recalc', () => {
  it('excluding ids changes stats but not the comp list', async () => {
    const all = await findComparables(baseInput);
    const firstId = all.comps[0].id;
    const excl = await findComparables({ ...baseInput, excludedIds: [firstId] });
    expect(excl.comps.length).toBe(all.comps.length); // list unchanged
    expect(excl.comps.find((c) => c.id === firstId)?.included).toBe(false);
    expect(excl.stats.count).toBe(all.stats.count - 1);
    expect(excl.stats.typicalPrice).not.toBeNull();
  });
  it('computeStats: typicalPpsqm needs ≥3 comps with ppsqm; empty stats are null', () => {
    const mk = (price: number, ppsqm: number | null, included = true): Comp =>
      ({ price, ppsqm, included } as unknown as Comp);
    expect(computeStats([mk(100000, 1500), mk(120000, 1600)]).typicalPpsqm).toBeNull();
    expect(computeStats([mk(100000, 1500), mk(120000, 1600), mk(140000, 1700)]).typicalPpsqm).toBe(1600);
    expect(computeStats([]).count).toBe(0);
    expect(computeStats([]).typicalPrice).toBeNull();
    expect(computeStats([mk(100000, 1500), mk(120000, null)]).sqftCoveragePct).toBe(50);
  });
});

describe('empty state', () => {
  it('zero comps returns an honest empty result with a suggestion', async () => {
    const r = await findComparables({ ...baseInput, radiusMiles: 0.25, periodMonths: 6, minPrice: 99999999 });
    expect(r.comps).toEqual([]);
    expect(r.stats.count).toBe(0);
    expect(r.suggestion).toMatch(/No sales found/);
  });
  it('bounds that filtered everything out still count as relaxable filters', async () => {
    const r = await findComparables({ ...baseInput, minPrice: 99999999 });
    expect(r.comps).toEqual([]);
    expect(r.suggestion).toMatch(/relaxing the filters/);
    expect(r.suggestion).not.toMatch(/very little price evidence/);
  });
  it('at max radius+period with no filters the suggestion is honest about thin evidence', async () => {
    // subject far north of the fixture sales: nothing within a mile
    const r = await findComparables({ ...baseInput, postcode: 'CF37 1XX' });
    expect(r.comps).toEqual([]);
    expect(r.suggestion).toMatch(/very little price evidence/);
  });
});

describe('sort helpers', () => {
  it('sorts by each key; null ppsqm always last', async () => {
    const { comps } = await findComparables(baseInput);
    const byPrice = sortComps(comps, 'price');
    for (let i = 1; i < byPrice.length; i += 1) expect(byPrice[i].price).toBeGreaterThanOrEqual(byPrice[i - 1].price);
    const byDateDesc = sortComps(comps, 'date', 'desc');
    for (let i = 1; i < byDateDesc.length; i += 1) expect(byDateDesc[i].date <= byDateDesc[i - 1].date).toBe(true);
    const byPpsqm = sortComps(comps, 'ppsqm');
    const nullsAt = byPpsqm.map((c, i) => (c.ppsqm === null ? i : -1)).filter((i) => i >= 0);
    for (const i of nullsAt) expect(i).toBeGreaterThanOrEqual(byPpsqm.length - nullsAt.length);
    expect(sortComps(comps, 'distance')).not.toBe(comps); // new array
  });
});

describe('portal links (compliance: entry pages only)', () => {
  it('Land Registry per-transaction; portals landing pages only', () => {
    const links = compLinks('{FA0EFA0E-0001-4B33-9CAF-FA0EFA0E0001}');
    expect(links.landRegistry).toBe('https://landregistry.data.gov.uk/data/ppi/transaction/FA0EFA0E-0001-4B33-9CAF-FA0EFA0E0001/current');
    expect(links.zooplaHousePrices).toBe('https://www.zoopla.co.uk/house-prices/');
    expect(links.rightmoveHousePrices).toBe('https://www.rightmove.co.uk/house-prices.html');
  });
});
