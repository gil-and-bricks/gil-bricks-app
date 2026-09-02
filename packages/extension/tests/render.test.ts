// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { scoreListing, smartDefaults, found, missing, unavailable, criteriaFields, type NormalisedListing, type SectorFile, type StrategyId } from '@gil-bricks/core';
import { renderEmpty, renderFailure, renderTriage, renderSettings, type PanelView } from '../entrypoints/sidepanel/main.ts';

const listing: NormalisedListing = {
  portal: 'rightmove', extractorVersion: 'rm-1.0.0', configVersion: 't', source: 'embedded',
  listingId: found('123'), url: found('https://www.rightmove.co.uk/properties/123'),
  postcode: found('SA1 8AJ'), outcode: found('SA1'),
  address: found({ paon: '31', street: 'Kings Road', town: 'Swansea' }),
  askingPrice: found(170000), propertyType: found('Apartment'), tenure: found('LEASEHOLD'),
  bedrooms: found(2), bathrooms: found(2), floorAreaSqm: missing(), floorAreaSqmRange: missing(),
  floorPlanImageUrls: missing(), newBuild: found(false), listingUpdate: missing(), firstVisibleDate: missing(),
  description: found('x'), isAuction: missing(),
};
const sector = (over = {}): SectorFile => ({
  schemaVersion: 1, sector: 'SA1 8', country: 'W92000004', updatedAt: '2026-08-31T00:00:00Z', sales: [],
  stats: { count: 20, typicalPrice: 180000, typicalPpsqm: 2200, p10Price: 120000, p90Price: 230000, ...over },
}) as SectorFile;

function view(over: Partial<PanelView> = {}): PanelView {
  const strategy = (over.strategy ?? 'btl') as StrategyId;
  const unknowns = over.unknowns ?? {};
  const result = over.result ?? scoreListing(listing, { strategy, unknowns, sector: sector() });
  return {
    screen: 'triage', listing, strategy, result, unknowns,
    suggestions: smartDefaults(strategy, listing, sector(), null),
    settings: {}, criteria: {}, floorAreaSqm: null, floorAreaSource: 'none', floorAreaRange: null,
    manualAreaInput: '', usingSuggested: false, ...over,
  };
}

beforeEach(() => { document.body.innerHTML = '<main id="app"></main>'; });
const txt = () => document.getElementById('app')!.textContent ?? '';

