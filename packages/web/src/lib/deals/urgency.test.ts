/**
 * WHAT NEEDS YOU TODAY (P8) — the ranking, against a board that looks like the
 * seeded one: deals at every stage and every age. A line that cries wolf is
 * worse than no line, so each scenario asserts the ONE deal it should pick and
 * why, not merely that it picked something.
 */
import { describe, expect, it } from 'vitest';
import { datesOn, endOfDay, mostUrgent, priceOf, rankUrgent } from './urgency';
import { datesShown } from '../../components/deals/DealDates';
import type { BoardDeal } from './board';
import type { DealFact } from './facts';
import type { DealChange } from './changes';
import { URGENCY } from '../../config/pipeline';
import { features } from '../../config/features';
import { withFlags } from '../../testing/flags';

// The tiers this file exercises are flagged. Force them ON rather than trusting
// the repo default, so the suite still tests them with every flag off (A1).
withFlags({ dealDates: true, evidenceChips: true, cashNeededChange: true });

const NOW = Date.parse('2026-09-20T12:00:00Z');
const daysAgo = (n: number): string => new Date(NOW - n * 86_400_000).toISOString();
const isoDate = (n: number): string => new Date(NOW + n * 86_400_000).toISOString().slice(0, 10);

const deal = (over: Partial<BoardDeal> & { id: string }): BoardDeal => ({
  strategy: 'btl', title: over.id, url_params: 'postcode=CF37+1HR&paon=12&price=150000&type=T&rent=1200&refurbCost=30000',
  stage: 'worth-a-look', current_score: 7.2, status: 'live', headline_figure: 'ROI 8%', key_figure: 'ROI 8%',
  stage_since: daysAgo(0), is_auction: false, verdict_line: 'Cashflows.', updated_at: daysAgo(0),
  sold_evidence: '{"estimate":157500,"high":172500}', ...over,
} as BoardDeal);

const fact = (dealId: string, type: string): DealFact =>
  ({ id: `${dealId}-${type}`, deal_id: dealId, fact_type: type, value: 48_000, entered_at: daysAgo(1) });
const change = (dealId: string, over: Partial<DealChange> = {}): DealChange => ({
  id: `c-${dealId}`, deal_id: dealId, fact_type: 'builder-quote', fact_value: 48_000, previous_value: 30_000,
  from_score: 9.4, to_score: 6.8, to_verdict_line: 'x', at: daysAgo(1), acknowledged_at: null, ...over,
});
const run = (deals: BoardDeal[], facts: DealFact[] = [], changes: DealChange[] = []) =>
  mostUrgent({ deals, facts, changes, now: NOW });

/** A deal whose refurb AND rent are evidenced, so tier (d) never fires by accident. */
const quoted = (id: string): DealFact[] => [fact(id, 'builder-quote'), fact(id, 'rent-agreed')];

describe('the flags really turn their tiers off', () => {
  it('with dealDates off a stored date no longer owns the line', () => {
    const board = [deal({ id: 'dated', stage: 'nearly-there', exchange_date: isoDate(1), stage_since: daysAgo(1) })];
    expect(run(board, quoted('dated'))?.reason).toBe('deadline');
    features.dealDates = false;
    expect(run(board, quoted('dated'))).toBeNull();
    features.dealDates = true;
  });

  it('with evidenceChips off the missing-evidence tier is silent', () => {
    const board = [deal({ id: 'guessing', stage: 'getting-real-numbers', stage_since: daysAgo(1) })];
    expect(run(board)?.reason).toBe('missing-evidence');
    features.evidenceChips = false;
    expect(run(board)).toBeNull();
    features.evidenceChips = true;
  });
});

