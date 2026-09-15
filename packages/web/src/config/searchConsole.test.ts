/**
 * S1 — the cliff detector, tested without a network or a credential.
 *
 * This is the half of the monitoring that can be wrong in a way nobody notices:
 * an alert that never fires looks exactly like a site that is fine. So the
 * comparison is a pure function and every threshold is exercised in both
 * directions — fires when it should, stays quiet when it should not.
 */
import { describe, expect, it } from 'vitest';
import { findCliffs, SEARCH_MONITOR, type SearchSnapshot } from './searchConsole';

/** A run of days, newest last, with the lag days padded on the end. */
function series(spec: { impressions: number; clicks: number; position: number; indexed?: number | null }[]): SearchSnapshot[] {
  return spec.map((s, i) => ({
    day: `2026-01-${String(i + 1).padStart(2, '0')}`,
    impressions: s.impressions,
    clicks: s.clicks,
    position: s.position,
    indexed: s.indexed ?? null,
  }));
}
const flat = (n: number, imp: number, clicks: number, pos: number, indexed: number | null = null) =>
  Array.from({ length: n }, () => ({ impressions: imp, clicks, position: pos, indexed }));

const verdict = (rows: SearchSnapshot[], id: string) => findCliffs(rows).find((v) => v.id === id);

describe('the cliff detector', () => {
  it('says so plainly when there is not enough history to judge', () => {
    const v = findCliffs(series(flat(5, 100, 10, 8)));
    expect(v[0]?.id).toBe('history');
    expect(v[0]?.fell).toBe(false);
    expect(v[0]?.detail).toMatch(/need \d+ before a comparison means anything/);
  });

  it('stays QUIET when nothing has changed', () => {
    const rows = series(flat(17, 100, 10, 8, 19));
    for (const v of findCliffs(rows)) expect(v.fell, `${v.id}: ${v.detail}`).toBe(false);
  });

  it('FIRES when impressions halve', () => {
    const rows = series([...flat(7, 200, 20, 8, 19), ...flat(7, 90, 9, 8, 19), ...flat(3, 90, 9, 8, 19)]);
    expect(verdict(rows, 'impressions')?.fell).toBe(true);
    expect(verdict(rows, 'impressions')?.detail).toMatch(/1400 → 630/);
  });

  it('does NOT fire on a drop that is merely a bad week', () => {
    // 1400 → 1050 is 25% down: real, not a cliff. An alert here gets muted.
    const rows = series([...flat(7, 200, 20, 8, 19), ...flat(7, 150, 15, 8, 19), ...flat(3, 150, 15, 8, 19)]);
    expect(verdict(rows, 'impressions')?.fell).toBe(false);
  });

  it('refuses to judge tiny numbers, and says why', () => {
    // 6 impressions → 1 is a 83% "drop" and means nothing at all.
    const rows = series([...flat(7, 1, 0, 8), ...flat(7, 0, 0, 0), ...flat(3, 0, 0, 0)]);
    const v = verdict(rows, 'impressions');
    expect(v?.fell).toBe(false);
    expect(v?.detail).toMatch(/below the floor/);
  });

  it('FIRES when indexation falls by a fifth — the one that matters most', () => {
    const rows = series([...flat(7, 200, 20, 8, 20), ...flat(7, 200, 20, 8, 15), ...flat(3, 200, 20, 8, 15)]);
    expect(verdict(rows, 'indexed')?.fell).toBe(true);
    expect(verdict(rows, 'indexed')?.detail).toMatch(/20 → 15/);
  });

  it('FIRES when average position gets materially worse', () => {
    const rows = series([...flat(7, 200, 20, 8, 19), ...flat(7, 200, 20, 20, 19), ...flat(3, 200, 20, 20, 19)]);
    expect(verdict(rows, 'position')?.fell).toBe(true);
  });

  it('weights position by impressions, so a quiet day cannot outvote a busy one', () => {
    /**
     * The trap a naive average walks into: one day with 2 impressions at
     * position 1 alongside six days of 2,000 at position 30 is not "position
     * 25.9". Weighted, it is barely different from 30.
     */
    const earlier = [...flat(6, 2000, 100, 30, 19), { impressions: 2, clicks: 0, position: 1, indexed: 19 }];
    const rows = series([...earlier, ...flat(7, 2000, 100, 30, 19), ...flat(3, 2000, 100, 30, 19)]);
    const v = verdict(rows, 'position');
    expect(v?.fell).toBe(false);
    // Weighted, the 2-impression day at position 1 barely registers: the
    // earlier window stays at 30.0. An UNWEIGHTED mean of those seven days
    // would be 25.9, which would then read as a 4-place "improvement" that
    // never happened — and, in the other direction, could mask a real fall.
    expect(v?.detail).toMatch(/30\.0 → 30\.0/);
    const unweighted = (30 * 6 + 1) / 7;
    expect(unweighted).toBeLessThan(26);
  });

  it('ignores the most recent days, because Search Console data lags', () => {
    /**
     * Without the lag offset the newest — half-filled — days read as a
     * collapse every single day. Here the last 3 days are empty and must be
     * excluded rather than alerted on.
     */
    const rows = series([...flat(7, 200, 20, 8, 19), ...flat(7, 200, 20, 8, 19), ...flat(3, 0, 0, 0, 19)]);
    expect(verdict(rows, 'impressions')?.fell).toBe(false);
    expect(SEARCH_MONITOR.lagDays).toBeGreaterThanOrEqual(2);
  });

  it('every threshold is a number somebody can tune without touching code', () => {
    for (const [k, v] of Object.entries(SEARCH_MONITOR)) {
      expect(typeof v, k).toBe('number');
    }
  });
});
