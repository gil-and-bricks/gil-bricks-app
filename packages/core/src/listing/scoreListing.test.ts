import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractListing, floorAreaFromSector, priceVsSector, scoreListing, FALLBACK_CONFIG } from './index';
import type { SectorFile } from '../data/types';

/** Honest scoring (E6): BTL scores from listing + rent + our sector data; the
 * price-vs-sold component is real (or "not enough sales"); other strategies
 * defer honestly; floor area comes from EPC sector data by address. */

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'listings');
function docFromHtml(html: string, url: string): Document {
  const w = new Window({ url, settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  w.document.write(html);
  return w.document as unknown as Document;
}
function rmFlat() {
  const url = 'https://www.rightmove.co.uk/properties/159999001';
  const html = readFileSync(join(CORPUS, 'rightmove', 'rightmove-leasehold-flat-added.html'), 'utf8');
  const res = extractListing('rightmove', docFromHtml(html, url), FALLBACK_CONFIG, url);
  if (!res.ok) throw new Error('fixture failed to extract');
  return res.listing; // SA1 8AJ, £170,000, Apartment, 2 bed
}

const sector = (over: Partial<SectorFile['stats']> = {}, sales: SectorFile['sales'] = []): SectorFile =>
  ({
    schemaVersion: 1, sector: 'SA1 8', country: 'W92000004', updatedAt: '2026-08-31T00:00:00Z', sales,
    stats: { count: 20, typicalPrice: 180000, typicalPpsqm: 2200, p10Price: 120000, p90Price: 230000, ...over },
  }) as SectorFile;

describe('priceVsSector', () => {
  it('bands the value against typical / p90', () => {
    expect(priceVsSector(150000, sector(), 5).status).toBe('green'); // <= typical
    expect(priceVsSector(200000, sector(), 5).status).toBe('amber'); // <= p90
    expect(priceVsSector(250000, sector(), 5).status).toBe('red'); // > p90
  });
  it('says "not enough sales" below the minimum, and "no-data" without a sector', () => {
    expect(priceVsSector(150000, sector({ count: 3 }), 5).status).toBe('not-enough-sales');
    expect(priceVsSector(150000, null, 5).status).toBe('no-data');
  });
  it('computes the subject £/sqm when a floor area is known', () => {
    expect(priceVsSector(180000, sector(), 5, 90).subjectPpsqm).toBe(2000);
  });
});

describe('floorAreaFromSector (EPC by address)', () => {
  const sales = [
    { id: '1', date: '2026-01-01', price: 175000, paon: '31', saon: '', street: 'Kings Road', town: 'Swansea', postcode: 'SA1 8AJ', type: 'F', tenure: 'L', newBuild: false, lat: 0, lng: 0, floorAreaSqm: 68, ppsqm: 2574 },
  ] as unknown as SectorFile['sales'];
  it('returns the EPC floor area for a matching address', () => {
    expect(floorAreaFromSector(sector({}, sales), { paon: '31', street: 'Kings Road' })).toBe(68);
  });
  it('returns null when no address matches', () => {
    expect(floorAreaFromSector(sector({}, sales), { paon: '99' })).toBeNull();
    expect(floorAreaFromSector(sector({}, sales), null)).toBeNull();
  });
  it('never borrows a different unit at the same paon (saon presence must agree)', () => {
    const mk = (saon: string, area: number) => ({ id: saon || 'w', date: '2026-01-01', price: 1, paon: '10', saon, street: 'X', town: 'Y', postcode: 'SA1 8AJ', type: 'F', tenure: 'L', newBuild: false, lat: 0, lng: 0, floorAreaSqm: area, ppsqm: 1 });
    const flats = [mk('Flat 1', 40), mk('', 120)] as unknown as SectorFile['sales'];
    // a listing WITHOUT a flat number must not borrow Flat 1's area
    expect(floorAreaFromSector(sector({}, flats), { paon: '10' })).toBe(120);
    // a listing WITH a flat number must not borrow the whole-building row
    expect(floorAreaFromSector(sector({}, [mk('', 120)] as unknown as SectorFile['sales']), { paon: '10', saon: 'Flat 2' })).toBeNull();
  });
});

describe('scoreListing', () => {
  it('BTL: waits on rent, still gives a real price-vs-sold', () => {
    const r = scoreListing(rmFlat(), { strategy: 'btl', sector: sector() });
    expect(r.deal).toBeNull();
    expect(r.waitingOn).toContain('monthly rent');
    expect(r.priceVsSold.status).toBe('green'); // £170k <= £180k typical
  });

  it('BTL: with rent + sector, scores a real deal with a REAL price component', () => {
    const r = scoreListing(rmFlat(), { strategy: 'btl', rent: 900, sector: sector() });
    expect(r.deal).not.toBeNull();
    expect(r.deal!.score).toBeGreaterThanOrEqual(0);
    expect(r.deal!.score).toBeLessThanOrEqual(10);
    const ev = r.deal!.components.find((c) => c.name.includes('sold'))!;
    expect(ev.status).toBe('green'); // price under typical ⇒ evidence green, not unknown
    expect(r.country).toBe('W92000004'); // taken from the sector, so Welsh LTT applies
  });

  it('BTL: a thin sector scores but leaves the price component unknown + says so', () => {
    const r = scoreListing(rmFlat(), { strategy: 'btl', rent: 900, sector: sector({ count: 3 }) });
    expect(r.deal).not.toBeNull();
    const ev = r.deal!.components.find((c) => c.name.includes('sold'))!;
    expect(ev.status).toBe('unknown'); // not scored blind
    expect(r.priceVsSold.status).toBe('not-enough-sales');
  });

  it('changing an assumption re-scores (feeds through to the figures)', () => {
    const a = scoreListing(rmFlat(), { strategy: 'btl', rent: 900, sector: sector() }).deal!;
    const b = scoreListing(rmFlat(), { strategy: 'btl', rent: 900, sector: sector(), assumptions: { deposit: '60' } }).deal!;
    // more deposit ⇒ more cash in ⇒ a different ROI on the same rent/price
    const roiA = (a.analysis as { roi: { value: number } }).roi.value;
    const roiB = (b.analysis as { roi: { value: number } }).roi.value;
    expect(roiA).not.toBe(roiB);
  });

  it('a cleared assumption falls back to the config default, never a silent 0', () => {
    const roi = (r: ReturnType<typeof scoreListing>) => (r.deal!.analysis as { roi: { value: number } }).roi.value;
    const def = scoreListing(rmFlat(), { strategy: 'btl', rent: 900, sector: sector() });
    const cleared = scoreListing(rmFlat(), { strategy: 'btl', rent: 900, sector: sector(), assumptions: { deposit: '' } });
    const zero = scoreListing(rmFlat(), { strategy: 'btl', rent: 900, sector: sector(), assumptions: { deposit: '0' } });
    expect(roi(cleared)).toBe(roi(def)); // '' ⇒ default 25% deposit, identical to no override
    expect(roi(cleared)).not.toBe(roi(zero)); // and NOT a fabricated 0% deposit / 100% LTV
  });

  it('HMO / Flip / BRRRR defer honestly, never invent inputs', () => {
    for (const strategy of ['hmo', 'flip', 'brrrr'] as const) {
      const r = scoreListing(rmFlat(), { strategy, rent: 900, sector: sector() });
      expect(r.deal, strategy).toBeNull();
      expect(r.note.length, strategy).toBeGreaterThan(10);
      expect(r.priceVsSold.status).toBe('green'); // still shows the price read
    }
  });
});