describe('dates the person can still see', () => {
  it('the CLOSEST date in range wins, so an ancient chase cannot hide tomorrow’s auction', () => {
    const board = [deal({
      id: 'both', stage: 'offer-in', is_auction: true, stage_since: daysAgo(1),
      chase_date: '2024-01-01', auction_date: isoDate(1),
    })];
    const top = run(board, quoted('both'));
    expect(top?.text).toContain('the auction is tomorrow');
  });

  it('a date stranded by a stage move stops shouting — but is never hidden', () => {
    // the chain fell through: the deal is back at going-to-view, and the
    // exchange date it carried is no longer about anything
    const stranded = deal({ id: 'stranded', stage: 'going-to-view', stage_since: daysAgo(1), exchange_date: isoDate(1) });
    expect(datesOn(stranded)).toEqual([]);
    expect(run([stranded], quoted('stranded'))).toBeNull();
    // the card still shows it, so it can still be cleared
    expect(datesShown('going-to-view', false, { exchange_date: isoDate(1) }).map((d) => d.key)).toContain('exchange_date');
    // and back at the right stage it ranks again
    const back = deal({ id: 'back', stage: 'nearly-there', stage_since: daysAgo(1), exchange_date: isoDate(1) });
    expect(run([back], quoted('back'))?.reason).toBe('deadline');
  });

  it('an auction date on a deal that is not an auction never ranks', () => {
    const d = deal({ id: 'noauction', stage: 'offer-in', stage_since: daysAgo(1), is_auction: false, auction_date: isoDate(1) });
    expect(datesOn(d)).toEqual([]);
  });

  it('reads the end of the day in the reader’s own time, not UTC', () => {
    // 23:59:59Z is 00:59:59 the NEXT day in British Summer Time
    const day = new Date(NOW).toISOString().slice(0, 10);
    expect(endOfDay(day)).toBe(new Date(new Date(NOW).getFullYear(), new Date(NOW).getMonth(), new Date(NOW).getDate(), 23, 59, 59, 999).getTime());
  });
});

describe('the ranking, in strict order', () => {
  it('1. a date you set inside 48 hours beats everything else on the board', () => {
    const board = [
      deal({ id: 'rotting', stage: 'offer-in', stage_since: daysAgo(30) }),
      deal({ id: 'unread', stage: 'going-to-view' }),
      deal({ id: 'dated', stage: 'nearly-there', exchange_date: isoDate(1) }),
    ];
    const top = run(board, [...quoted('rotting'), ...quoted('unread'), ...quoted('dated')], [change('unread')]);
    expect(top?.deal.id).toBe('dated');
    expect(top?.reason).toBe('deadline');
    expect(top?.text).toBe('Chase exchange on dated — exchange is tomorrow.');
  });

  it('2. an unread verdict change beats a stale deal and a guessed number', () => {
    const board = [
      deal({ id: 'rotting', stage: 'offer-in', stage_since: daysAgo(30) }),
      deal({ id: 'unread', stage: 'going-to-view' }),
    ];
    const top = run(board, [...quoted('rotting'), ...quoted('unread')], [change('unread')]);
    expect(top?.deal.id).toBe('unread');
    expect(top?.text).toBe('Read what changed on unread — the answer moved to 6.8.');
  });

  it('3. an acknowledged change is not urgent — you have already read it', () => {
    const board = [deal({ id: 'read', stage: 'going-to-view' })];
    expect(run(board, quoted('read'), [change('read', { acknowledged_at: daysAgo(0) })])).toBeNull();
  });

  it('4. staleness beats a guessed number, and is stage-aware', () => {
    const board = [
      // three weeks waiting on searches is NORMAL — 21 days is the stage's own dwell
      deal({ id: 'searches', stage: 'offer-accepted', stage_since: daysAgo(21) }),
      // nine days on an unanswered offer is not
      deal({ id: 'offer', stage: 'offer-in', stage_since: daysAgo(9) }),
    ];
    const top = run(board, [...quoted('searches'), ...quoted('offer')]);
    expect(top?.deal.id).toBe('offer');
    expect(top?.reason).toBe('stale');
    expect(top?.text).toBe('Chase the agent on offer — 9 days at this stage.');
  });

  it('5. a decision resting on a guess is urgent, quietly, and last', () => {
    const board = [deal({ id: 'guessing', stage: 'getting-real-numbers', stage_since: daysAgo(1) })];
    const top = run(board); // no builder's quote anywhere
    expect(top?.reason).toBe('missing-evidence');
    expect(top?.text).toBe('Get a builder’s number for guessing — you are at getting real numbers on a guess.');
  });

  it('6. a high-scoring deal quietly rotting beats a fresh bad one', () => {
    const board = [
      deal({ id: 'fresh-dog', current_score: 2.1, stage: 'worth-a-look', stage_since: daysAgo(0) }),
      deal({ id: 'rotting-gem', current_score: 9.4, stage: 'offer-in', stage_since: daysAgo(12) }),
    ];
    const top = run(board, [...quoted('fresh-dog'), ...quoted('rotting-gem')]);
    expect(top?.deal.id).toBe('rotting-gem');
  });

  it('7. a tie inside one tier goes to the money at stake', () => {
    const board = [
      deal({ id: 'small', stage: 'offer-in', stage_since: daysAgo(9), url_params: 'postcode=CF37+1HR&price=95000&rent=800&refurbCost=1' }),
      deal({ id: 'big', stage: 'offer-in', stage_since: daysAgo(9), url_params: 'postcode=CF37+1HR&price=420000&rent=2400&refurbCost=1' }),
    ];
    const top = run(board, [...quoted('small'), ...quoted('big')]);
    expect(top?.deal.id).toBe('big');
    expect(priceOf(board[1])).toBe(420_000);
  });

  it('8. nothing is invented: a quiet board qualifies nothing at all', () => {
    const board = [
      deal({ id: 'fresh', stage: 'worth-a-look', stage_since: daysAgo(1) }),
      deal({ id: 'searches', stage: 'offer-accepted', stage_since: daysAgo(14) }),
      deal({ id: 'bought', stage: 'bought-it', status: 'done', stage_since: daysAgo(90) }),
      deal({ id: 'parked', stage: 'parked-dead', status: 'dead', stage_since: daysAgo(90) }),
    ];
    expect(run(board, [...quoted('fresh'), ...quoted('searches')])).toBeNull();
  });

  it('9. a date further out than the window is not urgent yet', () => {
    const board = [deal({ id: 'later', stage: 'nearly-there', chase_date: isoDate(6) })];
    // (its refurb and rent are evidenced, so nothing else is urgent either)
    expect(run(board, quoted('later'))).toBeNull();
    expect(URGENCY.deadlineWithinHours).toBe(48);
  });

  it('10. a parked or bought deal never needs you', () => {
    const board = [
      deal({ id: 'dead', status: 'dead', stage: 'parked-dead', stage_since: daysAgo(99), chase_date: isoDate(0) }),
      deal({ id: 'done', status: 'done', stage: 'bought-it', stage_since: daysAgo(99) }),
    ];
    expect(run(board)).toBeNull();
  });

  it('ranks every qualifying deal, tier first, so P10 can read the same list', () => {
    const board = [
      deal({ id: 'stale', stage: 'offer-in', stage_since: daysAgo(9) }),
      deal({ id: 'dated', stage: 'nearly-there', exchange_date: isoDate(1) }),
      deal({ id: 'unread', stage: 'going-to-view' }),
    ];
    const all = rankUrgent({ deals: board, facts: [...quoted('stale'), ...quoted('dated'), ...quoted('unread')], changes: [change('unread')], now: NOW });
    expect(all.map((u) => u.reason)).toEqual(['deadline', 'unread-change', 'stale']);
  });
});

