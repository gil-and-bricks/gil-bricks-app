import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractListing, FALLBACK_CONFIG } from './index';
import { rightmoveFloorArea } from './parse';

/** Bug 5a (E7): Rightmove can publish floor area as a RANGE — never present the
 * top as fact. Parse both ends, use the midpoint as the working value, keep the
 * range for the UI to show. */

describe('rightmoveFloorArea range parsing', () => {
  it('parses a sqm range to min/max/midpoint and flags it a range', () => {
    const fa = rightmoveFloorArea([
      { unit: 'sqft', minimumSize: 4216, maximumSize: 4910 },
      { unit: 'sqm', minimumSize: 392, maximumSize: 456 },
    ]);
    expect(fa).toEqual({ minSqm: 392, maxSqm: 456, midSqm: 424, isRange: true });
  });
  it('a single value is not a range; sqft is converted', () => {
    expect(rightmoveFloorArea([{ unit: 'sqm', minimumSize: 90, maximumSize: 90 }])).toEqual({ minSqm: 90, maxSqm: 90, midSqm: 90, isRange: false });
    const sqft = rightmoveFloorArea([{ unit: 'sqft', minimumSize: 1000, maximumSize: 1000 }]);
    expect(sqft!.isRange).toBe(false);
    expect(sqft!.midSqm).toBe(Math.round(1000 * 0.09290304));
  });
  it('returns null when no size is given', () => {
    expect(rightmoveFloorArea([])).toBeNull();
    expect(rightmoveFloorArea(undefined)).toBeNull();
  });
});

describe('the synthetic range fixture reads honestly (never the top of the range)', () => {
  it('uses the midpoint and exposes the range', () => {
    const path = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'listings', 'synthetic', 'rightmove-floor-area-range.html');
    const url = 'https://www.rightmove.co.uk/properties/173700464';
    const w = new Window({ url, settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
    w.document.write(readFileSync(path, 'utf8'));
    const res = extractListing('rightmove', w.document as unknown as Document, FALLBACK_CONFIG, url);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.listing.askingPrice.value).toBe(1_500_000);
      expect(res.listing.floorAreaSqm.value).toBe(424); // midpoint, NOT 456
      expect(res.listing.floorAreaSqmRange.status).toBe('found');
      expect(res.listing.floorAreaSqmRange.value).toEqual({ minSqm: 392, maxSqm: 456 });
    }
  });
});
