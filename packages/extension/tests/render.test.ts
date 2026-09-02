// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { scoreListing, smartDefaults, readSellerSignals, found, missing, unavailable, criteriaFields, FALLBACK_CONFIG, type NormalisedListing, type SectorFile, type StrategyId } from '@gil-bricks/core';
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
    // rent (the required unknown) + an optional refurb budget — everything else is in Settings/levers
    expect(document.getElementById('gb-u-rent')).toBeTruthy();
    expect(document.getElementById('gb-u-refurbCost')).toBeTruthy();
    expect(document.querySelectorAll('[id^="gb-u-"]').length).toBe(2);
    expect(document.querySelector('.settings-link')?.textContent).toContain('settings');
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

describe('E8.1 — levers, costs, auction, tax, money formatting', () => {
  it('each strategy shows only the levers that truly change ITS answer (no inert levers)', () => {
    // BRRRR: rate + funding + buyingAs + mgmt (BRRRR has no deposit% — funding sets its cash)
    renderTriage(view({ strategy: 'brrrr', unknowns: { arv: '180000', rent: '1000', refurbCost: '20000' } }));
    expect([...document.querySelectorAll('.lever [id^="gb-l-"]')].map((n) => n.id.replace('gb-l-', '')).sort()).toEqual(['buyingAs', 'funding', 'mgmt', 'rate']);
    // BTL: deposit + rate + buyingAs + mgmt (no funding — always mortgage)
    document.body.innerHTML = '<main id="app"></main>';
    renderTriage(view({ strategy: 'btl', unknowns: { rent: '1000' } }));
    expect([...document.querySelectorAll('.lever [id^="gb-l-"]')].map((n) => n.id.replace('gb-l-', '')).sort()).toEqual(['buyingAs', 'deposit', 'mgmt', 'rate']);
    // Flip: funding + flipAs (its real "buying as" key — the lever must not be inert)
    document.body.innerHTML = '<main id="app"></main>';
    renderTriage(view({ strategy: 'flip', unknowns: { gdv: '200000', refurbCost: '20000' } }));
    expect(document.getElementById('gb-l-flipAs')).toBeTruthy();
    expect(document.getElementById('gb-l-buyingAs')).toBeNull();
  });
  it('management is a lever on every rental strategy but not Flip', () => {
    renderTriage(view({ strategy: 'btl', unknowns: { rent: '1000' } }));
    expect(document.getElementById('gb-l-mgmt')).toBeTruthy();
    document.body.innerHTML = '<main id="app"></main>';
    renderTriage(view({ strategy: 'flip', unknowns: { gdv: '200000', refurbCost: '20000' } }));
    expect(document.getElementById('gb-l-mgmt')).toBeNull();
    expect(document.getElementById('gb-l-funding')).toBeTruthy();
  });
  it('the change-signal line shows the plain effect when set', () => {
    renderTriage(view({ unknowns: { rent: '1000' }, lastChange: 'Deposit 25% → 35%: cashflow +£118/mo, score 6.3 → 7.4' }));
    const sig = document.querySelector('.change-signal');
    expect(sig?.textContent).toContain('Deposit 25% → 35%');
    expect(sig?.textContent).toContain('score 6.3 → 7.4');
  });
  it('"What you need to put in" costs card renders with a total, above the unknowns', () => {
    renderTriage(view({ strategy: 'brrrr', unknowns: { arv: '180000', rent: '1000', refurbCost: '20000' } }));
    const costs = document.querySelector('.costs-card')!;
    expect(costs).toBeTruthy();
    expect(costs.textContent).toContain('What you need to put in');
    expect(costs.textContent).toContain('Total cash needed');
    // costs card is AFTER components and BEFORE the unknown inputs
    const comps = document.querySelector('.components')!;
    const firstUnknown = document.getElementById('gb-u-arv')!;
    expect(comps.compareDocumentPosition(costs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(costs.compareDocumentPosition(firstUnknown) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('an auction listing shows a prominent card ABOVE the components (item 7)', () => {
    const auc = { ...listing, isAuction: found(true) };
    const result = scoreListing(auc, { strategy: 'btl', unknowns: { rent: '900' }, sector: sector(), isAuction: true });
    renderTriage(view({ listing: auc, result, unknowns: { rent: '900' }, isAuction: true }));
    const card = document.querySelector('.auction-card')!;
    expect(card).toBeTruthy();
    expect(card.textContent).toMatch(/legal pack/i);
    expect(card.textContent).toMatch(/guide price/i);
    const comps = document.querySelector('.components')!;
    expect(card.compareDocumentPosition(comps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // card before components
    // a normal listing has no auction card
    document.body.innerHTML = '<main id="app"></main>';
    renderTriage(view({ unknowns: { rent: '900' } }));
    expect(document.querySelector('.auction-card')).toBeNull();
  });
  it('cashflow leads on BEFORE-tax with after-tax beneath (item 4)', () => {
    renderTriage(view({ strategy: 'btl', unknowns: { rent: '1200' } }));
    const lead = document.querySelector('.c-cashflow-lead');
    const sub = document.querySelector('.c-cashflow-sub');
    expect(lead?.textContent).toMatch(/before tax/i);
    expect(sub?.textContent).toMatch(/after tax/i);
  });
  it('money inputs format with £ and thousands separators (item 10)', () => {
    renderTriage(view({ unknowns: { rent: '1200' } }));
    expect((document.getElementById('gb-u-rent') as HTMLInputElement).value).toBe('1,200');
    expect(document.querySelector('.money-prefix')?.textContent).toBe('£');
  });
  it('the Seller Signals expander is a labelled control', () => {
    const signals = readSellerSignals({ ...listing, description: found('Motivated seller.') }, FALLBACK_CONFIG.signals, new Date('2026-09-02T00:00:00Z'));
    renderTriage(view({ unknowns: { rent: '1200' }, signals }));
    expect(document.querySelector('.ss-expander')?.textContent).toContain('More detail');
  });
});

describe('Seller Signals card (E8)', () => {
  const NOW = new Date('2026-09-02T00:00:00Z');
  const reduced = { ...listing, listingUpdate: found({ reason: 'reduced', date: '2026-07-15' }), description: found('Motivated seller. Offered chain free with no onward chain.') };

  it('renders as a separate, collapsed card BELOW the components with two band lines', () => {
    const signals = readSellerSignals(reduced, FALLBACK_CONFIG.signals, NOW);
    renderTriage(view({ listing: reduced, unknowns: { rent: '1200' }, signals }));
    const card = document.querySelector('details.seller-signals') as HTMLDetailsElement;
    expect(card).toBeTruthy();
    expect(card.open).toBe(false); // collapsed to its band lines
    expect(document.querySelectorAll('.ss-summary .ss-band').length).toBe(2);
    expect(txt()).toContain('Seller signals');
    // sits AFTER the components in document order
    const comps = document.querySelector('.components')!;
    expect(comps.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // the score chip is present and independent of the signals
    expect(document.querySelector('.deal-score')).toBeTruthy();
  });

  it('evidence is present (expandable) — chain-free only under "worth knowing", never flexibility', () => {
    const signals = readSellerSignals(reduced, FALLBACK_CONFIG.signals, NOW);
    renderTriage(view({ listing: reduced, unknowns: { rent: '1200' }, signals, signalsOpen: true }));
    expect(txt()).toContain('Reduced on 15/07/2026');
    expect(txt().toLowerCase()).toContain('motivated');
    expect(txt()).toContain('Chain-free');
    expect(txt()).toContain('never moves the Deal Score');
    // chain-free is never a flexibility EVIDENCE LABEL (its context snippet may
    // still show adjacent words — that's the point of showing the phrase)
    const flexHead = [...document.querySelectorAll('.ss-read-head')].find((h) => /flexible/i.test(h.textContent ?? ''))!;
    const flexSection = flexHead.parentElement!;
    const flexLabels = [...flexSection.querySelectorAll('.ss-ev-label')].map((x) => x.textContent ?? '');
    expect(flexLabels.some((l) => /chain/i.test(l))).toBe(false);
  });

  it('a strong impairment WARNING never uses the positive flexibility colour (E8 review)', () => {
    const impaired = { ...listing, description: found('Cash buyers only. Some historic subsidence.') };
    const signals = readSellerSignals(impaired, FALLBACK_CONFIG.signals, NOW);
    expect(signals.impairment.band).toBe('strong');
    renderTriage(view({ listing: impaired, unknowns: { rent: '1200' }, signals }));
    const bands = [...document.querySelectorAll('.ss-summary .ss-band')];
    const imp = bands.find((b) => /impaired/i.test(b.textContent ?? ''))!;
    expect(imp.classList.contains('ss-warn')).toBe(true); // warning scale, not ss-strong
    expect(imp.classList.contains('ss-strong')).toBe(false);
  });

  it('no card when there are no signals to show', () => {
    renderTriage(view({ unknowns: { rent: '1200' } }));
    expect(document.querySelector('details.seller-signals')).toBeNull();
  });
});

describe('settings screen (E7)', () => {
  it('shows the personal-criteria fields and a back link', () => {
    renderSettings(view({ screen: 'settings' }));
    expect(txt()).toContain('What does a good deal look like to you?');
    // deposit % and rate % are now front-of-panel levers, so they leave settings (E8.1)
    for (const f of criteriaFields().filter((f) => f.key !== 'depositPct' && f.key !== 'ratePct')) expect(document.getElementById(`gb-c-${f.key}`), f.key).toBeTruthy();
    expect(document.getElementById('gb-c-depositPct')).toBeNull();
    expect(document.querySelector('.settings-link')?.textContent).toContain('Back to the listing');
    // rent (a triage unknown) must NOT appear in settings
    expect(document.getElementById('gb-s-rent')).toBeNull();
  });
});
