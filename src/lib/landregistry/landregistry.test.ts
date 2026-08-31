import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { clearDataCache } from '../data/client';
import { siteConfig } from '../../site.config';
import { valueProperty } from '../valuation';
import {
  clearLandRegistryCache,
  fetchSaleHistory,
  getTransaction,
  normaliseAddressKey,
  OGL_ATTRIBUTION,
} from './index';

const LR = 'https://landregistry.data.gov.uk/data/ppi';
const mkLrItem = (over: Record<string, unknown> = {}) => ({
  transactionId: 'AAAA1111-2222-3333-4444-555566667777',
  transactionDate: 'Fri, 01 Aug 2025',
  pricePaid: 139500,
  newBuild: false,
  propertyType: { _about: 'http://landregistry.data.gov.uk/def/common/terraced' },
  transactionCategory: { _about: 'http://landregistry.data.gov.uk/def/ppi/standardPricePaidTransaction' },
  propertyAddress: { paon: '6', street: 'VAUGHAN STREET', postcode: 'CF37 1HR' },
  ...over,
});

// Data-layer fixtures for the valuation wiring tests
const sectorFixture = JSON.parse(readFileSync(new URL('../../../data/fixtures/sectors/CF37/CF37-1.json', import.meta.url), 'utf8'));
const manifestFixture = { ...JSON.parse(readFileSync(new URL('../../../data/fixtures/manifest.json', import.meta.url), 'utf8')), ukhpiMonth: '2026-06' };
const ukhpi = { source: 'test', ukhpiMonth: '2026-06', index: { E92000001: { '2025-08': 96, '2026-06': 96 }, W92000004: { '2025-08': 96, '2026-06': 100 } } };

const BASE = siteConfig.dataBaseUrl.replace(/\/+$/, '');
const fetchMock = vi.fn();
let lrItems: unknown[] = [];
let lrBehaviour: 'ok' | 'hang' | 'http500' = 'ok';

