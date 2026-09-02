import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractListing, readSellerSignals, bandLabel, scoreListing,
  found, missing, unavailable, FALLBACK_CONFIG,
  type NormalisedListing, type Portal, type ListingUpdate,
} from './index';
import type { SectorFile } from '../data/types';

/** Seller Signals (E8): two separate evidence-backed reads, never a number, never in the score. */
const CORPUS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'listings');
const CFG = FALLBACK_CONFIG.signals;
const NOW = new Date('2026-09-02T00:00:00Z');

/** A minimal listing with the fields Seller Signals reads. */
function mk(opts: { portal?: Portal; description?: string; update?: ListingUpdate | null; firstVisible?: string | null; auction?: boolean | null } = {}): NormalisedListing {
  const portal = opts.portal ?? 'rightmove';
  return {
    portal, extractorVersion: 't', configVersion: 't', source: 'embedded',
    listingId: found('1'), url: found('https://x'), postcode: found('SA1 8AJ'), outcode: found('SA1'),
    address: found({ paon: '1', street: 'Kings Road', town: 'Swansea' }),
    askingPrice: found(200000), propertyType: found('Terraced'), tenure: found('FREEHOLD'),
    bedrooms: found(3), bathrooms: found(1), floorAreaSqm: missing(), floorAreaSqmRange: missing(),
    floorPlanImageUrls: missing(), newBuild: found(false),
    listingUpdate: opts.update ? found(opts.update) : missing<ListingUpdate>(),
    firstVisibleDate: opts.firstVisible ? found(opts.firstVisible) : missing<string>(),
    description: found(opts.description ?? 'A lovely home in a popular area.'),
    isAuction: opts.auction == null ? (portal === 'rightmove' ? unavailable<boolean>() : found(false)) : found(opts.auction),
  } as NormalisedListing;
}
const sector = (): SectorFile => ({ schemaVersion: 1, sector: 'SA1 8', country: 'W92000004', updatedAt: 'x', sales: [], stats: { count: 20, typicalPrice: 200000, typicalPpsqm: 2200, p10Price: 140000, p90Price: 260000 } }) as SectorFile;

describe('two SEPARATE reads, never merged', () => {
  it('flexibility and impairment are independent bands with their own evidence', () => {
    // reduced + probate ⇒ strong flexibility; subsidence ⇒ some impairment
    const s = readSellerSignals(mk({ update: { reason: 'reduced', date: '2026-07-15' }, description: 'A probate sale. Some historic subsidence was underpinned.' }), CFG, NOW);
    expect(s.flexibility.band).toBe('strong'); // reduction + probate language = 2 signals
    expect(s.impairment.band).toBe('some'); // subsidence
    // the two never collapse into one number
    expect(s).not.toHaveProperty('score');
    expect(s.flexibility.evidence.some((e) => /probate/i.test(e.phrase ?? ''))).toBe(true);
    expect(s.impairment.evidence.some((e) => /subsidence/i.test(e.phrase ?? ''))).toBe(true);
  });

  it('every match carries the phrase it matched (false positives are visible)', () => {
    const s = readSellerSignals(mk({ description: 'Motivated seller — must sell quickly.' }), CFG, NOW);
    const ev = s.flexibility.evidence.find((e) => /motivated/i.test(e.label));
    expect(ev?.phrase).toMatch(/motivated seller/i);
  });

  it('bandLabel is terse and never implies certainty (every band)', () => {
    for (const band of ['strong', 'some'] as const) {
      // "signs" — a hint, not a certainty; never "is flexible"/"is impaired"
      expect(bandLabel('flexibility', band).toLowerCase(), band).toContain('signs');
      expect(bandLabel('impairment', band).toLowerCase(), band).toContain('signs');
      expect(bandLabel('flexibility', band).toLowerCase()).not.toMatch(/is flexible|will|definitely/);
      expect(bandLabel('impairment', band).toLowerCase()).not.toMatch(/is impaired|will|definitely/);
    }
    expect(bandLabel('flexibility', 'none-seen').toLowerCase()).toContain('none seen');
    expect(bandLabel('impairment', 'none-seen').toLowerCase()).toContain('none seen');
    // stays to one short line
    for (const b of ['strong', 'some', 'none-seen'] as const) {
      expect(bandLabel('flexibility', b).length).toBeLessThanOrEqual(34);
      expect(bandLabel('impairment', b).length).toBeLessThanOrEqual(34);
    }
  });

  it('each language group counts once; two DISTINCT groups make it strong', () => {
    // two phrases from the SAME group ⇒ one signal ⇒ some
    const oneGroup = readSellerSignals(mk({ description: 'Must sell — quick sale wanted.' }), CFG, NOW);
    expect(oneGroup.flexibility.band).toBe('some');
    expect(oneGroup.flexibility.evidence.filter((e) => /motivated/i.test(e.label)).length).toBe(1);
    // two DIFFERENT groups (probate + downsizing) ⇒ two signals ⇒ strong (language alone)
    const twoGroups = readSellerSignals(mk({ description: 'A probate sale; the owner is downsizing.' }), CFG, NOW);
    expect(twoGroups.flexibility.band).toBe('strong');
  });

  it('does not fire on whole-word / polarity false positives (E8 review)', () => {
    // "structurally sound", "no damp issues", "owned outright with no mortgage",
    // "the latest" must NOT trip an impairment/probate warning
    const clean = readSellerSignals(mk({ description: 'Structurally sound with no damp issues, owned outright with no mortgage. The latest refurbishment is superb.' }), CFG, NOW);
    expect(clean.impairment.band).toBe('none-seen');
    expect(clean.flexibility.evidence.some((e) => /probate/i.test(e.label))).toBe(false);
    // but the genuine negative wording still fires (condition group = one signal)
    const bad = readSellerSignals(mk({ description: 'Some structural movement noted; rising damp in the rear.' }), CFG, NOW);
    expect(bad.impairment.band).toBe('some');
    expect(bad.impairment.evidence.some((e) => /structural|damp|subsidence/i.test(e.label))).toBe(true);
  });
});

