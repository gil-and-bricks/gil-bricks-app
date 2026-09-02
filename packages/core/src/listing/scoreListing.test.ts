import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractListing, floorAreaFromSector, priceVsSector, scoreListing, smartDefaults, FALLBACK_CONFIG } from './index';
import type { SectorFile } from '../data/types';

/** Honest all-strategy scoring + personal criteria (E7). */

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
  it('bands the value; honest gaps for thin / no-data / outside-evidence', () => {
    expect(priceVsSector(150000, sector(), 5).status).toBe('green');
    expect(priceVsSector(200000, sector(), 5).status).toBe('amber');
    expect(priceVsSector(250000, sector(), 5).status).toBe('red');
    expect(priceVsSector(150000, sector({ count: 3 }), 5).status).toBe('not-enough-sales');
    expect(priceVsSector(150000, null, 5).status).toBe('no-data');
    // £1.5m vs a £230k p90 (×2 = £460k) ⇒ outside the evidence, not judged (bug 5b)
    expect(priceVsSector(1_500_000, sector(), 5, null, 2).status).toBe('outside-evidence');
  });
});

describe('floorAreaFromSector (EPC by address)', () => {
  const mk = (paon: string, saon: string, area: number) => ({ id: paon + saon, date: '2026-01-01', price: 1, paon, saon, street: 'X', town: 'Y', postcode: 'SA1 8AJ', type: 'F', tenure: 'L', newBuild: false, lat: 0, lng: 0, floorAreaSqm: area, ppsqm: 1 });
  it('returns the EPC area for a matching address; null otherwise', () => {
    const sales = [mk('31', '', 68)] as unknown as SectorFile['sales'];
    expect(floorAreaFromSector(sector({}, sales), { paon: '31', street: 'Kings Road' })).toBe(68);
    expect(floorAreaFromSector(sector({}, sales), { paon: '99' })).toBeNull();
  });
  it('never borrows a different unit at the same paon (saon presence must agree)', () => {
    const flats = [mk('10', 'Flat 1', 40), mk('10', '', 120)] as unknown as SectorFile['sales'];
    expect(floorAreaFromSector(sector({}, flats), { paon: '10' })).toBe(120);
    expect(floorAreaFromSector(sector({}, [mk('10', '', 120)] as unknown as SectorFile['sales']), { paon: '10', saon: 'Flat 2' })).toBeNull();
  });
});

describe('scoreListing scores ALL FOUR strategies', () => {
  const enough = { rent: '1200', gdv: '260000', arv: '260000', refurbCost: '30000', rooms: '2', roomRent: '650' };

  it('BTL waits on rent, still gives a real price read', () => {
    const r = scoreListing(rmFlat(), { strategy: 'btl', sector: sector() });
    expect(r.deal).toBeNull();
    expect(r.waitingOn).toContain('monthly rent');
    expect(r.priceVsSold.status).toBe('green');
  });

  it.each(['btl', 'flip', 'brrrr', 'hmo'] as const)('%s scores a real deal given its unknowns', (strategy) => {
    const r = scoreListing(rmFlat(), { strategy, unknowns: enough, sector: sector() });
    expect(r.deal, strategy).not.toBeNull();
    expect(r.deal!.score).toBeGreaterThanOrEqual(0);
    expect(r.deal!.score).toBeLessThanOrEqual(10);
    expect(r.note).toBe(''); // no "needs analyser" dead ends
  });

  it('HMO room-size can’t be checked from a listing — that component is unknown, not a fail', () => {
    const r = scoreListing(rmFlat(), { strategy: 'hmo', unknowns: enough, sector: sector() });
    const room = r.deal!.components.find((c) => /room/i.test(c.name) && /size|legal|minimum/i.test(c.name))!;
    expect(room.status).toBe('unknown');
  });

  it('BTL evidence is REAL (green) with sector, unknown on a thin sector', () => {
    const green = scoreListing(rmFlat(), { strategy: 'btl', unknowns: enough, sector: sector() });
    expect(green.deal!.components.find((c) => /sold/i.test(c.name))!.status).toBe('green');
    const thin = scoreListing(rmFlat(), { strategy: 'btl', unknowns: enough, sector: sector({ count: 3 }) });
    expect(thin.deal!.components.find((c) => /sold/i.test(c.name))!.status).toBe('unknown');
  });

  it('outside-evidence excludes the price component from scoring (bug 5b)', () => {
    // pretend the flat is £1.5m in this sector — price sits far outside the evidence
    const listing = { ...rmFlat(), askingPrice: { value: 1_500_000, status: 'found' as const } };
    const r = scoreListing(listing, { strategy: 'btl', unknowns: enough, sector: sector(), evidenceOutsideFactor: 2 });
    expect(r.priceVsSold.status).toBe('outside-evidence');
    expect(r.deal!.components.find((c) => /sold/i.test(c.name))!.status).toBe('unknown');
  });

  it('BRRRR with a blank custom LTV waits (never throws / never a silent 0%)', () => {
    const r = scoreListing(rmFlat(), { strategy: 'brrrr', unknowns: { arv: '260000', rent: '1200' }, sector: sector(), settings: { ltv: 'custom', ltvCustom: '' } });
    expect(r.deal).toBeNull();
    expect(r.waitingOn.join(' ')).toMatch(/loan-to-value/i);
  });

  it('HMO with 7+ rooms is refused as a large sui-generis HMO, not scored', () => {
    const r = scoreListing(rmFlat(), { strategy: 'hmo', unknowns: { roomRent: '650', rooms: '7' }, sector: sector() });
    expect(r.deal).toBeNull();
    expect(r.note.toLowerCase()).toContain('sui generis');
  });

  it('a cleared setting falls back to the config default, never a silent 0', () => {
    const roi = (r: ReturnType<typeof scoreListing>) => (r.deal!.analysis as { roi: { value: number } }).roi.value;
    const def = scoreListing(rmFlat(), { strategy: 'btl', unknowns: enough, sector: sector() });
    const cleared = scoreListing(rmFlat(), { strategy: 'btl', unknowns: enough, sector: sector(), settings: { deposit: '' } });
    const zero = scoreListing(rmFlat(), { strategy: 'btl', unknowns: enough, sector: sector(), settings: { deposit: '0' } });
    expect(roi(cleared)).toBe(roi(def));
    expect(roi(cleared)).not.toBe(roi(zero));
  });
});