function route(url: string, opts?: { signal?: AbortSignal }): Promise<Response> {
  if (url.startsWith(LR)) {
    if (lrBehaviour === 'hang') {
      return new Promise((_, reject) => {
        opts?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    if (lrBehaviour === 'http500') return Promise.resolve(new Response('boom', { status: 500 }));
    if (url.includes('/transaction/')) {
      return Promise.resolve(new Response(JSON.stringify({ result: { primaryTopic: { ...mkLrItem(), estateType: { _about: 'http://landregistry.data.gov.uk/def/common/freehold' }, propertyAddress: { paon: '6', street: 'VAUGHAN STREET', town: 'PONTYPRIDD', postcode: 'CF37 1HR' } } } }), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ result: { items: lrItems } }), { status: 200 }));
  }
  const path = url.replace(`${BASE}/`, '');
  const bodies: Record<string, unknown> = {
    'manifest.json': manifestFixture,
    'ukhpi.json': ukhpi,
    'sectors-index.json': [{ sectorId: 'CF37 1', lat: 51.6014, lng: -3.3405, country: 'W92000004', salesCount: 12, spanMiles: 1.2 }],
    'postcodes/CF37.json': { CF371DL: [51.6014, -3.3405, 'W92000004', 'CF37 1'] },
    'sectors/CF37/CF37-1.json': sectorFixture,
  };
  if (path in bodies) return Promise.resolve(new Response(JSON.stringify(bodies[path]), { status: 200 }));
  return Promise.resolve(new Response('nope', { status: 404 }));
}

beforeEach(() => {
  clearDataCache();
  clearLandRegistryCache();
  lrItems = [];
  lrBehaviour = 'ok';
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, opts?: { signal?: AbortSignal }) => route(url, opts));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('normaliseAddressKey (mirrors the pipeline norm())', () => {
  it('uppercases, strips punctuation, collapses whitespace', () => {
    expect(normaliseAddressKey(' Flat 2,  8a ')).toBe('FLAT 2 8A');
    expect(normaliseAddressKey("ST. JOHN'S")).toBe('ST JOHN S');
    expect(normaliseAddressKey(undefined)).toBe('');
  });
});

describe('fetchSaleHistory', () => {
  it('matches by normalised paon, newest first, mapped fields', async () => {
    lrItems = [
      mkLrItem({ transactionDate: 'Fri, 02 Oct 1998', pricePaid: 21000, transactionId: 'OLD1-...' }),
      mkLrItem(),
      mkLrItem({ propertyAddress: { paon: '8', street: 'VAUGHAN STREET' }, pricePaid: 999999 }),
    ];
    const r = await fetchSaleHistory({ postcode: 'cf37 1hr', paon: '6' });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.sales).toHaveLength(2);
      expect(r.sales[0]).toEqual({ date: '2025-08-01', price: 139500, transactionId: 'AAAA1111-2222-3333-4444-555566667777', propertyType: 'T', newBuild: false, category: 'A' });
      expect(r.sales[1].date).toBe('1998-10-02');
    }
  });
  it('no saon given + only flat records → ambiguous candidates, never a guess', async () => {
    lrItems = [
      mkLrItem({ propertyAddress: { paon: '6', saon: 'FLAT 1', street: 'VAUGHAN STREET' } }),
      mkLrItem({ propertyAddress: { paon: '6', saon: 'FLAT 2', street: 'VAUGHAN STREET' } }),
    ];
    const r = await fetchSaleHistory({ postcode: 'CF37 1HR', paon: '6' });
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.candidates.map((c) => c.saon)).toEqual(['FLAT 1', 'FLAT 2']);
  });
  it('additional-category sales are labelled B', async () => {
    lrItems = [mkLrItem({ transactionCategory: { _about: 'http://landregistry.data.gov.uk/def/ppi/additionalPricePaidTransaction' } })];
    const r = await fetchSaleHistory({ postcode: 'CF37 1HR', paon: '6' });
    if (r.kind === 'ok') expect(r.sales[0].category).toBe('B');
  });
  it('empty result for an unknown address', async () => {
    lrItems = [mkLrItem()];
    const r = await fetchSaleHistory({ postcode: 'CF37 1HR', paon: '99' });
    expect(r).toEqual({ kind: 'ok', sales: [] });
  });
  it('times out after 6s with a Timeout error', async () => {
    vi.useFakeTimers();
    lrBehaviour = 'hang';
    const p = fetchSaleHistory({ postcode: 'CF37 1HR', paon: '6' });
    const expectation = expect(p).rejects.toMatchObject({ kind: 'Timeout' });
    await vi.advanceTimersByTimeAsync(6100);
    await expectation;
  });
  it('HTTP errors surface as Network', async () => {
    lrBehaviour = 'http500';
    await expect(fetchSaleHistory({ postcode: 'CF37 1HR', paon: '6' })).rejects.toMatchObject({ kind: 'Network' });
  });
});

describe('getTransaction', () => {
  it('strips braces and returns detail with address + estate type', async () => {
    const t = await getTransaction('{AAAA1111-2222-3333-4444-555566667777}');
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/transaction/AAAA1111-2222-3333-4444-555566667777/current.json'))).toBe(true);
    expect(t.price).toBe(139500);
    expect(t.address.town).toBe('PONTYPRIDD');
    expect(t.estateType).toBe('freehold');
  });
});

