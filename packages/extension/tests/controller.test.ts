// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { __mountForTest } from '../entrypoints/sidepanel/main.ts';
import { found, missing, unavailable, type NormalisedListing, type SectorFile } from '@gil-bricks/core';

const listing: NormalisedListing = {
  portal: 'rightmove', extractorVersion: 'rm-1.0.0', configVersion: 't', source: 'embedded',
  listingId: found('9'), url: found('https://www.rightmove.co.uk/properties/9'),
  postcode: found('SA1 2HG'), outcode: found('SA1'), address: found({ paon: '9', street: 'Earl Street', town: 'Swansea' }),
  askingPrice: found(150000), propertyType: found('Terraced'), tenure: found('FREEHOLD'),
  bedrooms: found(3), bathrooms: found(1), floorAreaSqm: found(80), floorAreaSqmRange: missing(),
  floorPlanImageUrls: missing(), newBuild: found(false), listingUpdate: missing(), firstVisibleDate: missing(),
  description: found('A terrace.'), isAuction: unavailable(),
};
const sector: SectorFile = { schemaVersion: 1, sector: 'SA1 2', country: 'E92000001', updatedAt: 'x', sales: [], stats: { count: 20, typicalPrice: 150000, typicalPpsqm: 1900, p10Price: 100000, p90Price: 200000 } } as SectorFile;

beforeEach(() => { document.body.innerHTML = '<main id="app"></main><div id="gb-live" aria-live="polite"></div>'; });
const scoreText = () => document.querySelector('.deal-score .ds-score strong')?.textContent ?? null;
const verdictText = () => document.querySelector('.deal-score .ds-verdict')?.textContent ?? null;

