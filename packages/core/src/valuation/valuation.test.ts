import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { clearDataCache } from '../data/client';
import { coreConfig } from '../config';
import { valueProperty } from './index';

const sectorFixture = JSON.parse(
  readFileSync(new URL('../../data/fixtures/sectors/CF37/CF37-1.json', import.meta.url), 'utf8'),
);
const manifestFixture = {
  ...JSON.parse(readFileSync(new URL('../../data/fixtures/manifest.json', import.meta.url), 'utf8')),
  ukhpiMonth: '2026-06',
};
// Synthetic HPI: Wales 75 → 100 over the period = ×4/3 exactly.
const ukhpi = {
  source: 'test',
  ukhpiMonth: '2026-06',
  index: {
    E92000001: { '2019-03': 80, '2026-06': 96 },
    W92000004: { '2019-03': 75, '2026-06': 100 },
  },
};
const postcodeMap = { CF371DL: [51.6014, -3.3405, 'W92000004', 'CF37 1'] };
// English subject whose sector has NO ppsqm carriers (line B unavailable).
const mkSale = (id: string, price: number, ppsqm: number | null, lat: number, lng: number) => ({
  id: `{${id}}`, date: '2026-05-01', price, paon: '1', saon: '', street: 'TEST ST', town: 'TESTVILLE',
  postcode: 'M1 1AA', type: 'T', tenure: 'F', newBuild: false, lat, lng,
  floorAreaSqm: ppsqm === null ? null : 80, ppsqm,
});
const m1Sector = {
  schemaVersion: 1, sector: 'M1 1', country: 'E92000001', updatedAt: '2026-08-31T00:00:00Z',
  sales: [mkSale('E1', 200000, null, 53.48, -2.24), mkSale('E2', 220000, null, 53.481, -2.241)],
  stats: { count: 2, typicalPrice: 210000, typicalPpsqm: null, p10Price: 202000, p90Price: 218000 },
};
// Welsh sector with exactly FOUR ppsqm carriers (typicalPpsqm exists, evidence thin).
const cf38Sector = {
  schemaVersion: 1, sector: 'CF38 1', country: 'W92000004', updatedAt: '2026-08-31T00:00:00Z',
  sales: [
    mkSale('W1', 150000, 1500, 51.75, -3.34), mkSale('W2', 160000, 1600, 51.751, -3.341),
    mkSale('W3', 170000, 1700, 51.752, -3.342), mkSale('W4', 180000, 1800, 51.753, -3.343),
  ].map((s, i) => ({ ...s, postcode: 'CF38 1AA', sector: undefined })),
  stats: { count: 4, typicalPrice: 165000, typicalPpsqm: 1650, p10Price: 153000, p90Price: 177000 },
};
const sectorsIndex = [
  { sectorId: 'CF37 1', lat: 51.6014, lng: -3.3405, country: 'W92000004', salesCount: 12, spanMiles: 1.2 },
  { sectorId: 'M1 1', lat: 53.48, lng: -2.24, country: 'E92000001', salesCount: 2, spanMiles: 0.5 },
  { sectorId: 'CF38 1', lat: 51.75, lng: -3.34, country: 'W92000004', salesCount: 4, spanMiles: 0.5 },
];

