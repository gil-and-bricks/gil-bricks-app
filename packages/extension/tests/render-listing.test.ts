// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { found, missing, unavailable, type ExtractResult } from '@gil-bricks/core';

/** The E5 read-listing panel view renders a normalised listing + honest states. */
describe('side panel renderListing', () => {
  beforeEach(() => { document.body.innerHTML = '<main id="app"></main>'; });

  it('renders found values, missing/na statuses, and the version footer', async () => {
    const { renderListing } = await import('../entrypoints/sidepanel/main.ts');
    const result: ExtractResult = {
      ok: true,
      listing: {
        portal: 'rightmove', extractorVersion: 'rm-1.0.0', configVersion: 'test', source: 'embedded',
        listingId: found('123'), url: found('https://www.rightmove.co.uk/properties/123'),
        postcode: found('SA1 8AJ'), outcode: found('SA1'),
        address: found({ street: 'Kings Road', town: 'Swansea' }),
        askingPrice: found(170000), propertyType: found('Apartment'), tenure: found('LEASEHOLD'),
        bedrooms: found(2), bathrooms: found(2), floorAreaSqm: missing(),
        floorPlanImageUrls: missing(), newBuild: found(false),
        listingUpdate: found({ reason: 'added', date: '2026-05-30' }), firstVisibleDate: found('2026-05-30'),
        description: found('x'.repeat(3257)), isAuction: unavailable(),
      },
    };
    renderListing(result);
    const app = document.getElementById('app')!;
    const text = app.textContent ?? '';
    expect(text).toContain('£170,000');
    expect(text).toContain('Apartment');
    expect(text).toContain('read cleanly'); // embedded source badge
    expect(text).toContain('rm-1.0.0');
    // missing floor area shows a "missing" status, not a wrong value
    const rows = [...app.querySelectorAll('.field-row')].map((r) => r.textContent);
    expect(rows.some((r) => /Floor area/.test(r!) && /missing/.test(r!))).toBe(true);
    expect(rows.some((r) => /Auction/.test(r!) && /n\/a/.test(r!))).toBe(true);
  });

  it('renders the honest failure message on a failed read', async () => {
    const { renderListing } = await import('../entrypoints/sidepanel/main.ts');
    renderListing({ ok: false, portal: 'zoopla', reason: 'shape-changed', message: 'We couldn’t read this Zoopla page — the site may have changed.' });
    expect(document.getElementById('app')!.textContent).toContain('the site may have changed');
  });

  it('shows the England-&-Wales message for a Scottish postcode', async () => {
    const { renderListing } = await import('../entrypoints/sidepanel/main.ts');
    renderListing({
      ok: true,
      listing: {
        portal: 'rightmove', extractorVersion: 'rm-1.0.0', configVersion: 't', source: 'embedded',
        listingId: found('1'), url: found('u'), postcode: found('EH1 1AA'), outcode: found('EH1'),
        address: missing(), askingPrice: found(100000), propertyType: found('Flat'), tenure: missing(),
        bedrooms: missing(), bathrooms: missing(), floorAreaSqm: missing(), floorPlanImageUrls: missing(),
        newBuild: missing(), listingUpdate: missing(), firstVisibleDate: missing(), description: missing(), isAuction: unavailable(),
      },
    });
    expect(document.getElementById('app')!.textContent).toContain('England & Wales only');
  });
});