describe('the cash-only change (A1) — the one product change the flags-off ruling produced', () => {
  const cashRow = (id: string) => change(id, { from_score: 7.0, to_score: 7.0, from_cash: 47_000, to_cash: 72_000 });

  it('with the flag on, the line names the CASH, not a score that did not move', () => {
    const board = [deal({ id: 'cash', stage: 'getting-real-numbers', stage_since: daysAgo(1), current_score: 7 })];
    const top = run(board, quoted('cash'), [cashRow('cash')]);
    expect(top?.reason).toBe('unread-change');
    expect(top?.text).toContain('£72,000');
    expect(top?.text).not.toContain('7.0');
  });

  it('with the flag OFF the row is silent — it never claims the answer moved', () => {
    const board = [deal({ id: 'cash', stage: 'getting-real-numbers', stage_since: daysAgo(1), current_score: 7 })];
    features.cashNeededChange = false;
    const top = run(board, quoted('cash'), [cashRow('cash')]);
    // Not "the answer moved to 7.0" — it did not move. The tier is simply not
    // this deal's reason any more.
    expect(top?.reason).not.toBe('unread-change');
  });

  it('a row whose SCORE moved is still announced with the flag off', () => {
    const board = [deal({ id: 'moved', stage: 'getting-real-numbers', stage_since: daysAgo(1) })];
    features.cashNeededChange = false;
    expect(run(board, quoted('moved'), [change('moved')])?.reason).toBe('unread-change');
  });
});
