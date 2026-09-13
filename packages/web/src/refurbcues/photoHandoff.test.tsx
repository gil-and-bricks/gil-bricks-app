// @vitest-environment happy-dom
/**
 * R3 — THE PHOTOS ARRIVE WITH THE LISTING, AT NO EXTRA TAP, and the flag off
 * leaves the refurb section exactly as it was.
 *
 * R3.1 — THE FLAG-OFF CHECK NOW RENDERS THE SECTION AND LOOKS AT IT. It used to
 * read RefurbSection.tsx and assert the guard lines were present in the source,
 * which proves the line is written, not that the page obeys it: rename a
 * variable and the test passes while the carousel ships. So the section is
 * rendered twice, with real photo URLs in the query string — once with the flag
 * on, so the assertions are known to be capable of failing, and once with it
 * off — and the OUTPUT is what is examined.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { PHOTOS_PARAM, MAX_HANDOFF_PHOTOS, buildAnalyserHandoff, found, missing, type NormalisedListing } from '@gil-bricks/core';
import { render } from 'preact-render-to-string';
import { photosFromParam } from './index';
import { CUES } from './library';
import { features } from '../config/features';
import { REFURB_ITEMS, REFURB_PHOTOS } from '../config/refurb';
import { RefurbSection, MODE_PARAM } from '../components/analyser/RefurbSection';
import { state, strategyParams } from '../components/analyser/state';

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
  const PHOTOS = 'https://media.rightmove.co.uk/a.jpeg https://media.rightmove.co.uk/b.jpeg';

  /** The section as a browser would build it, with photos in the URL. */
  const renderSection = (): string => {
    window.history.replaceState({}, '', `/analyser?ph=${encodeURIComponent(PHOTOS)}`);
    strategyParams.value = { [MODE_PARAM]: '1' };
    state.value = { ...state.value, postcode: '', area: '', beds: '' };
    return render(<RefurbSection legacy={false} onLegacySeen={() => {}} country={null} hasContingency={false} />);
  };

  it('POSITIVE CONTROL: with the flag ON the photos and a pointer are really there', () => {
    features.refurbPhotos = true;
    const out = renderSection();
    expect(out).toContain('rc-photo');
    expect(out).toContain('https://media.rightmove.co.uk/a.jpeg');
    expect(out).toContain(REFURB_PHOTOS.caveat);
    // a real pointer from the library, not a placeholder
    expect(out).toContain('rc-tip-look');
  });

  it('with the flag OFF nothing of the carousel is rendered at all', () => {
    features.refurbPhotos = false;
    const out = renderSection();
    expect(out).not.toContain('rc-photo');
    expect(out).not.toContain('https://media.rightmove.co.uk/a.jpeg');
    expect(out).not.toContain(REFURB_PHOTOS.caveat);
    expect(out).not.toContain('rc-tip');
    // and not one cue's words reach the page
    for (const cue of CUES) expect(out, cue.key).not.toContain(cue.look);
  });

  it('and the itemised list is untouched by any of this', () => {
    features.refurbPhotos = false;
    const off = renderSection();
    expect(off).toContain('refurb-list');
    for (const item of REFURB_ITEMS) expect(off, item.key).toContain(item.label);

    // the same rows are there with the flag on: the carousel ADDS, never swaps
    features.refurbPhotos = true;
    const on = renderSection();
    for (const item of REFURB_ITEMS) expect(on, item.key).toContain(item.label);
  });
});
