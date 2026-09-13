/**
 * R3 — THE PHOTOS ARRIVE WITH THE LISTING, AT NO EXTRA TAP, and the flag off
 * leaves the refurb section exactly as it was.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { PHOTOS_PARAM, MAX_HANDOFF_PHOTOS, buildAnalyserHandoff, found, missing, type NormalisedListing } from '@gil-bricks/core';
import { photosFromParam } from './index';
import { features } from '../config/features';

const listing = (photos: string[] | null): NormalisedListing => ({
  portal: 'rightmove', extractorVersion: 'rm-1.0.0', configVersion: 't', source: 'embedded',
  listingId: found('123'), url: found('https://www.rightmove.co.uk/properties/123'),
  postcode: found('CF24 4AA'), outcode: found('CF24'),
  address: found({ paon: '12', street: 'Test Street', town: 'Cardiff' }),
  askingPrice: found(150000), propertyType: found('Terraced'), tenure: found('FREEHOLD'),
  bedrooms: found(3), bathrooms: found(1), floorAreaSqm: missing(), floorAreaSqmRange: missing(),
  floorPlanImageUrls: missing<string[]>(),
  photoUrls: photos === null ? missing<string[]>() : found(photos),
  newBuild: found(false), listingUpdate: missing(), firstVisibleDate: missing(),
  description: found('x'), isAuction: missing(),
}) as NormalisedListing;

const saved = { ...features };
afterEach(() => { Object.assign(features, saved); });

describe('the photos travel in the handoff', () => {
  it('they come over with the price and the beds — one tap, nothing extra', () => {
    const { params } = buildAnalyserHandoff(listing([
      'https://media.rightmove.co.uk/a.jpeg', 'https://media.rightmove.co.uk/b.jpeg',
    ]), { strategy: 'btl' });
    expect(photosFromParam(params[PHOTOS_PARAM])).toHaveLength(2);
    expect(params.price).toBe('150000');
  });

  it('a listing with no photos carries none, and the section still works', () => {
    const { params } = buildAnalyserHandoff(listing(null), { strategy: 'btl' });
    expect(params[PHOTOS_PARAM]).toBeUndefined();
    expect(photosFromParam(params[PHOTOS_PARAM] ?? null)).toEqual([]);
  });

  it('nothing but https is ever carried — bytes would mean we were holding them', () => {
    const { params } = buildAnalyserHandoff(listing([
      'data:image/png;base64,AAA', 'blob:https://x/1', 'http://insecure/a.jpg',
      'https://media.rightmove.co.uk/ok.jpeg',
    ]), { strategy: 'btl' });
    expect(photosFromParam(params[PHOTOS_PARAM])).toEqual(['https://media.rightmove.co.uk/ok.jpeg']);
  });

  it('and it is CAPPED, because a handoff is a URL', () => {
    const many = Array.from({ length: 40 }, (_, i) => `https://media.rightmove.co.uk/p${i}.jpeg`);
    const { params } = buildAnalyserHandoff(listing(many), { strategy: 'btl' });
    expect(photosFromParam(params[PHOTOS_PARAM])).toHaveLength(MAX_HANDOFF_PHOTOS);
    expect(params[PHOTOS_PARAM].length).toBeLessThan(2000);
  });
});

describe('with the flag off the refurb section is exactly what it was', () => {
  it('no photos are read from the URL at all', () => {
    features.refurbPhotos = false;
    // the section reads `ph` only when the flag is on — asserted at the source,
    // because that is the line that decides it
    const src = require('node:fs').readFileSync(
      require('node:url').fileURLToPath(new URL('../components/analyser/RefurbSection.tsx', import.meta.url)), 'utf8',
    ) as string;
    expect(src).toContain('features.refurbPhotos\n    ? photosFromParam(');
    expect(src).toContain('features.refurbPhotos && photos.length > 0');
  });

  it('and the itemised list is untouched by any of this', () => {
    const src = require('node:fs').readFileSync(
      require('node:url').fileURLToPath(new URL('../components/analyser/RefurbSection.tsx', import.meta.url)), 'utf8',
    ) as string;
    // the list, its toggle and its rows are all still there, outside the flag
    expect(src).toContain('id="refurb-list"');
    expect(src).toContain('REFURB_ITEMS.map((item)');
  });
});
