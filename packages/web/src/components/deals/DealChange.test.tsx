// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { render } from 'preact-render-to-string';
import { DealChangeNote } from './DealChange';
import { CHANGE_COPY } from '../../config/pipeline';
import type { DealChange } from '../../lib/deals/changes';

/** The card's own announcement: what it shows, and what it never does by itself. */
const change = (over: Partial<DealChange> = {}): DealChange => ({
  id: 'c1', deal_id: 'd1', fact_type: 'builder-quote', fact_value: 48_000, previous_value: 30_000,
  from_score: 9.4, to_score: 6.8, to_verdict_line: '£16,341 would stay stuck after refinancing.',
  at: '2026-09-06T09:00:00.000Z', acknowledged_at: null, ...over,
});
const html = (c: DealChange, onPark = () => {}) =>
  render(<DealChangeNote change={c} dealTitle="12 Test Street" busy={false} onDismiss={() => {}} onPark={onPark} />);

describe('the change on the card', () => {
  it('names the fact, both scores, the consequence and the fix', () => {
    const out = html(change());
    expect(out).toContain('This was 9.4.');
    expect(out).toContain('£48,000');
    expect(out).toContain('£30,000');
    expect(out).toContain('down to 6.8');
    expect(out).toContain('£16,341 would stay stuck after refinancing.');
  });

  it('is dismissible, and says which deal it belongs to', () => {
    expect(html(change())).toContain(`aria-label="${CHANGE_COPY.dismissLabel('12 Test Street')}"`);
    expect(html(change())).toContain(CHANGE_COPY.dismiss);
  });

  it('good news is marked as good news, not as a warning', () => {
    expect(html(change({ from_score: 6.8, to_score: 8.1 }))).toContain('change-better');
    expect(html(change())).toContain('change-worse');
  });

  it('offers to park a deal a fact has killed — and only offers', () => {
    const killed = html(change({ from_score: 7.1, to_score: 4.3 }));
    expect(killed).toContain(CHANGE_COPY.killOffer);
    expect(killed).toContain(CHANGE_COPY.killPark);
    expect(killed).toContain(`aria-label="${CHANGE_COPY.killParkLabel('12 Test Street')}"`);
  });

  it('never offers to park a deal that is merely worse', () => {
    expect(html(change())).not.toContain(CHANGE_COPY.killPark);
    expect(html(change())).not.toContain(CHANGE_COPY.killOffer);
  });

  it('parks nothing on its own: the button only runs on a tap', () => {
    const onPark = vi.fn();
    html(change({ from_score: 7.1, to_score: 4.3 }), onPark);
    expect(onPark).not.toHaveBeenCalled();
  });
});
