import { describe, expect, it } from 'vitest';
import { dataFreshness } from './freshness';

/**
 * The monthly refresh broke on 2026-09-09 (ONSPD renamed a column) and the site
 * carried on saying "as of 2026-07" with nothing to suggest the update had
 * stopped. The date was true; the silence was the problem.
 */
const AT = '2026-09-09T13:42:54.387Z';
const at = Date.parse(AT);
const days = (n: number): number => at + n * 86_400_000;
const THRESHOLD = 45;

describe('how old the data is', () => {
  it('counts whole days since the pipeline last wrote', () => {
    expect(dataFreshness(AT, days(0), THRESHOLD).ageDays).toBe(0);
    expect(dataFreshness(AT, days(1), THRESHOLD).ageDays).toBe(1);
    expect(dataFreshness(AT, days(44.9), THRESHOLD).ageDays).toBe(44);
  });

  it('is quiet through a normal month — the refresh runs on the 2nd', () => {
    for (const d of [0, 1, 15, 31, 44]) {
      expect(dataFreshness(AT, days(d), THRESHOLD).stale, `${d} days`).toBe(false);
    }
  });

  it('speaks up once a monthly refresh has plainly been missed', () => {
    expect(dataFreshness(AT, days(45), THRESHOLD).stale).toBe(true);
    expect(dataFreshness(AT, days(200), THRESHOLD).stale).toBe(true);
  });

  it('claims NOTHING when there is no usable date — silence beats a guess', () => {
    for (const bad of [null, undefined, '', 'not a date', '2026-13-45']) {
      const f = dataFreshness(bad as string, days(999), THRESHOLD);
      expect(f.known, JSON.stringify(bad)).toBe(false);
      expect(f.stale, 'an unreadable date must not be reported as stale').toBe(false);
    }
  });

  it('a manifest dated in the future is a clock argument, not fresh data', () => {
    const f = dataFreshness(AT, days(-10), THRESHOLD);
    expect(f.ageDays).toBe(0);
    expect(f.stale).toBe(false);
  });

  it('takes the threshold from the caller — it is config, never typed in here', () => {
    expect(dataFreshness(AT, days(10), 7).stale).toBe(true);
    expect(dataFreshness(AT, days(10), 90).stale).toBe(false);
    // 0 would make every load "stale"; that is a misconfiguration, not a state
    expect(dataFreshness(AT, days(0), 0).stale).toBe(false);
  });
});