describe('personal criteria change the verdict AND name the user’s bar', () => {
  const enough = { rent: '1200' };
  it('a tighter minimum-cashflow bar lowers the verdict and the headline says "you set"', () => {
    const def = scoreListing(rmFlat(), { strategy: 'btl', unknowns: enough, sector: sector() });
    const strict = scoreListing(rmFlat(), { strategy: 'btl', unknowns: enough, sector: sector(), criteria: { minCashflow: 2000 } });
    expect(strict.deal!.score).toBeLessThan(def.deal!.score);
    expect(strict.deal!.headline).toContain('you set as your minimum');
    expect(strict.deal!.headline).toContain('£2,000');
    expect(def.deal!.headline).not.toContain('you set');
  });

  it('deposit AND rate criteria feed through to the figures', () => {
    const a = scoreListing(rmFlat(), { strategy: 'btl', unknowns: enough, sector: sector() }).deal!;
    const dep = scoreListing(rmFlat(), { strategy: 'btl', unknowns: enough, sector: sector(), criteria: { depositPct: 60 } }).deal!;
    const rate = scoreListing(rmFlat(), { strategy: 'btl', unknowns: enough, sector: sector(), criteria: { ratePct: 9 } }).deal!;
    const roi = (x: typeof a) => (x.analysis as { roi: { value: number } }).roi.value;
    expect(roi(a)).not.toBe(roi(dep));
    expect(roi(a)).not.toBe(roi(rate)); // a higher rate lowers the return
  });

  it('a minimum-ICR bar names the user’s figure when ICR is the binding gate', () => {
    const r = scoreListing(rmFlat(), { strategy: 'btl', unknowns: { rent: '400' }, sector: sector(), criteria: { minIcr: 2 } });
    expect(r.deal!.headline).toContain('you set as your minimum');
    expect(r.deal!.headline).toContain('2.00×');
  });

  it('a Flip minimum-PROFIT bar names the user’s figure when profit is the binding gate', () => {
    // green ROI + in-evidence end value, but under a high £150k profit bar ⇒ profit binds
    const bigSector = sector({ typicalPrice: 300000, p90Price: 400000, p10Price: 200000 });
    const r = scoreListing(rmFlat(), { strategy: 'flip', unknowns: { gdv: '280000', refurbCost: '20000' }, sector: bigSector, criteria: { minProfit: 150000 } });
    expect(r.deal!.bindingConstraint?.metric.toLowerCase()).toContain('profit');
    expect(r.deal!.headline).toContain('you set as your minimum');
  });

  it('a general min-ROI does NOT falsely claim Flip’s config ROI as "you set"', () => {
    // minRoi is a BTL/HMO bar; Flip's greenRoi must not be attributed to the user
    const r = scoreListing(rmFlat(), { strategy: 'flip', unknowns: { gdv: '190000', refurbCost: '20000' }, sector: sector(), criteria: { minRoi: 15 } });
    expect(r.deal!.headline).not.toContain('you set');
  });
});

describe('smartDefaults suggests, never asserts', () => {
  it('HMO rooms = bedrooms; Flip/BRRRR end value from sector', () => {
    expect(smartDefaults('hmo', rmFlat(), sector(), null).rooms).toEqual({ value: '2', label: 'suggested = bedrooms' });
    const fv = smartDefaults('flip', rmFlat(), sector(), 90).gdv;
    expect(fv.value).toBe(String(2200 * 90));
    expect(fv.label).toMatch(/£2,200\/m²/);
    // too few sales ⇒ no suggestion + reason
    expect(smartDefaults('flip', rmFlat(), sector({ count: 2 }), 90).gdv).toEqual({ value: null, label: 'no suggestion — too few nearby sales' });
  });
});