describe('triage panel (E7)', () => {
  it('empty + failure states', () => {
    renderEmpty(); expect(txt()).toContain('Open a Rightmove or Zoopla listing');
    document.body.innerHTML = '<main id="app"></main>';
    renderFailure('the site may have changed'); expect(txt()).toContain('the site may have changed');
  });

  it('BTL with rent: property line, switch, real score, ONE unknown, settings link + Send', () => {
    renderTriage(view({ unknowns: { rent: '1200' } }));
    expect(txt()).toContain('Kings Road');
    expect(document.querySelectorAll('.strat-btn').length).toBe(4);
    expect(document.querySelector('.deal-score .ds-score strong')).toBeTruthy();
    // exactly ONE triage UNKNOWN (rent) — everything else is in Settings
    expect(document.querySelectorAll('[id^="gb-u-"]').length).toBe(1);
    expect(document.getElementById('gb-u-rent')).toBeTruthy();
    expect(document.querySelector('.settings-link')?.textContent).toContain('Using your settings');
    expect(document.querySelector('.send-btn')?.textContent).toContain('Send to my analyser');
  });

  it.each(['flip', 'brrrr', 'hmo'] as const)('%s scores in-panel (no "needs analyser" dead end)', (strategy) => {
    const unknowns = { rent: '1200', gdv: '260000', arv: '260000', refurbCost: '30000', rooms: '2', roomRent: '650' };
    renderTriage(view({ strategy, unknowns }));
    expect(document.querySelector('.deal-score .ds-score strong'), strategy).toBeTruthy();
    expect(txt().toLowerCase()).not.toContain('needs analyser');
  });

  it('HMO room-size shows "check analyser", never a blank fail', () => {
    renderTriage(view({ strategy: 'hmo', unknowns: { roomRent: '650', rooms: '2' } }));
    const rows = [...document.querySelectorAll('.component')].map((r) => r.textContent ?? '');
    expect(rows.some((r) => /room/i.test(r) && /check analyser/i.test(r))).toBe(true);
  });

  it('outside-evidence shows the honest "no nearby sales at this level" note', () => {
    const big = { ...listing, askingPrice: found(1_500_000) };
    const result = scoreListing(big, { strategy: 'btl', unknowns: { rent: '3000' }, sector: sector(), evidenceOutsideFactor: 2 });
    renderTriage(view({ listing: big, result, unknowns: { rent: '3000' } }));
    expect(txt()).toContain('No nearby sales at this level');
  });

  it('a floor-area RANGE is shown with the midpoint convention (bug 5a)', () => {
    const ranged = { ...listing, floorAreaSqm: found(424), floorAreaSqmRange: found({ minSqm: 392, maxSqm: 456 }) };
    renderTriage(view({ listing: ranged, floorAreaSqm: 424, floorAreaSource: 'listing', floorAreaRange: { minSqm: 392, maxSqm: 456 }, unknowns: { rent: '1200' } }));
    expect(txt()).toContain('392–456 m²');
    expect(txt()).toContain('424 m² midpoint');
  });

  it('EW reject shows the message, no score', () => {
    renderTriage(view({ unknowns: { rent: '1200' }, ewReject: 'Sorry — this covers England & Wales only' }));
    expect(txt()).toContain('England & Wales only');
    expect(document.querySelector('.deal-score')).toBeNull();
  });

  it('the honest out-of-market line shows only when flagged (E7.1)', () => {
    const big = { ...listing, askingPrice: found(1_500_000) };
    const result = scoreListing(big, { strategy: 'btl', unknowns: {}, sector: sector(), evidenceOutsideFactor: 2 });
    renderTriage(view({ listing: big, result, unknowns: {}, outOfMarket: true }));
    expect(txt()).toContain('priced well above local investment stock');
    expect(document.querySelector('.out-of-market')).toBeTruthy();
    // a normal listing never shows it
    document.body.innerHTML = '<main id="app"></main>';
    renderTriage(view({ unknowns: { rent: '1200' } }));
    expect(txt()).not.toContain('priced well above local investment stock');
  });

  it('a remembered rent that did not fit is cleared, with a plain reason (E7.1)', () => {
    renderTriage(view({ unknowns: {}, rentCleared: true }));
    expect(txt()).toContain('doesn’t fit this property');
    expect(document.querySelector('.cleared-note')).toBeTruthy();
    // once a rent is entered, the note is gone
    document.body.innerHTML = '<main id="app"></main>';
    renderTriage(view({ unknowns: { rent: '900' }, rentCleared: true }));
    expect(txt()).not.toContain('doesn’t fit this property');
  });

  it('Flip end-value suggestion is suppressed with a reason when outside the evidence (E7.1)', () => {
    const big = { ...listing, askingPrice: found(1_500_000) };
    const result = scoreListing(big, { strategy: 'flip', unknowns: {}, sector: sector(), evidenceOutsideFactor: 2 });
    const suggestions = smartDefaults('flip', big, sector(), null, { evidenceOutsideFactor: 2, minSectorSales: 5 });
    renderTriage(view({ strategy: 'flip', listing: big, result, unknowns: {}, suggestions }));
    expect(txt().toLowerCase()).toContain('no nearby sales at this level');
    // and the end-value field is left empty (no fabricated suggestion applied)
    expect((document.getElementById('gb-u-gdv') as HTMLInputElement).value).toBe('');
  });
});

describe('settings screen (E7)', () => {
  it('shows the personal-criteria fields and a back link', () => {
    renderSettings(view({ screen: 'settings' }));
    expect(txt()).toContain('What does a good deal look like to you?');
    for (const f of criteriaFields()) expect(document.getElementById(`gb-c-${f.key}`), f.key).toBeTruthy();
    expect(document.querySelector('.settings-link')?.textContent).toContain('Back to the listing');
    // rent (a triage unknown) must NOT appear in settings
    expect(document.getElementById('gb-s-rent')).toBeNull();
  });
});