describe('CHAIN-FREE is never a flexibility signal', () => {
  const base = { update: { reason: 'reduced', date: '2026-07-15' } as ListingUpdate };
  it('adding chain-free wording never raises the flexibility read', () => {
    const without = readSellerSignals(mk({ ...base, description: 'A great family home.' }), CFG, NOW);
    const withCf = readSellerSignals(mk({ ...base, description: 'A great family home. Offered chain free with no onward chain.' }), CFG, NOW);
    // identical flexibility band + evidence count — chain-free added nothing there
    expect(withCf.flexibility.band).toBe(without.flexibility.band);
    expect(withCf.flexibility.evidence.length).toBe(without.flexibility.evidence.length);
    // chain-free is surfaced, but only under "worth knowing", never in flexibility
    expect(withCf.worthKnowing.some((w) => /chain-free/i.test(w))).toBe(true);
    expect(withCf.flexibility.evidence.some((e) => /chain/i.test(e.label) || /chain/i.test(e.phrase ?? ''))).toBe(false);
  });

  it('chain-free alone leaves flexibility "none seen"', () => {
    const s = readSellerSignals(mk({ description: 'No onward chain. Ready to move.' }), CFG, NOW);
    expect(s.flexibility.band).toBe('none-seen');
    expect(s.worthKnowing.length).toBe(1);
  });
});

