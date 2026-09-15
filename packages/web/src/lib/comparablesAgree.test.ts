/**
 * C1 — EVERY SURFACE COMPARES AGAINST THE SAME SALES, PROVED BY THE SETS THEY
 * PRODUCE AND NOT BY THE ARGUMENTS THEY WERE BUILT FROM.
 *
 * ── WHAT WAS ACTUALLY WRONG ─────────────────────────────────────────────────
 * Three surfaces drew a comparison and no two of them agreed on what a
 * comparable was:
 *
 *   THE ANALYSER    one mile, twelve months, and NO TYPE FILTER — so a flat was
 *                   valued off detached-house £/m², and a separate module
 *                   existed to warn about that after the fact.
 *   THE DEAL PACK   the eight HIGHEST-PRICED sales in the whole postcode
 *                   sector. No type, no window, no radius, in a document
 *                   somebody sends to an investor.
 *   THE PRICE BAND  the whole postcode sector, over three years.
 *
 * ── WHY THIS COMPARES OUTPUTS ───────────────────────────────────────────────
 * It would be easy, and worthless, to assert that each surface passes
 * `COMPARABLE_RULES.radiusMiles`. That tests the spelling of an argument. What
 * differed was the WORK OF DECIDING WHAT TO ASK FOR, so each surface is driven
 * through its own real entry point — `analyserComparables`, `packComparables`,
 * `priceBand` — over ONE dataset, and the sales each one ends up counting are
 * compared to EACH OTHER.
 *
 * ── AND THE DATASET BITES ───────────────────────────────────────────────────
 * Every rule has a sale that violates it and a near-miss that does not, so a
 * filter that quietly stopped working could not pass by returning everything,
 * and one that returned nothing could not pass by returning nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BAND_RULES, COMPARABLE_RULES, clearDataCache, coreConfig, distanceMiles,
  priceBand, salesFromSector, type BandSale,
} from '@gil-bricks/core';
import { analyserComparables, packComparables } from './comparablesRun';
import { compsFrom } from './pack/packData';
import { DEFAULTS, type UrlState } from '../components/analyser/state';

const AT = { lat: 51.6014, lng: -3.3405 };
const AS_OF = '2026-07';
/** The subject: a terrace of 80 m², at CF37 1DL. */
const SUBJECT_TYPE = 'T';
const SUBJECT_SQM = 80;

/** Move `miles` north of the subject. One degree of latitude is ~69 miles. */
const north = (miles: number): { lat: number; lng: number } => ({ lat: AT.lat + miles / 69, lng: AT.lng });

interface Row {
  id: string; paon: string; date: string; type: string; sqm: number; price: number;
  at: { lat: number; lng: number };
  /** Why this row is here: the rule it is meant to exercise. */
  why: string;
  keep: boolean;
}

/**
 * THE DATASET. Five keepers — exactly `minComparables`, so nothing widens and
 * the DEFAULT rung is what is under test — and one violation of each rule.
 */
const ROWS: Row[] = [
  { id: 'k1', paon: '1', date: '2026-07-01', type: 'T', sqm: 80, price: 160_000, at: north(0.05), why: 'passes everything', keep: true },
  { id: 'k2', paon: '2', date: '2026-04-01', type: 'T', sqm: 78, price: 158_000, at: north(0.2), why: 'passes everything', keep: true },
  { id: 'k3', paon: '3', date: '2026-01-01', type: 'T', sqm: 84, price: 168_000, at: north(0.35), why: 'passes everything', keep: true },
  { id: 'k4', paon: '4', date: '2025-11-01', type: 'T', sqm: 82, price: 164_000, at: north(0.1), why: 'passes everything', keep: true },
  // The near misses: just inside the window, just inside the radius. If either
  // rule were applied a shade too tightly these would vanish and the set would
  // widen — which the assertions below would see.
  { id: 'k5', paon: '5', date: '2025-08-01', type: 'T', sqm: 80, price: 162_000, at: north(0.49), why: 'just inside 12 months and half a mile', keep: true },
  // …and the violations, each otherwise perfect.
  { id: 'x-type', paon: '6', date: '2026-07-01', type: 'D', sqm: 80, price: 400_000, at: north(0.05), why: 'right place and time, WRONG TYPE', keep: false },
  { id: 'x-old', paon: '7', date: '2025-06-01', type: 'T', sqm: 80, price: 90_000, at: north(0.05), why: 'right place and type, TOO OLD', keep: false },
  { id: 'x-far', paon: '8', date: '2026-07-01', type: 'T', sqm: 80, price: 900_000, at: north(0.9), why: 'right time and type, TOO FAR', keep: false },
];

