import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractListing, scoreListing, smartDefaults, found, missing, unavailable, FALLBACK_CONFIG, type NormalisedListing } from './index';
import type { SectorFile } from '../data/types';

/** E8.1 live-testing fixes: sanity guard, settings leak, company SDLT, EPC address, suggestion parity. */
const CORPUS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'listings');
const listing = (price: number, over: Partial<NormalisedListing> = {}): NormalisedListing => ({
  portal: 'rightmove', extractorVersion: 't', configVersion: 't', source: 'embedded',
  listingId: found('e1'), url: found('x'), postcode: found('SA1 2HG'), outcode: found('SA1'),
  address: found({ paon: '9', street: 'Earl Street' }), askingPrice: found(price), propertyType: found('Terraced'),
  tenure: found('FREEHOLD'), bedrooms: found(2), bathrooms: found(1), floorAreaSqm: found(70), floorAreaSqmRange: missing(),
  floorPlanImageUrls: missing(), newBuild: found(false), listingUpdate: missing(), firstVisibleDate: missing(),
  description: found('A terrace.'), isAuction: unavailable(), ...over,
});
const sector = (over: Partial<SectorFile['stats']> = {}): SectorFile => ({ schemaVersion: 1, sector: 'SA1 2', country: 'W92000004', updatedAt: 'x', sales: [], stats: { count: 20, typicalPrice: 90000, typicalPpsqm: 1300, p10Price: 60000, p90Price: 130000, ...over } }) as SectorFile;

describe('sanity guard — impossible figures never display (item 1)', () => {
  it('refuses the £461,600 Earl Street case (stale refurb) and names the culprit', () => {
    const r = scoreListing(listing(72000), { strategy: 'brrrr', unknowns: { arv: '20000', rent: '650', refurbCost: '395000' }, sector: null });
    expect(r.deal).toBeNull();
    expect(r.note.toLowerCase()).toContain('refurb');
    expect(r.note).toContain('£72,000');
  });
  it('still scores a legitimate heavy-refurb flip (refurb > price is allowed)', () => {
    const r = scoreListing(listing(50000), { strategy: 'flip', unknowns: { gdv: '250000', refurbCost: '120000' }, sector: null });
    expect(r.deal, r.note).not.toBeNull();
  });
  it('refuses an impossible end value', () => {
    const r = scoreListing(listing(72000), { strategy: 'flip', unknowns: { gdv: '2000000', refurbCost: '5000' }, sector: null });
    expect(r.deal).toBeNull();
    expect(r.note.toLowerCase()).toContain('end value');
  });
});

describe('settings leak — a per-deal key via global settings never bleeds in (item 1)', () => {
  it('a refurbCost arriving ONLY through settings is ignored', () => {
    const clean = scoreListing(listing(72000), { strategy: 'brrrr', unknowns: { arv: '110000', rent: '650' }, sector: null });
    const leaked = scoreListing(listing(72000), { strategy: 'brrrr', unknowns: { arv: '110000', rent: '650' }, settings: { refurbCost: '40000' }, sector: null });
    expect(leaked.deal!.analysis).toEqual(clean.deal!.analysis); // settings.refurbCost had NO effect
  });
});

describe('company purchase forces additional-rate SDLT (item 3)', () => {
  it.each(['btl', 'brrrr', 'hmo'] as const)('%s: buyingAs=ltd pays more SDLT than "only property"', (strategy) => {
    const unknowns = { rent: '900', arv: '160000', refurbCost: '0', roomRent: '500', rooms: '4' };
    const only = scoreListing(listing(150000), { strategy, unknowns, settings: { buyingAs: 'basic', taxBasis: 'standard' } });
    const ltd = scoreListing(listing(150000), { strategy, unknowns, settings: { buyingAs: 'ltd', taxBasis: 'standard' } });
    const sdlt = (r: typeof only) => (r.deal!.analysis as { stampDuty?: { value: { tax: number } }; stampDutyTax?: number }).stampDuty?.value.tax ?? (r.deal!.analysis as { stampDutyTax: number }).stampDutyTax;
    expect(sdlt(ltd)).toBeGreaterThan(sdlt(only));
  });
});

