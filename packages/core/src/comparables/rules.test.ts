/**
 * C1 — THE ONE DEFINITION OF A COMPARABLE, AND THE LADDER IT CLIMBS.
 *
 * These are the numbers every valuation in the product rests on, so most of
 * what is tested here is that they are what they say they are and that nothing
 * widens without saying so.
 */
import { describe, expect, it } from 'vitest';
import {
  COMPARABLE_RULES, filtersForStage, nextStage, typeFilterForSubject, runComparables,
  type WidenStage,
} from './rules';
import type { ComparablesInput, ComparablesResult } from './engine';

describe('the three defaults', () => {
  it('are same type, twelve months, half a mile', () => {
    expect(COMPARABLE_RULES.radiusMiles).toBe(0.5);
    expect(COMPARABLE_RULES.periodMonths).toBe(12);
    expect(COMPARABLE_RULES.matchPropertyType).toBe(true);
  });

  it('refuse below five comparables', () => {
    expect(COMPARABLE_RULES.minComparables).toBe(5);
  });
});

describe('matching the subject’s own type', () => {
  it.each(['D', 'S', 'T', 'F'])('a %s subject is compared against %s sales', (t) => {
    expect(typeFilterForSubject(t)).toBe(t);
  });

  it('is case- and space-insensitive, because the callers differ', () => {
    expect(typeFilterForSubject(' t ')).toBe('T');
    expect(typeFilterForSubject('f')).toBe('F');
  });

  /**
   * AN UNKNOWN TYPE IS NEVER GUESSED. A property whose type we do not know
   * cannot be type-matched, and filtering the evidence by an invention would be
   * worse than not filtering it at all.
   */
  it.each([null, undefined, '', 'O', 'bungalow'])('an unknown type (%s) filters nothing', (t) => {
    expect(typeFilterForSubject(t as string | null)).toBe('all');
  });
});

/**
 * TIME FIRST, THEN DISTANCE. Widening the radius changes WHERE — a different
 * street, a different catchment — and location is the one thing no index can
 * correct for afterwards. Widening time keeps the geography and reaches back,
 * which indexation can at least partly account for.
 */
describe('the widening ladder', () => {
  it('starts at the defaults', () => {
    expect(filtersForStage('default')).toEqual({ radiusMiles: 0.5, periodMonths: 12 });
  });

  it('widens TIME first, keeping the same half mile', () => {
    expect(filtersForStage('wider-time')).toEqual({ radiusMiles: 0.5, periodMonths: 24 });
  });

  it('and only then widens the area, keeping the wider window', () => {
    expect(filtersForStage('wider-area')).toEqual({ radiusMiles: 1, periodMonths: 24 });
  });

  it('climbs in that order and then stops', () => {
    expect(nextStage('default')).toBe('wider-time');
    expect(nextStage('wider-time')).toBe('wider-area');
    expect(nextStage('wider-area'), 'there is nowhere honest left to go').toBeNull();
  });

  it('never loosens the type filter to find more — that is the one rule it keeps', () => {
    for (const stage of ['default', 'wider-time', 'wider-area'] as WidenStage[]) {
      expect(Object.keys(filtersForStage(stage)).sort()).toEqual(['periodMonths', 'radiusMiles']);
    }
  });
});

/** A fake engine: returns `n` included comps for whatever it is asked. */
function engineYielding(byStage: Record<string, number>) {
  const calls: ComparablesInput[] = [];
  const find = async (i: ComparablesInput): Promise<ComparablesResult> => {
    calls.push(i);
    const key = `${i.radiusMiles}/${i.periodMonths}`;
    const n = byStage[key] ?? 0;
    return {
      comps: Array.from({ length: n }, (_, k) => ({ id: `c${k}`, included: true })),
      subject: { postcode: 'SA1 2HG' },
    } as unknown as ComparablesResult;
  };
  return { find, calls };
}

const BASE = { postcode: 'SA1 2HG', tenure: 'any' as const, age: 'all' as const };

describe('running the comparables', () => {
  it('stops at the defaults when they are enough, and never widens', async () => {
    const { find, calls } = engineYielding({ '0.5/12': 9 });
    const out = await runComparables({ ...BASE, subjectType: 'T' }, find);
    expect(out.stage).toBe('default');
    expect(out.widened).toBe(false);
    expect(out.tooFew).toBe(false);
    expect(calls, 'one run, no widening').toHaveLength(1);
    expect(calls[0].propertyType, 'and it matched the subject’s type').toBe('T');
  });

  it('widens the TIME window first when the defaults are thin', async () => {
    const { find, calls } = engineYielding({ '0.5/12': 2, '0.5/24': 7 });
    const out = await runComparables({ ...BASE, subjectType: 'T' }, find);
    expect(out.stage).toBe('wider-time');
    expect(out.widened).toBe(true);
    expect(out.tooFew).toBe(false);
    expect(calls.map((c) => `${c.radiusMiles}/${c.periodMonths}`)).toEqual(['0.5/12', '0.5/24']);
  });

  it('and only then the area', async () => {
    const { find, calls } = engineYielding({ '0.5/12': 2, '0.5/24': 3, '1/24': 8 });
    const out = await runComparables({ ...BASE, subjectType: 'T' }, find);
    expect(out.stage).toBe('wider-area');
    expect(calls.map((c) => `${c.radiusMiles}/${c.periodMonths}`)).toEqual(['0.5/12', '0.5/24', '1/24']);
  });

  /**
   * "WE LOOKED AS FAR AS IS HONEST AND THERE IS NOT ENOUGH" is a useful answer.
   * A valuation built on four sales is not.
   */
  it('reports too few rather than widening forever', async () => {
    const { find, calls } = engineYielding({ '0.5/12': 1, '0.5/24': 2, '1/24': 3 });
    const out = await runComparables({ ...BASE, subjectType: 'T' }, find);
    expect(out.tooFew).toBe(true);
    expect(out.stage).toBe('wider-area');
    expect(calls, 'it stops after the two steps').toHaveLength(3);
  });

  it('counts what is INCLUDED, not what was found', async () => {
    // Nine returned, but a person has excluded five of them.
    const find = async (): Promise<ComparablesResult> => ({
      comps: Array.from({ length: 9 }, (_, k) => ({ id: `c${k}`, included: k < 4 })),
      subject: { postcode: 'SA1 2HG' },
    } as unknown as ComparablesResult);
    const out = await runComparables({ ...BASE, subjectType: 'T' }, find);
    expect(out.tooFew, 'four included is too few, whatever was found').toBe(true);
  });

  it('honours a type a person chose for themselves', async () => {
    const { find, calls } = engineYielding({ '0.5/12': 9 });
    await runComparables({ ...BASE, subjectType: 'T', propertyType: 'houses' }, find);
    expect(calls[0].propertyType).toBe('houses');
  });

  it('an unknown subject type runs unfiltered rather than guessing', async () => {
    const { find, calls } = engineYielding({ '0.5/12': 9 });
    await runComparables({ ...BASE, subjectType: '' }, find);
    expect(calls[0].propertyType).toBe('all');
  });
});