const KEEPERS = ROWS.filter((r) => r.keep).map((r) => r.paon).sort();

const sectorFile = {
  schemaVersion: 1,
  sector: 'CF37 1',
  country: 'W92000004',
  updatedAt: AS_OF,
  sales: ROWS.map((r) => ({
    id: r.id, date: r.date, price: r.price, type: r.type, tenure: 'F', newBuild: false,
    paon: r.paon, saon: '', street: 'Test Street', town: 'Pontypridd', postcode: 'CF37 1DL',
    floorAreaSqm: r.sqm, ppsqm: Math.round(r.price / r.sqm), lat: r.at.lat, lng: r.at.lng,
  })),
  stats: { count: ROWS.length, typicalPrice: 162_000, typicalPpsqm: 2025, p10Price: 90_000, p90Price: 900_000 },
};

const BASE = coreConfig.dataBaseUrl.replace(/\/+$/, '');
const BODIES: Record<string, unknown> = {
  'manifest.json': {
    schemaVersion: 1, ppdMonth: AS_OF, ukhpiMonth: AS_OF, epcExtractDate: '2026-07-01',
    onspdEdition: '2026-05', generatedAt: '2026-08-01', sectorsCount: 1,
  },
  'sectors-index.json': [{ sectorId: 'CF37 1', lat: AT.lat, lng: AT.lng, country: 'W92000004', salesCount: ROWS.length, spanMiles: 1.5 }],
  'postcodes/CF37.json': { CF371DL: [AT.lat, AT.lng, 'W92000004', 'CF37 1'] },
  'sectors/CF37/CF37-1.json': sectorFile,
};

