// @vitest-environment happy-dom
/**
 * The dates a person sets (P8). Which are OFFERED is config, not a rule in the
 * component; and a date must be settable and clearable without a mouse.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'preact-render-to-string';
import { DealDates, datesFor } from './DealDates';

const html = (over: Partial<Parameters<typeof DealDates>[0]> = {}) => render(
  <DealDates
    dealId="d1" dealTitle="12 Test Street" stage="worth-a-look" isAuction={false}
    dates={{}} busy={false} onSet={() => {}} {...over}
  />,
);

describe('which dates a deal is offered', () => {
  it('a chase date on any live deal, and a viewing while you are still deciding', () => {
    expect(datesFor('worth-a-look', false).map((d) => d.key)).toEqual(['viewing_date', 'chase_date']);
    expect(datesFor('going-to-view', false).map((d) => d.key)).toContain('viewing_date');
    // once you have offered, a viewing date is behind you
    expect(datesFor('offer-in', false).map((d) => d.key)).not.toContain('viewing_date');
  });

  it('an auction date ONLY where the deal came from an auction', () => {
    expect(datesFor('offer-in', true).map((d) => d.key)).toContain('auction_date');
    expect(datesFor('offer-in', false).map((d) => d.key)).not.toContain('auction_date');
  });

  it('an exchange date only once the offer is accepted', () => {
    expect(datesFor('offer-accepted', false).map((d) => d.key)).toContain('exchange_date');
    expect(datesFor('nearly-there', false).map((d) => d.key)).toContain('exchange_date');
    expect(datesFor('worth-a-look', false).map((d) => d.key)).not.toContain('exchange_date');
    expect(datesFor('going-to-view', false).map((d) => d.key)).not.toContain('exchange_date');
  });
});

describe('the control itself', () => {
  it('is a real date input whose label a screen reader hears IN FULL', () => {
    const out = html();
    expect(out).toContain('type="date"');
    expect(out).toContain('for="date-chase_date-d1"');
    // the announced name contains the visible words, then the deal it belongs to
    expect(out).toContain('Set a chase date<span class="sr-only"> for 12 Test Street</span>');
  });

  it('shows the date once it is set, and offers to clear it', () => {
    const out = html({ dates: { chase_date: '2026-10-12' } });
    expect(out).toContain('Chase on 12 Oct');
    expect(out).toContain('dc-date-set');
    expect(out).toContain('Clear your chase date on 12 Test Street');
  });

  it('offers no Clear before a date exists', () => {
    expect(html()).not.toContain('dc-date-clear');
  });

  it('a date already set is ALWAYS shown, even at a stage that would not offer it', () => {
    // moved back down the board: the exchange date must stay visible, and clearable
    const out = html({ stage: 'going-to-view', dates: { exchange_date: '2026-11-02' } });
    expect(out).toContain('Exchange 2 Nov');
    expect(out).toContain('Clear exchange on 12 Test Street');
  });

  it('sets nothing by itself — the handler only runs on a change', () => {
    const onSet = vi.fn();
    html({ onSet });
    expect(onSet).not.toHaveBeenCalled();
  });
});
