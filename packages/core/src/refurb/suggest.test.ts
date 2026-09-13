/**
 * REFURB SUGGESTIONS (R2) — the arithmetic, and the refusals.
 *
 * THE REFUSALS MATTER MOST. A row we cannot size must say which fact is missing
 * rather than contribute a guess to a total somebody then trusts. Every
 * `needs-*` case below is a number this feature declines to invent.
 *
 * Figures here are ARBITRARY TEST VALUES, not suggestions — the shipped config
 * is empty by design (see refurbFigures.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  NO_SUGGESTION, REFURB_DRIVER, bedBandFor, figuresAreStale, isSuggestion, refurbRange, suggestFor,
  type CostBand, type PropertyFacts,
} from './suggest';

const band = (mid: number, low: number, high: number): CostBand => ({ mid, low, high });
const facts = (over: Partial<PropertyFacts> = {}): PropertyFacts => ({
  region: 'north-west', floorAreaSqm: 90, beds: 3, counts: {}, ...over,
});

describe('a flat job price', () => {
  it('is the base × region × labour', () => {
    const r = suggestFor(band(6000, 4000, 9000), REFURB_DRIVER.flat, 'kitchen', facts(), 1.1, 1.0);
    expect(isSuggestion(r)).toBe(true);
    if (!isSuggestion(r)) return;
    expect(r.band.mid).toBe(6600);
    expect(r.band.low).toBe(4400);
    expect(r.band.high).toBe(9900);
    expect(r.steps.regionMultiplier).toBe(1.1);
    expect(r.steps.labourFactor).toBe(1);
  });

  it('and the labour factor moves it in both directions', () => {
    const dearer = suggestFor(band(6000, 4000, 9000), REFURB_DRIVER.flat, 'kitchen', facts(), 1, 1.15);
    const cheaper = suggestFor(band(6000, 4000, 9000), REFURB_DRIVER.flat, 'kitchen', facts(), 1, 0.6);
    expect(isSuggestion(dearer) && dearer.band.mid).toBe(6900);
    expect(isSuggestion(cheaper) && cheaper.band.mid).toBe(3600);
  });
});

describe('items sized by the property', () => {
  it('a £/m² item multiplies by the floor area', () => {
    const r = suggestFor(band(45, 32, 60), REFURB_DRIVER.perSqm, 'plastering', facts({ floorAreaSqm: 90 }), 1, 1);
    expect(isSuggestion(r) && r.band.mid).toBe(4050);
    expect(isSuggestion(r) && r.steps.quantity).toBe(90);
  });

  it('WITHOUT a floor area it refuses, rather than guessing a total', () => {
    const r = suggestFor(band(45, 32, 60), REFURB_DRIVER.perSqm, 'plastering', facts({ floorAreaSqm: null }), 1, 1);
    expect(r).toBe(NO_SUGGESTION.needsArea);
  });

  it('a per-unit item multiplies by the count', () => {
    const r = suggestFor(band(700, 500, 1100), REFURB_DRIVER.perUnit, 'windows', facts({ counts: { windows: 8 } }), 1, 1);
    expect(isSuggestion(r) && r.band.mid).toBe(5600);
  });

  it('without a count it refuses', () => {
    const r = suggestFor(band(700, 500, 1100), REFURB_DRIVER.perUnit, 'windows', facts({ counts: {} }), 1, 1);
    expect(r).toBe(NO_SUGGESTION.needsCount);
  });

  it('a bed-banded item picks the band, and does NOT multiply by bedrooms', () => {
    const spec = { mid: null, low: null, high: null, bands: { '1-2': band(3000, 2200, 4000), '3': band(4200, 3200, 5600), '4+': band(5400, 4200, 7000) } };
    const three = suggestFor(spec, REFURB_DRIVER.beds, 'rewire', facts({ beds: 3 }), 1, 1);
    expect(isSuggestion(three) && three.band.mid).toBe(4200);
    const five = suggestFor(spec, REFURB_DRIVER.beds, 'rewire', facts({ beds: 5 }), 1, 1);
    expect(isSuggestion(five) && five.band.mid).toBe(5400);
    const two = suggestFor(spec, REFURB_DRIVER.beds, 'rewire', facts({ beds: 2 }), 1, 1);
    expect(isSuggestion(two) && two.band.mid).toBe(3000);
  });

  it('without bedrooms it refuses', () => {
    const spec = { mid: null, low: null, high: null, bands: { '3': band(4200, 3200, 5600) } };
    expect(suggestFor(spec, REFURB_DRIVER.beds, 'rewire', facts({ beds: null }), 1, 1)).toBe(NO_SUGGESTION.needsBeds);
  });

  it('bed bands match numerically, never as strings', () => {
    const bands = { '1-2': band(1, 1, 1), '3': band(2, 2, 2), '4+': band(3, 3, 3) };
    expect(bedBandFor(1, bands)).toBe('1-2');
    expect(bedBandFor(3, bands)).toBe('3');
    expect(bedBandFor(9, bands)).toBe('4+');
  });
});

describe('it refuses rather than invents', () => {
  it('no figures at all', () => {
    expect(suggestFor(undefined, REFURB_DRIVER.flat, 'kitchen', facts(), 1, 1)).toBe(NO_SUGGESTION.noFigures);
    expect(suggestFor(band(0, 0, 0), REFURB_DRIVER.flat, 'kitchen', facts(), 1, 1)).toBe(NO_SUGGESTION.noFigures);
  });

  it('no region', () => {
    expect(suggestFor(band(6000, 4000, 9000), REFURB_DRIVER.flat, 'kitchen', facts({ region: null }), 1, 1)).toBe(NO_SUGGESTION.noRegion);
  });

  it('a missing regional multiplier or labour factor offers nothing', () => {
    expect(suggestFor(band(6000, 4000, 9000), REFURB_DRIVER.flat, 'kitchen', facts(), null, 1)).toBe(NO_SUGGESTION.noFigures);
    expect(suggestFor(band(6000, 4000, 9000), REFURB_DRIVER.flat, 'kitchen', facts(), 1, null)).toBe(NO_SUGGESTION.noFigures);
  });
});

describe('the total, and the range around it', () => {
  it('sums the mid-points and adds contingency', () => {
    const t = refurbRange([band(4200, 3200, 5600), band(6600, 4400, 9900)], 10);
    expect(t.mid).toBe(Math.round((4200 + 6600) * 1.1));
    expect(t.low).toBe(Math.round((3200 + 4400) * 1.1));
    expect(t.high).toBe(Math.round((5600 + 9900) * 1.1));
  });

  it('no contingency leaves it alone', () => {
    expect(refurbRange([band(1000, 800, 1300)], 0).mid).toBe(1000);
  });

  it('an empty list has no total at all — not a zero', () => {
    expect(refurbRange([], 10).mid).toBeNull();
  });
});

describe('how old the figures are', () => {
  const now = Date.parse('2026-09-13T00:00:00Z');
  it('fresh figures are not called stale', () => {
    expect(figuresAreStale('2026-06-01', now, 12)).toBe(false);
  });
  it('figures over the window are', () => {
    expect(figuresAreStale('2025-01-01', now, 12)).toBe(true);
  });
  it('no date claims nothing', () => {
    expect(figuresAreStale(null, now, 12)).toBe(false);
  });
});
