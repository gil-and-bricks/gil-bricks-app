/**
 * F1 — THE PLAN ARRIVES WITH THE LISTING, AT NO EXTRA TAP.
 *
 * The whole point of the handoff is that nothing is done twice. The floorplan's
 * address travels with the price and the beds, and the web app renders it from
 * the PORTAL'S server exactly as the listing page did.
 */
import { describe, expect, it } from 'vitest';
import { FLOORPLAN_PARAM, buildAnalyserHandoff, found, missing, type NormalisedListing } from '@gil-bricks/core';
import { isDisplayableImageUrl } from './index';

const listing = (fp: unknown): NormalisedListing => ({
  portal: 'rightmove', extractorVersion: 'rm-1.0.0', configVersion: 't', source: 'embedded',
  listingId: found('123'), url: found('https://www.rightmove.co.uk/properties/123'),
  postcode: found('CF24 4AA'), outcode: found('CF24'),
  address: found({ paon: '12', street: 'Test Street', town: 'Cardiff' }),
  askingPrice: found(150000), propertyType: found('Terraced'), tenure: found('FREEHOLD'),
  bedrooms: found(3), bathrooms: found(1), floorAreaSqm: missing(), floorAreaSqmRange: missing(),
  floorPlanImageUrls: fp === null ? missing<string[]>() : found(fp as string[]),
  newBuild: found(false), listingUpdate: missing(), firstVisibleDate: missing(),
  description: found('x'), isAuction: missing(),
}) as NormalisedListing;

describe('the floor plan travels in the handoff', () => {
  it('the first plan image comes over with everything else', () => {
    const { params } = buildAnalyserHandoff(listing(['https://media.rightmove.co.uk/dir/plan_max_600x600.jpeg']), { strategy: 'btl' });
    expect(params[FLOORPLAN_PARAM]).toBe('https://media.rightmove.co.uk/dir/plan_max_600x600.jpeg');
    // and it rides WITH the ordinary fields — one URL, one tap, nothing extra
    expect(params.price).toBe('150000');
    expect(params.beds).toBe('3');
  });

  it('a listing with no plan simply carries none — not an empty string', () => {
    const { params } = buildAnalyserHandoff(listing(null), { strategy: 'btl' });
    expect(params[FLOORPLAN_PARAM]).toBeUndefined();
  });

  it('and NOTHING but an https URL is ever carried', () => {
    for (const bad of ['blob:https://x/9f2a', 'data:image/png;base64,iVBOR', 'http://insecure/p.png', '']) {
      const { params } = buildAnalyserHandoff(listing([bad]), { strategy: 'btl' });
      expect(params[FLOORPLAN_PARAM], bad).toBeUndefined();
    }
  });

  it('whatever the handoff carries, the module would agree to display', () => {
    const { params } = buildAnalyserHandoff(listing(['https://media.rightmove.co.uk/p.jpeg']), { strategy: 'btl' });
    expect(isDisplayableImageUrl(params[FLOORPLAN_PARAM])).toBe(true);
  });

  it('the param is an ADDRESS, never bytes — it is short', () => {
    const { params } = buildAnalyserHandoff(listing(['https://media.rightmove.co.uk/dir/plan_max_600x600.jpeg']), { strategy: 'btl' });
    // a data: URI of a real plan is tens of kilobytes; a URL is tens of bytes
    expect(params[FLOORPLAN_PARAM].length).toBeLessThan(300);
  });
});