beforeEach(() => {
  clearDataCache();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = String(url).replace(`${BASE}/`, '');
    return path in BODIES
      ? new Response(JSON.stringify(BODIES[path]), { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response('not found', { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

/** The analyser, as the page runs it: the defaults, untouched. */
const analyserState = (over: Partial<UrlState> = {}): UrlState => ({
  ...DEFAULTS, postcode: 'CF37 1DL', price: '160000', type: SUBJECT_TYPE, area: String(SUBJECT_SQM), ...over,
});

describe('the three surfaces compare against the same sales', () => {
  it('the analyser keeps exactly the sales the rules admit, and no others', async () => {
    const run = await analyserComparables(analyserState());
    expect(run.result.comps.map((c) => c.paon).sort()).toEqual(KEEPERS);
    expect(run.widened, 'five is enough, so nothing widened').toBe(false);
    expect(run.tooFew).toBe(false);
  });

  it('the deal pack names the same sales, from a saved deal’s own parameters', async () => {
    const analyser = await analyserComparables(analyserState());
    const pack = await packComparables(new URLSearchParams({ postcode: 'CF37 1DL', type: SUBJECT_TYPE, price: '160000' }));
    // The rows the DOCUMENT prints, not the engine call behind them.
    const printed = compsFrom(pack, 0).map((r) => r.address).sort();
    const shown = analyser.result.comps.map((c) => `${c.paon} Test Street`).sort();
    expect(printed, 'the pack and the analyser name different sales').toEqual(shown);
  });

  /**
   * The price band is a DIFFERENT COMPARISON — £/m² within a size band — so it
   * cannot be expected to count the same number. What it must never do is
   * count a sale the shared rules exclude, so its count is measured against
   * the ANALYSER'S OWN SET narrowed by the one rule the band adds.
   */
  it('the price band counts only sales the analyser’s set already contains', async () => {
    const analyser = await analyserComparables(analyserState());
    const lo = SUBJECT_SQM * (1 - BAND_RULES.sizeTolerance);
    const hi = SUBJECT_SQM * (1 + BAND_RULES.sizeTolerance);
    const expected = analyser.result.comps
      .filter((c) => c.floorAreaSqm !== null && c.floorAreaSqm >= lo && c.floorAreaSqm <= hi).length;

    const band = priceBand({
      type: SUBJECT_TYPE, floorAreaSqm: SUBJECT_SQM, askingPrice: 160_000,
      sales: salesFromSector(sectorFile as never) as BandSale[],
      subjectAt: AT,
      // The same as-of month the analyser's window counts back from. Without
      // it the band counts from TODAY, which silently shortens the window by
      // however far behind the pipeline is — and on this very dataset that put
      // one sale in the analyser's set and out of the band's.
      asOf: AS_OF,
      now: new Date('2026-09-15'),
    });
    expect(band.kind, 'five in the size band is a comparison').toBe('range');
    expect(band.kind === 'range' && band.count).toBe(expected);
    expect(band.kind === 'range' && band.area, 'and it names the area it used').toBe('half-mile');
  });

  /**
   * THE BITE TEST. Every case above passes trivially if the dataset happens to
   * contain nothing a rule would reject, so each rejection is named and each
   * rule is shown to be the thing doing the rejecting.
   */
  it.each(ROWS.filter((r) => !r.keep).map((r) => [r.why, r] as const))(
    'no surface counts the sale that is %s', async (_why, row) => {
      const analyser = await analyserComparables(analyserState());
      const pack = await packComparables(new URLSearchParams({ postcode: 'CF37 1DL', type: SUBJECT_TYPE }));
      expect(analyser.result.comps.map((c) => c.id)).not.toContain(row.id);
      expect((pack ?? []).map((c) => c.id)).not.toContain(row.id);
      // …and it really would have changed the answer had it got through: each
      // violator is priced far away from the keepers on purpose.
      expect(Math.abs(row.price - 162_000)).toBeGreaterThan(50_000);
    },
  );

  /** …and the dataset is not simply empty on the other side of each rule. */
  it('the near misses are actually inside the rules, so the filters are not merely strict', async () => {
    const run = await analyserComparables(analyserState());
    const k5 = run.result.comps.find((c) => c.id === 'k5');
    expect(k5, 'the sale just inside 12 months and half a mile').toBeDefined();
    expect(distanceMiles(AT.lat, AT.lng, k5!.lat, k5!.lng)).toBeLessThanOrEqual(COMPARABLE_RULES.radiusMiles);
  });
});

/**
 * THE THREE DEFAULTS THEMSELVES, measured by what changes when they change —
 * not by reading the constant back out of the file that defines it.
 */
describe('the three defaults, shown by what they exclude', () => {
  it('the type filter is what removes the detached house', async () => {
    const withType = await analyserComparables(analyserState());
    const withoutType = await analyserComparables(analyserState({ ctype: 'all' }));
    expect(withType.result.comps.map((c) => c.id)).not.toContain('x-type');
    expect(withoutType.result.comps.map((c) => c.id), 'turning it off lets it back in').toContain('x-type');
  });

  it('the twelve-month window is what removes the older sale', async () => {
    const twelve = await analyserComparables(analyserState());
    const twentyFour = await analyserComparables(analyserState({ period: '24' }));
    expect(twelve.result.comps.map((c) => c.id)).not.toContain('x-old');
    expect(twentyFour.result.comps.map((c) => c.id), 'a longer window reaches it').toContain('x-old');
  });

  it('the half-mile radius is what removes the distant sale', async () => {
    const half = await analyserComparables(analyserState());
    const mile = await analyserComparables(analyserState({ radius: '1' }));
    expect(half.result.comps.map((c) => c.id)).not.toContain('x-far');
    expect(mile.result.comps.map((c) => c.id), 'a mile reaches it').toContain('x-far');
  });
});