const BASE = coreConfig.dataBaseUrl.replace(/\/+$/, '');
const fetchMock = vi.fn();
function route(url: string): Response {
  const path = url.replace(`${BASE}/`, '');
  const bodies: Record<string, unknown> = {
    'manifest.json': manifestFixture,
    'ukhpi.json': ukhpi,
    'sectors-index.json': sectorsIndex,
    'postcodes/CF37.json': postcodeMap,
    'postcodes/M1.json': { M11AA: [53.48, -2.24, 'E92000001', 'M1 1'] },
    'postcodes/CF38.json': { CF381AA: [51.75, -3.34, 'W92000004', 'CF38 1'] },
    'sectors/CF37/CF37-1.json': sectorFixture,
    'sectors/M1/M1-1.json': m1Sector,
    'sectors/CF38/CF38-1.json': cf38Sector,
  };
  if (path in bodies) return new Response(JSON.stringify(bodies[path]), { status: 200 });
  return new Response('nope', { status: 404 });
}
beforeEach(() => {
  clearDataCache();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => route(url));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

// Fixture line B: typicalPpsqm 1668 (8 of 12 sales have ppsqm; sqftCoverage 67%).

describe('line A — indexed last sale', () => {
  // £150,000 × (100 ÷ 75) = £200,000 (Wales table — subject is Welsh)
  it('indexes with the SUBJECT country table: £150,000 in 2019-03 → £200,000', async () => {
    const v = await valueProperty({ postcode: 'CF37 1DL', lastSalePrice: 150000, lastSaleDate: '2019-03-15' });
    expect(v.lines).toHaveLength(1);
    expect(v.lines[0].estimate).toBeCloseTo(200000, 6);
    expect(v.lines[0].breakdown.note).toMatch(/Wales/);
    expect(v.estimate).toBeCloseTo(200000, 6);
    expect(v.asOf).toBe('2026-06');
  });
  it('single-line valuations are medium confidence with a plain-words reason', async () => {
    const v = await valueProperty({ postcode: 'CF37 1DL', lastSalePrice: 150000, lastSaleDate: '2019-03' });
    expect(v.confidence).toBe('medium');
    expect(v.range.label).toBe('less certain');
    expect(v.confidenceReason).toMatch(/no floor-area evidence/);
  });
  it('rejects a sale month before the index starts', async () => {
    await expect(valueProperty({ postcode: 'CF37 1DL', lastSalePrice: 50000, lastSaleDate: '1994-01-01' }))
      .rejects.toMatchObject({ kind: 'BadInput' });
  });
  it('a recent sale past the index end gets an actionable message, not a 1968 lecture', async () => {
    await expect(valueProperty({ postcode: 'CF37 1DL', lastSalePrice: 150000, lastSaleDate: '2026-08' }))
      .rejects.toMatchObject({ kind: 'BadInput', message: expect.stringMatching(/use the price you paid/) });
  });
  it('impossible months and bad shapes are rejected before any lookup', async () => {
    for (const bad of ['2019-13', '2019-00', '2019-3', '2019-0315']) {
      await expect(valueProperty({ postcode: 'CF37 1DL', lastSalePrice: 150000, lastSaleDate: bad }))
        .rejects.toMatchObject({ kind: 'BadInput', message: expect.stringMatching(/real date/) });
    }
    await expect(valueProperty({ postcode: 'CF37 1DL', lastSalePrice: -5, lastSaleDate: '2019-03' }))
      .rejects.toMatchObject({ kind: 'BadInput' });
  });
  it('reused comparables for a different postcode are rejected', async () => {
    const { findComparables } = await import('../comparables/engine');
    const other = await findComparables({ postcode: 'CF38 1AA', radiusMiles: 1, periodMonths: 12, propertyType: 'all', tenure: 'any', age: 'all' });
    await expect(valueProperty({ postcode: 'CF37 1DL', floorAreaSqm: 90, comparables: other }))
      .rejects.toMatchObject({ kind: 'BadInput', message: expect.stringMatching(/same property/) });
  });
  it('price without date (and vice versa) is rejected', async () => {
    await expect(valueProperty({ postcode: 'CF37 1DL', lastSalePrice: 150000 })).rejects.toMatchObject({ kind: 'BadInput' });
    await expect(valueProperty({ postcode: 'CF37 1DL', lastSaleDate: '2019-03' })).rejects.toMatchObject({ kind: 'BadInput' });
  });
});

describe('English subjects and unavailable line B', () => {
  // £100,000 × (96 ÷ 80) = £120,000 on the ENGLAND table
  it('an English subject indexes with the England table', async () => {
    const v = await valueProperty({ postcode: 'M1 1AA', lastSalePrice: 100000, lastSaleDate: '2019-03' });
    expect(v.lines[0].estimate).toBeCloseTo(120000, 6);
    expect(v.lines[0].breakdown.note).toMatch(/England/);
  });
  it('area given but no nearby £/sqm: the user is TOLD their floor area could not be used', async () => {
    const v = await valueProperty({ postcode: 'M1 1AA', lastSalePrice: 100000, lastSaleDate: '2019-03', floorAreaSqm: 80 });
    expect(v.lines).toHaveLength(1);
    expect(v.confidenceReason).toMatch(/floor area could not be used/);
    expect(v.confidenceReason).toMatch(/too few nearby sales/);
  });
  it('area-only with no nearby £/sqm fails honestly', async () => {
    await expect(valueProperty({ postcode: 'M1 1AA', floorAreaSqm: 80 }))
      .rejects.toMatchObject({ kind: 'DataUnavailable' });
  });
});

describe('thin-evidence ladder rungs (4 £/sqm carriers)', () => {
  // CF38 1AA: typicalPpsqm 1650 from 4 carriers
  it('area-only on a handful of sales is LOW confidence', async () => {
    const v = await valueProperty({ postcode: 'CF38 1AA', floorAreaSqm: 100 });
    expect(v.lines[0].estimate).toBeCloseTo(165000, 6);
    expect(v.confidence).toBe('low');
    expect(v.confidenceReason).toMatch(/handful/);
  });
  it('two lines agreeing closely but on thin £/sqm evidence cap at MEDIUM', async () => {
    // line A: £123,750 × 4/3 = £165,000 — gap 0% but only 4 carriers → strongB false
    const v = await valueProperty({ postcode: 'CF38 1AA', lastSalePrice: 123750, lastSaleDate: '2019-03', floorAreaSqm: 100 });
    expect(v.lines).toHaveLength(2);
    expect(v.confidence).toBe('medium');
  });
});

describe('line B — area £/sqm', () => {
  // 1668 £/sqm × 90 sqm = £150,120
  it('typicalPpsqm × area: 90 sqm → £150,120', async () => {
    const v = await valueProperty({ postcode: 'CF37 1DL', floorAreaSqm: 90 });
    expect(v.lines).toHaveLength(1);
    expect(v.lines[0].estimate).toBeCloseTo(150120, 6);
    expect(v.lines[0].breakdown.substituted).toMatch(/£1,668\/sqm × 90 sqm/);
  });
  it('area outside the honest EPC bounds is rejected', async () => {
    await expect(valueProperty({ postcode: 'CF37 1DL', floorAreaSqm: 5 })).rejects.toMatchObject({ kind: 'BadInput' });
    await expect(valueProperty({ postcode: 'CF37 1DL', floorAreaSqm: 900 })).rejects.toMatchObject({ kind: 'BadInput' });
  });
});

describe('blend + confidence ladder', () => {
  it('two agreeing lines blend to their mean with HIGH confidence (±5%)', async () => {
    // line A: £115,000 × (100/75) = £153,333.33; line B: £150,120 → gap ~2.1% of mean
    const v = await valueProperty({ postcode: 'CF37 1DL', lastSalePrice: 115000, lastSaleDate: '2019-03', floorAreaSqm: 90 });
    expect(v.lines).toHaveLength(2);
    expect(v.estimate).toBeCloseTo((153333.3333 + 150120) / 2, 1);
    expect(v.confidence).toBe('high');
    expect(v.range.label).toBe('fairly reliable');
    expect(v.range.marginPct).toBe(5);
  });
  it('a moderate gap is MEDIUM; a wide gap is LOW with a warning reason', async () => {
    // line A: £135,000 × 4/3 = £180,000 vs B £150,120 → gap ~18% → medium
    const med = await valueProperty({ postcode: 'CF37 1DL', lastSalePrice: 135000, lastSaleDate: '2019-03', floorAreaSqm: 90 });
    expect(med.confidence).toBe('medium');
    // line A: £190,000 × 4/3 = £253,333 vs B £150,120 → gap ~51% → low
    const low = await valueProperty({ postcode: 'CF37 1DL', lastSalePrice: 190000, lastSaleDate: '2019-03', floorAreaSqm: 90 });
    expect(low.confidence).toBe('low');
    expect(low.range.marginPct).toBe(20);
    expect(low.confidenceReason).toMatch(/disagree/);
  });
  it('no inputs at all is rejected with a plain message', async () => {
    await expect(valueProperty({ postcode: 'CF37 1DL' })).rejects.toMatchObject({ kind: 'BadInput' });
  });
  it('the blend breakdown states the no-adjustments rule', async () => {
    const v = await valueProperty({ postcode: 'CF37 1DL', floorAreaSqm: 90 });
    expect(v.breakdown.note).toMatch(/never multipliers/);
    expect(v.breakdown.result).toMatch(/likely between/);
  });
});
