/**
 * C1 — WHO IS TOLD THAT THE COMPARABLES MOVED, AND WHO IS NOT.
 *
 * Both halves matter. A note on every deal is noise nobody reads; a note on
 * none is a saved judgement quietly resting on evidence that has changed.
 */
import { describe, expect, it } from 'vitest';
import { COMPARABLES_CHANGED } from '../../config/pipeline';
import { comparablesMoved } from './comparablesMoved';

const deal = (over: Record<string, unknown> = {}) => ({
  status: 'live', updated_at: '2026-09-01T10:00:00Z', url_params: 'postcode=CF37+1HR&price=200000',
  ...over,
} as never);

describe('a deal judged against the old set of sales', () => {
  it('is told, once, on its own page', () => {
    expect(comparablesMoved(deal())).toBe(true);
  });

  it('and stops being told the moment it is re-run', () => {
    expect(comparablesMoved(deal({ updated_at: `${COMPARABLES_CHANGED.at}T09:00:00Z` }))).toBe(false);
  });

  /** Their own filters still apply exactly as they did, so nothing has moved. */
  it.each(['radius=1', 'period=6', 'ctype=F'])(
    'is not told when the person set the filters themselves (%s)', (pinned) => {
      expect(comparablesMoved(deal({ url_params: `postcode=CF37+1HR&${pinned}` }))).toBe(false);
    },
  );

  it('a deal that is not live is not told — it is not being worked', () => {
    expect(comparablesMoved(deal({ status: 'killed' }))).toBe(false);
  });

  /** No date is not evidence that it is old. Silence beats a guess. */
  it('and a deal with no usable date is not told either', () => {
    expect(comparablesMoved(deal({ updated_at: '' }))).toBe(false);
    expect(comparablesMoved(deal({ updated_at: null }))).toBe(false);
  });
});
