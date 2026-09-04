import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../components/analyser/state';
import { COMPARABLES } from '../config/comparables';
import { activeFilterCount, clearedFilters, FILTER_KEYS, wantsCards } from './comparables';

describe('comparables on a phone (N3)', () => {
  it('counts only the filters that are actually set', () => {
    expect(activeFilterCount(DEFAULTS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULTS, radius: '1' })).toBe(1);
    expect(activeFilterCount({ ...DEFAULTS, radius: '1', tenure: 'F', minPrice: '80000' })).toBe(3);
    // the ticks and the chosen view are not filters
    expect(activeFilterCount({ ...DEFAULTS, excluded: 'a,b', view: 'map' } as typeof DEFAULTS)).toBe(0);
  });

  it('reset puts every filter back to its default and touches nothing else', () => {
    const cleared = clearedFilters();
    expect(Object.keys(cleared).sort()).toEqual([...FILTER_KEYS].sort());
    for (const k of FILTER_KEYS) expect(cleared[k]).toBe((DEFAULTS as unknown as Record<string, string>)[k]);
    const dirty = { ...DEFAULTS, minArea: '50', radius: '1' as const };
    expect(activeFilterCount(dirty)).toBe(2);
    expect(activeFilterCount({ ...dirty, ...cleared })).toBe(0);
    expect(Object.keys(cleared)).not.toContain('excluded');
    expect(Object.keys(cleared)).not.toContain('view');
  });

  it('cards on a phone, the table on a desktop, and nothing at all when the flag is off', () => {
    expect(wantsCards(390, true)).toBe(true);
    expect(wantsCards(640, true)).toBe(true);
    expect(wantsCards(641, true)).toBe(false);
    expect(wantsCards(1280, true)).toBe(false);
    expect(wantsCards(390, false)).toBe(false);
    expect(wantsCards(0, true)).toBe(false);
  });

  it('the Filters button says how many are set, in plain English', () => {
    expect(COMPARABLES.filters.label).toBe('Filters');
    expect(COMPARABLES.filters.withCount(2)).toBe('Filters · 2 set');
    expect(COMPARABLES.card.distanceValue('0.21')).toBe('0.21 miles away');
    expect(COMPARABLES.card.include('12 High Street')).toBe('Include 12 High Street');
  });
});
