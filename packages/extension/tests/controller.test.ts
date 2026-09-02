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

  it('changing a SELECT lever (buying as) has a VISIBLE effect (figures + change-signal)', () => {
    // higher-rate personal vs company differs materially (Section 24) in cashflow; the
    // banded 0-10 score may hold, so the visible proof is the change-signal figure.
    __mountForTest(listing, { sector, strategy: 'btl', rent: '1000', settings: { buyingAs: 'higher' } });
    const beforeAfterTax = document.querySelector('.c-cashflow-sub')?.textContent ?? '';
    const sel = document.getElementById('gb-l-buyingAs') as HTMLSelectElement;
    expect(sel).toBeTruthy();
    sel.value = 'ltd';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // buying-as is a TAX lever: the after-tax cashflow figure moves, and the
    // change-signal names a real effect (never inert), even if the banded score holds
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