describe('floor-plan feeds HMO room-size when confident (E9 item 3)', () => {
  const roomStatus = (r: ReturnType<typeof scoreListing>) => r.deal!.components.find((c) => /room/i.test(c.name) && /size|legal|minimum/i.test(c.name))!.status;
  const u = { roomRent: '600', rooms: '4' };
  const roomWhy = (r: ReturnType<typeof scoreListing>) => r.deal!.components.find((c) => /room/i.test(c.name) && /size|legal|minimum/i.test(c.name))!.why;
  it('no measurements ⇒ HONEST assumption from bedroom count, never a legality claim (E9.1)', () => {
    const r = scoreListing(listing(200000), { strategy: 'hmo', unknowns: u, sector: null });
    expect(roomStatus(r)).toBe('unknown');
    expect(roomWhy(r)).toMatch(/assumed .* lettable rooms/i);
    expect(roomWhy(r)).toMatch(/measure them before you commit/i);
    expect(roomWhy(r)).not.toMatch(/all rooms meet|meets the .* minimum/i); // never claims compliance
  });
  it('all rooms measured & clear ⇒ green; any measured failure ⇒ red; partial all-pass ⇒ stays the assumption (E9.1 review)', () => {
    // green ONLY with full coverage — every assumed lettable room measured and clear
    expect(roomStatus(scoreListing(listing(200000), { strategy: 'hmo', unknowns: u, sector: null, roomSizeFailures: 0, roomsMeasured: 4 }))).toBe('green');
    // a measured undersized room is ALWAYS authoritative, however many are unmeasured
    expect(roomStatus(scoreListing(listing(200000), { strategy: 'hmo', unknowns: u, sector: null, roomSizeFailures: 2, roomsMeasured: 2 }))).toBe('red');
    // a partial all-pass (fewer measured than the 4 assumed) must NOT go green — no false all-clear
    expect(roomStatus(scoreListing(listing(200000), { strategy: 'hmo', unknowns: u, sector: null, roomSizeFailures: 0, roomsMeasured: 2 }))).toBe('unknown');
  });
});

describe('sector-load reason is distinguished (item 2)', () => {
  it('not-found vs load-failed produce different statuses', () => {
    const notFound = scoreListing(listing(150000), { strategy: 'btl', unknowns: { rent: '900' }, sector: null, sectorLoad: 'not-found' });
    const failed = scoreListing(listing(150000), { strategy: 'btl', unknowns: { rent: '900' }, sector: null, sectorLoad: 'load-failed' });
    expect(notFound.priceVsSold.status).toBe('no-area-data');
    expect(failed.priceVsSold.status).toBe('load-failed');
  });
});

describe('BRRRR gets the same end-value suggestion as Flip (item 5)', () => {
  it('both suggest from the same sector evidence', () => {
    const flip = smartDefaults('flip', listing(120000), sector(), 90, { evidenceOutsideFactor: 2, minSectorSales: 5 }).gdv;
    const brrrr = smartDefaults('brrrr', listing(120000), sector(), 90, { evidenceOutsideFactor: 2, minSectorSales: 5 }).arv;
    expect(brrrr.value).toBe(flip.value);
    expect(brrrr.value).not.toBeNull();
    // and the same "too few nearby sales" honesty
    expect(smartDefaults('brrrr', listing(120000), sector({ count: 2 }), 90).arv).toEqual({ value: null, label: 'no suggestion — too few nearby sales' });
  });
});

