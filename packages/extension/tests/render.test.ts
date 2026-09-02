// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { scoreListing, found, missing, type NormalisedListing, type SectorFile } from '@gil-bricks/core';
import { renderEmpty, renderFailure, renderScored, type PanelView } from '../entrypoints/sidepanel/main.ts';

const listing: NormalisedListing = {
  portal: 'rightmove', extractorVersion: 'rm-1.0.0', configVersion: 't', source: 'embedded',
  listingId: found('123'), url: found('https://www.rightmove.co.uk/properties/123'),
  postcode: found('SA1 8AJ'), outcode: found('SA1'),
  address: found({ paon: '31', street: 'Kings Road', town: 'Swansea' }),
  askingPrice: found(170000), propertyType: found('Apartment'), tenure: found('LEASEHOLD'),
  bedrooms: found(2), bathrooms: found(2), floorAreaSqm: missing(), floorPlanImageUrls: missing(),
  newBuild: found(false), listingUpdate: missing(), firstVisibleDate: missing(), description: found('x'), isAuction: missing(),
};
const sector = (over = {}): SectorFile => ({
  schemaVersion: 1, sector: 'SA1 8', country: 'W92000004', updatedAt: '2026-08-31T00:00:00Z', sales: [],
  stats: { count: 20, typicalPrice: 180000, typicalPpsqm: 2200, p10Price: 120000, p90Price: 230000, ...over },
}) as SectorFile;

function view(over: Partial<PanelView> = {}): PanelView {
  const strategy = over.strategy ?? 'btl';
  const rent = over.rent ?? '';
  const result = over.result ?? scoreListing(listing, { strategy, rent: rent ? Number(rent) : null, sector: sector() });
  return { listing, strategy, result, rent, assumptions: {}, floorAreaSqm: null, floorAreaSource: 'none', sectorId: 'SA1 8', ...over };
}

beforeEach(() => { document.body.innerHTML = '<main id="app"></main>'; });
const txt = () => document.getElementById('app')!.textContent ?? '';

describe('panel render states (E6)', () => {
  it('empty state prompts to open a listing', () => {
    renderEmpty();
    expect(txt()).toContain('Open a Rightmove or Zoopla listing');
  });

  it('failure state shows the honest message', () => {
    renderFailure('We couldn’t read this Zoopla page — the site may have changed.');
    expect(txt()).toContain('the site may have changed');
  });

  it('BTL with rent renders the property line, strategy switch, real score + Send', () => {
    renderScored(view({ rent: '900' }));
    expect(txt()).toContain('Kings Road');
    expect(txt()).toContain('£170,000');
    expect(document.querySelectorAll('.strat-btn').length).toBe(4);
    expect(document.querySelector('.strat-btn.active')?.textContent).toBe('BTL');
    expect(document.querySelector('.deal-score .ds-score strong')).toBeTruthy();
    // the price component is REAL (green — £170k under £180k typical), not "unknown"
    const rows = [...document.querySelectorAll('.component')].map((r) => r.textContent ?? '');
    expect(rows.some((r) => /sold/i.test(r) && /green/i.test(r))).toBe(true);
    expect(document.getElementById('gb-rent')).toBeTruthy();
    expect(document.querySelector('.send-btn')?.textContent).toContain('Send to my analyser');
  });

  it('BTL without rent shows a pending chip, the REAL price read, and "needs rent"', () => {
    renderScored(view({ rent: '' }));
    expect(txt()).toContain('Not scored yet');
    expect(txt()).toContain('Add the monthly rent below'); // the pending message (not just the label)
    const rows = [...document.querySelectorAll('.component')].map((r) => r.textContent ?? '');
    // the price row shows the REAL pre-rent read (£170k ≤ £180k typical), not just the name
    expect(rows.some((r) => /sold/i.test(r) && /At or below the £180,000 typical/.test(r))).toBe(true);
    expect(rows.some((r) => /needs rent/i.test(r))).toBe(true);
    expect(document.querySelector('.deal-score .ds-score')).toBeNull(); // no numeric score
  });

  it('Flip defers honestly with a note, no numeric score', () => {
    renderScored(view({ strategy: 'flip', rent: '900' }));
    expect(txt().toLowerCase()).toContain('analyser');
    expect(document.querySelector('.deal-score .ds-score')).toBeNull();
  });

  it('a Scottish postcode shows the England-&-Wales message, no score', () => {
    renderScored(view({ rent: '900', ewReject: 'Sorry — this covers England & Wales only' }));
    expect(txt()).toContain('England & Wales only');
    expect(document.querySelector('.deal-score')).toBeNull();
  });
});