describe('E8.2 — a lever moves the DISPLAYED score, verdict and headline (live path)', () => {
  it('changing the mortgage-rate lever re-scores the panel in place', () => {
    __mountForTest(listing, { sector, strategy: 'btl', rent: '1000' });
    const before = scoreText();
    expect(before).toBeTruthy();
    const rate = document.getElementById('gb-l-rate') as HTMLInputElement;
    expect(rate).toBeTruthy();
    rate.value = '9';
    rate.dispatchEvent(new Event('input', { bubbles: true }));
    const after = scoreText();
    expect(after).toBeTruthy(); // panel still shows a real numeric score after the change
    expect(after).not.toBe(before); // the top score actually changed
    expect(Number(after)).toBeLessThan(Number(before)); // a higher rate is worse
  });

  it('changing a SELECT lever (buying as) NOW moves the displayed score too (E8.3)', () => {
    // higher-rate personal vs company differs materially (Section 24); with the
    // continuous in-tier score, the top number moves — not just the £ figure.
    __mountForTest(listing, { sector, strategy: 'btl', rent: '1000', settings: { buyingAs: 'higher' } });
    const beforeScore = scoreText();
    const beforeAfterTax = document.querySelector('.c-cashflow-sub')?.textContent ?? '';
    const sel = document.getElementById('gb-l-buyingAs') as HTMLSelectElement;
    expect(sel).toBeTruthy();
    sel.value = 'ltd';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(scoreText()).not.toBe(beforeScore); // the top score visibly moved
    expect(document.querySelector('.c-cashflow-sub')?.textContent ?? '').not.toBe(beforeAfterTax);
    const sig = document.querySelector('.change-signal')?.textContent ?? '';
    expect(sig).toMatch(/cashflow [+−]£/);
  });

  it('the change-signal reports the real movement, not 0', () => {
    __mountForTest(listing, { sector, strategy: 'btl', rent: '1000' });
    const rate = document.getElementById('gb-l-rate') as HTMLInputElement;
    rate.value = '9';
    rate.dispatchEvent(new Event('input', { bubbles: true }));
    const sig = document.querySelector('.change-signal')?.textContent ?? '';
    expect(sig).toMatch(/score \d/);
    expect(sig).not.toMatch(/score (\d\.\d) → \1\b/); // never "6.3 → 6.3"
  });

  it('a Flip lever (buying as) shows a PROFIT effect, never inert', () => {
    __mountForTest(listing, { sector, strategy: 'flip', listingUnknowns: { gdv: '200000', refurbCost: '20000' }, settings: { flipAs: 'personal', incomeBand: 'higher' } });
    const sel = document.getElementById('gb-l-flipAs') as HTMLSelectElement;
    expect(sel).toBeTruthy();
    sel.value = 'ltd';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const sig = document.querySelector('.change-signal')?.textContent ?? '';
    expect(sig).toMatch(/profit [+−]£/); // a real profit effect, not just "same verdict band"
  });

  it('typing into a field does NOT move the scroll position (E8.2 #3)', () => {
    __mountForTest(listing, { sector, strategy: 'btl', rent: '1000' });
    const scroller = (document.scrollingElement || document.documentElement) as HTMLElement;
    const rate = document.getElementById('gb-l-rate') as HTMLInputElement;
    rate.focus(); // user is typing in the field
    scroller.scrollTop = 240; // set AFTER focus so the setup focus doesn't trip the model
    // happy-dom has no layout, so MODEL the browser: when redraw() re-focuses the
    // just-rebuilt field, the browser scrolls it into view (dropping scrollTop).
    // redraw()'s capture-before / restore-after must undo that — this makes the
    // assertion actually bite (it fails if the restore line is removed).
    document.addEventListener('focusin', () => { scroller.scrollTop = 0; }, true);
    rate.value = '7';
    rate.dispatchEvent(new Event('input', { bubbles: true }));
    expect(scroller.scrollTop).toBe(240); // redraw restored it — no jump
    expect(document.activeElement?.id).toBe('gb-l-rate'); // focus retained
  });

  it('BRRRR funding lever shows a money-left-in effect, never inert (E8.2 review)', () => {
    __mountForTest(listing, { sector, strategy: 'brrrr', listingUnknowns: { arv: '200000', rent: '1100', refurbCost: '20000' } });
    const funding = document.getElementById('gb-l-funding') as HTMLSelectElement;
    expect(funding).toBeTruthy();
    funding.value = 'cash';
    funding.dispatchEvent(new Event('change', { bubbles: true }));
    const sig = document.querySelector('.change-signal')?.textContent ?? '';
    expect(sig).toMatch(/money left in [+−]£/);
  });

  it('measured rooms feed the HMO room-size component (E9.1)', () => {
    const hmoListing = { ...listing, propertyType: found('Terraced'), bedrooms: found(4) };
    // no measurements → honest assumption (component unknown)
    __mountForTest(hmoListing, { sector, strategy: 'hmo', listingUnknowns: { roomRent: '650', rooms: '4' } });
    const roomRow = () => [...document.querySelectorAll('.component')].map((r) => r.textContent ?? '').find((t) => /room/i.test(t) && /size|legal|minimum/i.test(t)) ?? '';
    expect(roomRow().toLowerCase()).toContain('check analyser');
    // with a measured undersized room recorded → the component reflects a failure
    __mountForTest(hmoListing, { sector, strategy: 'hmo', listingUnknowns: { roomRent: '650', rooms: '4' }, floorplan: { available: true, open: false, acceptedSqm: null, measuredRooms: [12, 5], imageUrl: 'x' } });
    expect(roomRow().toLowerCase()).toMatch(/red|below/);
    // ONE adequate room (fewer than the 4 assumed) must NOT flip it green — still the honest assumption (E9.1 review)
    __mountForTest(hmoListing, { sector, strategy: 'hmo', listingUnknowns: { roomRent: '650', rooms: '4' }, floorplan: { available: true, open: false, acceptedSqm: null, measuredRooms: [12], imageUrl: 'x' } });
    expect(roomRow().toLowerCase()).toContain('check analyser');
    // every assumed room measured and adequate → a genuine all-clear
    __mountForTest(hmoListing, { sector, strategy: 'hmo', listingUnknowns: { roomRent: '650', rooms: '4' }, floorplan: { available: true, open: false, acceptedSqm: null, measuredRooms: [12, 10, 8, 9], imageUrl: 'x' } });
    expect(roomRow().toLowerCase()).toMatch(/meet/);
    // REVIEWER SCENARIO: bedroom count NOT read → no `rooms` unknown at all, yet the
    // engine still scores the HMO on the config-default room count. Measuring ONE
    // adequate room must NOT flip it green — the all-clear is gated against the SAME
    // assumed count the deal is scored with, never a caller-side 0 (E9.1 review).
    const noBeds = { ...listing, propertyType: found('Terraced'), bedrooms: missing() };
    __mountForTest(noBeds, { sector, strategy: 'hmo', listingUnknowns: { roomRent: '650' }, floorplan: { available: true, open: false, acceptedSqm: null, measuredRooms: [12], imageUrl: 'x' } });
    expect(roomRow().toLowerCase()).toContain('check analyser');
  });

  it('the Seller Signals expander label tracks the open state (E8.2 review)', () => {
    __mountForTest(listing, { sector, strategy: 'btl', rent: '1000' });
    const box = document.querySelector('details.seller-signals') as HTMLDetailsElement;
    expect(box).toBeTruthy();
    const pill = box.querySelector('.ss-expander')!;
    expect(pill.textContent).toContain('More detail');
    box.open = true;
    box.dispatchEvent(new Event('toggle'));
    expect(pill.textContent).toContain('Hide detail'); // label tracked the toggle, no full rebuild
  });
});