describe('Seller Signals NEVER move the Deal Score', () => {
  function rmFlat(): NormalisedListing {
    const url = 'https://www.rightmove.co.uk/properties/159999001';
    const html = readFileSync(join(CORPUS, 'rightmove', 'rightmove-leasehold-flat-added.html'), 'utf8');
    const w = new Window({ url, settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
    w.document.write(html);
    const r = extractListing('rightmove', w.document as unknown as Document, FALLBACK_CONFIG, url);
    if (!r.ok) throw new Error('fixture failed');
    return r.listing;
  }
  it('a description full of signal language scores exactly the same as a plain one', () => {
    const plain = { ...rmFlat(), description: found('A pleasant apartment.') };
    const loaded = { ...rmFlat(), description: found('PROBATE. Motivated seller must sell. Cash buyers only. Subsidence. For sale by auction. No onward chain.') };
    const a = scoreListing(plain, { strategy: 'btl', unknowns: { rent: '1200' }, sector: sector() });
    const b = scoreListing(loaded, { strategy: 'btl', unknowns: { rent: '1200' }, sector: sector() });
    expect(b.deal!.score).toBe(a.deal!.score);
    expect(b.deal!.rawScore).toBe(a.deal!.rawScore);
    expect(b.deal!.headline).toBe(a.deal!.headline);
    // and the signals themselves clearly differ (proving the description WAS read)
    expect(readSellerSignals(loaded, CFG, NOW).impairment.band).not.toBe(readSellerSignals(plain, CFG, NOW).impairment.band);
  });
});

describe('portal honesty (absence of evidence ≠ evidence of absence)', () => {
  it('Rightmove reduction reads with its date; no reduction reads as "none shown"', () => {
    const red = readSellerSignals(mk({ portal: 'rightmove', update: { reason: 'reduced', date: '2026-07-15' } }), CFG, NOW);
    expect(red.flexibility.evidence.some((e) => e.label === 'Reduced on 15/07/2026' && e.source === 'rightmove')).toBe(true);
    const none = readSellerSignals(mk({ portal: 'rightmove' }), CFG, NOW);
    expect(none.flexibility.notes.some((n) => /no reduction shown/i.test(n))).toBe(true);
  });
  it('Zoopla says reductions are rarely shown — never "there were none"', () => {
    const s = readSellerSignals(mk({ portal: 'zoopla', firstVisible: '2026-06-04' }), CFG, NOW);
    expect(s.flexibility.notes.some((n) => /rarely shown on zoopla/i.test(n))).toBe(true);
    expect(s.flexibility.notes.join(' ')).not.toMatch(/no reductions|there were none/i); // never claims certainty
  });
  it('time on market is plain, and honestly absent when the portal doesn’t give a date', () => {
    expect(readSellerSignals(mk({ portal: 'zoopla', firstVisible: '2026-06-16' }), CFG, NOW).timeOnMarket).toBe('First listed 78 days ago (zoopla).');
    expect(readSellerSignals(mk({ portal: 'rightmove' }), CFG, NOW).timeOnMarket).toMatch(/isn’t shown on this rightmove listing/);
  });
});

describe('impairment is a warning drawn from flags + wording', () => {
  it('Zoopla’s structured auction flag counts', () => {
    const s = readSellerSignals(mk({ portal: 'zoopla', auction: true }), CFG, NOW);
    expect(s.impairment.band).toBe('some');
    expect(s.impairment.evidence[0].label).toMatch(/auction/i);
  });
  it('two distinct impairment signals ⇒ strong', () => {
    const s = readSellerSignals(mk({ description: 'Cash buyers only. Property has subsidence.' }), CFG, NOW);
    expect(s.impairment.band).toBe('strong');
  });
});

describe('the fixture corpus produces honest reads', () => {
  const expected: Record<string, { portal: Portal; flex: string; imp: string }> = {
    'rightmove-leasehold-flat-added.html': { portal: 'rightmove', flex: 'some', imp: 'none-seen' },
    'rightmove-reduced-detached-freehold.html': { portal: 'rightmove', flex: 'some', imp: 'none-seen' },
    'rightmove-reduced-terrace-leasehold.html': { portal: 'rightmove', flex: 'some', imp: 'some' },
    'zoopla-auction-terrace-floorplan.html': { portal: 'zoopla', flex: 'none-seen', imp: 'some' },
    'zoopla-newbuild-semi-floorplan.html': { portal: 'zoopla', flex: 'none-seen', imp: 'none-seen' },
    'zoopla-newhome-6bed-hmo-candidate.html': { portal: 'zoopla', flex: 'none-seen', imp: 'none-seen' },
  };
  const url = (p: Portal) => (p === 'rightmove' ? 'https://www.rightmove.co.uk/properties/100000001' : 'https://www.zoopla.co.uk/for-sale/details/100000001');
  for (const [file, want] of Object.entries(expected)) {
    it(`${file} → flexibility ${want.flex}, impairment ${want.imp}`, () => {
      const html = readFileSync(join(CORPUS, want.portal, file), 'utf8');
      const w = new Window({ url: url(want.portal), settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
      w.document.write(html);
      const r = extractListing(want.portal, w.document as unknown as Document, FALLBACK_CONFIG, url(want.portal));
      expect(r.ok, file).toBe(true);
      if (!r.ok) return;
      const s = readSellerSignals(r.listing, CFG, NOW);
      expect(s.flexibility.band, `${file} flex`).toBe(want.flex);
      expect(s.impairment.band, `${file} imp`).toBe(want.imp);
    });
  }
});
