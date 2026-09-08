import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ComparablesError, DataError } from '@gil-bricks/core';
import type { Sale } from '@gil-bricks/core';
import { describe, expect, it } from 'vitest';
import { areaFromSales, epcFailureFor, type EpcFailure } from './epcArea';
import { SUBJECT_FORM } from '../../config/analyserForm';

/**
 * THE TEST THAT WOULD HAVE CAUGHT IT (S1).
 *
 * The EPC lookup was `catch { return null }`, so every failure — a missing
 * postcode, a Scottish one, our own data being down — reached the screen as
 * "No EPC match found for this address". It looked like a dead button and it
 * blamed the address for our outage.
 *
 * The guard is the last test in the first block: every reason must map to a
 * DIFFERENT sentence. On the old code all six collapsed to one, so it fails.
 */
const sale = (over: Partial<Sale>): Sale => ({
  id: 'x', date: '2025-01-01', price: 250000, paon: '21', saon: '', street: 'Test Street',
  town: 'Swansea', postcode: 'SA1 6SN', type: 'S', tenure: 'F', newBuild: false,
  lat: 51.6, lng: -3.9, floorAreaSqm: 74, ppsqm: 3378, ...over,
});

const ALL_REASONS: EpcFailure[] = [
  'needs-postcode', 'unknown-postcode', 'outside-ew', 'unavailable', 'rate-limited', 'no-match', 'ambiguous',
];

describe('every EPC failure says its own true thing', () => {
  it('each error the data layer throws maps to its own reason', () => {
    expect(epcFailureFor(new ComparablesError('BadInput', 'x'))).toBe('needs-postcode');
    expect(epcFailureFor(new ComparablesError('OutsideEnglandWales', 'x'))).toBe('outside-ew');
    expect(epcFailureFor(new ComparablesError('UnknownPostcode', 'x'))).toBe('unknown-postcode');
    expect(epcFailureFor(new DataError('Network', 'x'))).toBe('unavailable');
    expect(epcFailureFor(new DataError('BadSchema', 'x'))).toBe('unavailable');
    expect(epcFailureFor(new DataError('NotFound', 'x'))).toBe('no-match');
  });

  it('an unrecognised throw is treated as our fault, never the address’s', () => {
    expect(epcFailureFor(new Error('boom'))).toBe('unavailable');
    expect(epcFailureFor('nonsense')).toBe('unavailable');
  });

  it('every reason has a message, and NO TWO REASONS SHARE ONE', () => {
    const said = ALL_REASONS.map((r) => SUBJECT_FORM.epc.problem[r]);
    for (const line of said) expect(line.length).toBeGreaterThan(0);
    expect(new Set(said).size, 'six reasons, six different sentences').toBe(ALL_REASONS.length);
  });

  it('an outage never blames the person’s address', () => {
    const outage = SUBJECT_FORM.epc.problem.unavailable.toLowerCase();
    expect(outage).not.toContain('address');
    expect(outage).toContain('our');
  });

  it('the two the person can act on say what to do', () => {
    expect(SUBJECT_FORM.epc.problem['needs-postcode'].toLowerCase()).toContain('postcode');
    expect(SUBJECT_FORM.epc.problem['no-match'].toLowerCase()).toContain('register');
  });
});

describe('picking the area out of the sold records', () => {
  it('finds the floor area for a matching address', () => {
    const got = areaFromSales([sale({})], 'SA1 6SN', '21');
    expect(got).toEqual({ ok: true, sqm: 74, source: 'sold-data' });
  });

  it('matches the address however it is typed', () => {
    expect(areaFromSales([sale({})], 'SA1 6SN', ' 21 ')).toEqual({ ok: true, sqm: 74, source: 'sold-data' });
  });

  it('a different postcode in the same sector is not a match', () => {
    expect(areaFromSales([sale({})], 'SA1 6AA', '21')).toEqual({ ok: false, reason: 'no-match' });
  });

  it('a sold record with no floor area is not a match', () => {
    expect(areaFromSales([sale({ floorAreaSqm: null })], 'SA1 6SN', '21'))
      .toEqual({ ok: false, reason: 'no-match' });
  });

  it('flats at one number that disagree on size are ambiguous, never a guess', () => {
    const flats = [sale({ saon: 'FLAT 1' }), sale({ saon: 'FLAT 2', floorAreaSqm: 52 })];
    expect(areaFromSales(flats, 'SA1 6SN', '21')).toEqual({ ok: false, reason: 'ambiguous' });
  });

  it('flats that agree on size are not ambiguous', () => {
    const flats = [sale({ saon: 'FLAT 1' }), sale({ saon: 'FLAT 2' })];
    expect(areaFromSales(flats, 'SA1 6SN', '21')).toEqual({ ok: true, sqm: 74, source: 'sold-data' });
  });
});

describe('the lookup can never leave the button stuck', () => {
  /**
   * The first version of this fix put `areaFromSales` OUTSIDE the try, and the
   * form had no `finally`. A malformed sale row therefore rejected the promise,
   * the busy flag never cleared, and the button sat greyed out saying "…" with
   * no way back — a worse version of the bug the sprint set out to remove.
   */
  it('a malformed sale row is skipped, not thrown on', () => {
    const rows = [null, undefined, {}, sale({})] as unknown as Sale[];
    expect(() => areaFromSales(rows, 'SA1 6SN', '21')).not.toThrow();
    expect(areaFromSales(rows, 'SA1 6SN', '21')).toEqual({ ok: true, sqm: 74, source: 'sold-data' });
  });

  it('a sales list that is missing entirely is a no-match, not a crash', () => {
    expect(areaFromSales(undefined as unknown as Sale[], 'SA1 6SN', '21'))
      .toEqual({ ok: false, reason: 'no-match' });
  });

  it('the matching runs INSIDE the try, so nothing it throws escapes', () => {
    const src = readFileSync(fileURLToPath(new URL('./epcArea.ts', import.meta.url)), 'utf8');
    const body = src.slice(src.indexOf('export async function lookupFromSoldData'));
    const tryAt = body.indexOf('try {');
    const matchAt = body.indexOf('return areaFromSales(');
    const catchAt = body.indexOf('} catch (err)');
    expect(tryAt).toBeGreaterThan(-1);
    expect(matchAt, 'the match is after the try opens').toBeGreaterThan(tryAt);
    expect(matchAt, 'and before the catch').toBeLessThan(catchAt);
  });

  it('the form clears its busy flag in a finally, so the button always comes back', () => {
    const form = readFileSync(fileURLToPath(new URL('./SubjectForm.tsx', import.meta.url)), 'utf8');
    const fn = form.slice(form.indexOf('const findArea'), form.indexOf('return ('));
    expect(fn).toContain('finally');
    const finallyAt = fn.indexOf('} finally {');
    const clearAt = fn.indexOf('setEpcBusy(false)');
    expect(finallyAt, 'there is a finally').toBeGreaterThan(-1);
    expect(clearAt, 'the flag is cleared inside it').toBeGreaterThan(finallyAt);
    expect(fn.match(/setEpcBusy\(false\)/g), 'cleared in exactly one place').toHaveLength(1);
  });
});