describe('the front levers actually change the answer (E8.1 review)', () => {
  it('BRRRR management (self vs agent) moves before-tax cashflow', () => {
    const base = { strategy: 'brrrr' as const, unknowns: { arv: '200000', rent: '1100', refurbCost: '20000' }, sector: null };
    const agent = scoreListing(listing(120000), { ...base, settings: { mgmt: 'agent' } });
    const self = scoreListing(listing(120000), { ...base, settings: { mgmt: 'self' } });
    const cf = (r: typeof agent) => (r.deal!.analysis as { cashflowBeforeTax: { value: number } }).cashflowBeforeTax.value;
    expect(cf(self)).toBeGreaterThan(cf(agent)); // no agent fee ⇒ higher cashflow
  });
  it('Flip flipAs (personally vs company) changes the tax / profit-after-tax', () => {
    const base = { strategy: 'flip' as const, unknowns: { gdv: '260000', refurbCost: '20000' }, sector: null };
    const personal = scoreListing(listing(150000), { ...base, settings: { flipAs: 'personal', incomeBand: 'higher' } });
    const ltd = scoreListing(listing(150000), { ...base, settings: { flipAs: 'ltd' } });
    const pat = (r: typeof personal) => (r.deal!.analysis as unknown as { profitAfterTax: number }).profitAfterTax;
    expect(pat(ltd)).not.toBe(pat(personal));
  });
  it('refurb entered on BTL and HMO feeds the score (input path restored)', () => {
    for (const strategy of ['btl', 'hmo'] as const) {
      const u = { rent: '1200', roomRent: '600', rooms: '4' };
      const none = scoreListing(listing(150000), { strategy, unknowns: { ...u, refurbCost: '0' }, sector: null });
      const heavy = scoreListing(listing(150000), { strategy, unknowns: { ...u, refurbCost: '40000' }, sector: null });
      const cash = (r: typeof none) => (r.deal!.analysis as { cashIn: { value: number } }).cashIn.value;
      expect(cash(heavy), strategy).toBeGreaterThan(cash(none) + 39000);
    }
  });
});

describe('cash-needed total equals the engine cash-in, incl. flip contingency (review #6)', () => {
  it('flip costs-card total matches cashInvested', () => {
    const r = scoreListing(listing(120000), { strategy: 'flip', unknowns: { gdv: '200000', refurbCost: '30000' }, sector: null });
    const cashInvested = (r.deal!.analysis as { cashInvested: { value: number } }).cashInvested.value;
    expect(r.cashNeeded!.total).toBe(Math.round(cashInvested));
    expect(r.cashNeeded!.lines.some((l) => /contingency/i.test(l.label))).toBe(true);
  });
});

describe('no component reports a judgement its inputs cannot support (item 6)', () => {
  const evStatus = (r: ReturnType<typeof scoreListing>) => r.deal!.components.find((c) => /sold|price|end value/i.test(c.name))!.status;
  it('the price/end-value component is UNKNOWN when there is no sold evidence', () => {
    // no sector loaded ⇒ the evidence component must not colour green/amber/red
    expect(evStatus(scoreListing(listing(150000), { strategy: 'btl', unknowns: { rent: '900' }, sector: null, sectorLoad: 'not-found' }))).toBe('unknown');
    // thin sector ⇒ unknown, not a judgement
    expect(evStatus(scoreListing(listing(150000), { strategy: 'btl', unknowns: { rent: '900' }, sector: sector({ count: 2 }) }))).toBe('unknown');
    // outside the evidence ⇒ unknown, not a red fail
    expect(evStatus(scoreListing(listing(150000), { strategy: 'flip', unknowns: { gdv: '900000', refurbCost: '10000' }, sector: sector({ p90Price: 130000 }), evidenceOutsideFactor: 2 }))).toBe('unknown');
  });
  it('a real judgement appears only WITH enough in-evidence sales', () => {
    const r = scoreListing(listing(90000), { strategy: 'btl', unknowns: { rent: '900' }, sector: sector({ count: 20, typicalPrice: 95000, p90Price: 130000 }) });
    expect(['green', 'amber', 'red']).toContain(evStatus(r));
  });
});

describe('Rightmove address parses a house number so EPC can match (item 11)', () => {
  it('extracts paon from a numbered displayAddress and drops the postcode from town', () => {
    const url = 'https://www.rightmove.co.uk/properties/88376352';
    const html = readFileSync(join(CORPUS, 'rightmove', 'rightmove-reduced-detached-freehold.html'), 'utf8');
    const w = new Window({ url, settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
    w.document.write(html);
    const r = extractListing('rightmove', w.document as unknown as Document, FALLBACK_CONFIG, url);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.address.value?.paon).toBe('6');
    expect(r.listing.address.value?.street).toBe('The Dell');
    expect(r.listing.address.value?.town).not.toMatch(/^SA\d/i); // not a postcode
  });
});