describe('valueProperty wiring', () => {
  it('auto-fills line A from Land Registry (source=landregistry)', async () => {
    lrItems = [mkLrItem({ propertyAddress: { paon: '14', street: 'WOOD ROAD' } })];
    // Wales table: 2025-08 index 96 → 2026-06 index 100
    const v = await valueProperty({ postcode: 'CF37 1DL', paon: '14' });
    expect(v.lastSaleSource).toBe('landregistry');
    expect(v.lines[0].estimate).toBeCloseTo(139500 * (100 / 96), 4);
    expect(v.lines[0].breakdown.note).toMatch(/found automatically at Land Registry/);
  });
  it('user-supplied last sale wins over the lookup (source=user)', async () => {
    lrItems = [mkLrItem({ propertyAddress: { paon: '14', street: 'WOOD ROAD' } })];
    const v = await valueProperty({ postcode: 'CF37 1DL', paon: '14', lastSalePrice: 100000, lastSaleDate: '2025-08' });
    expect(v.lastSaleSource).toBe('user');
    expect(v.lines[0].estimate).toBeCloseTo(100000 * (100 / 96), 4);
    const lrCalls = fetchMock.mock.calls.filter(([u]) => String(u).startsWith(LR));
    expect(lrCalls).toHaveLength(0);
  });
  it('no history found → source=none, valuation still works on line B', async () => {
    lrItems = [];
    const v = await valueProperty({ postcode: 'CF37 1DL', paon: '999', floorAreaSqm: 90 });
    expect(v.lastSaleSource).toBe('none');
    expect(v.lines).toHaveLength(1);
    expect(v.lines[0].label).toBe('Area £/sqm × floor area');
  });
  it('a Land Registry outage degrades gracefully, never breaks the valuation', async () => {
    lrBehaviour = 'http500';
    const v = await valueProperty({ postcode: 'CF37 1DL', paon: '14', floorAreaSqm: 90 });
    expect(v.lastSaleSource).toBe('none');
    expect(v.lines).toHaveLength(1);
  });
  it('category-B newest sale is skipped in favour of the older A sale', async () => {
    lrItems = [
      mkLrItem({ transactionCategory: { _about: 'http://landregistry.data.gov.uk/def/ppi/additionalPricePaidTransaction' }, pricePaid: 50000, transactionDate: 'Mon, 02 Feb 2026', propertyAddress: { paon: '14', street: 'WOOD ROAD' } }),
      mkLrItem({ propertyAddress: { paon: '14', street: 'WOOD ROAD' } }), // A, 2025-08 £139,500
    ];
    const v = await valueProperty({ postcode: 'CF37 1DL', paon: '14' });
    expect(v.lastSaleSource).toBe('landregistry');
    expect(v.lines[0].estimate).toBeCloseTo(139500 * (100 / 96), 4);
  });
  it('only-B history means no auto line A', async () => {
    lrItems = [mkLrItem({ transactionCategory: { _about: 'http://landregistry.data.gov.uk/def/ppi/additionalPricePaidTransaction' }, propertyAddress: { paon: '14', street: 'WOOD ROAD' } })];
    const v = await valueProperty({ postcode: 'CF37 1DL', paon: '14', floorAreaSqm: 90 });
    expect(v.lastSaleSource).toBe('none');
    expect(v.lines[0].label).toBe('Area £/sqm × floor area');
  });
  it('an ambiguous history degrades gracefully to line B', async () => {
    lrItems = [
      mkLrItem({ propertyAddress: { paon: '14', saon: 'FLAT 1', street: 'WOOD ROAD' } }),
      mkLrItem({ propertyAddress: { paon: '14', saon: 'FLAT 2', street: 'WOOD ROAD' } }),
    ];
    const v = await valueProperty({ postcode: 'CF37 1DL', paon: '14', floorAreaSqm: 90 });
    expect(v.lastSaleSource).toBe('none');
    expect(v.lines).toHaveLength(1);
  });
  it('an auto-found sale newer than the HPI end falls back to the next indexable sale', async () => {
    // HPI table ends 2026-06; the 2026-07 sale cannot be indexed
    lrItems = [
      mkLrItem({ transactionDate: 'Wed, 15 Jul 2026', pricePaid: 180000, propertyAddress: { paon: '14', street: 'WOOD ROAD' } }),
      mkLrItem({ propertyAddress: { paon: '14', street: 'WOOD ROAD' } }), // 2025-08 £139,500
    ];
    const v = await valueProperty({ postcode: 'CF37 1DL', paon: '14', floorAreaSqm: 90 });
    expect(v.lastSaleSource).toBe('landregistry');
    const a = v.lines.find((l) => l.label === 'Indexed last sale');
    expect(a?.estimate).toBeCloseTo(139500 * (100 / 96), 4);
  });
  it('compact postcodes are re-spaced for the server filter', async () => {
    lrItems = [mkLrItem()];
    await fetchSaleHistory({ postcode: 'cf371hr', paon: '6' });
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('propertyAddress.postcode=CF37%201HR'))).toBe(true);
  });
  it('lowercase GUIDs are uppercased for the service', async () => {
    await getTransaction('402a3a66-83f7-a7df-e063-4804a8c0b80d');
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/transaction/402A3A66-83F7-A7DF-E063-4804A8C0B80D/current.json'))).toBe(true);
  });
  it('the OGL attribution constant exists for the UI', () => {
    expect(OGL_ATTRIBUTION).toMatch(/HM Land Registry/);
    expect(OGL_ATTRIBUTION).toMatch(/Open Government Licence/);
  });
});
