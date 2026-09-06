/**
 * VERDICT-CHANGE MESSAGING (P6).
 *
 * Two things are tested here: WHEN the deal speaks, and WHAT it says. The
 * sentences are assembled from config, so this is also the record of the exact
 * words the operator will read on the card.
 */
import { describe, expect, it } from 'vitest';
import { verdictForScore } from '@gil-bricks/core';
import { changeLine, isKilled, isNews, unseen, type DealChange, cashIsNews } from './changes';
import { CHANGE_RULES } from '../../config/pipeline';

const change = (over: Partial<DealChange> = {}): DealChange => ({
  id: 'c1', deal_id: 'd1', fact_type: 'builder-quote', fact_value: 48_000, previous_value: 30_000,
  from_score: 9.4, to_score: 6.8, to_verdict_line: '£16,341 would stay stuck after refinancing — pay £90,000 or less to get it all back out.',
  at: '2026-09-06T09:00:00.000Z', acknowledged_at: null, ...over,
});

describe('when a change is news', () => {
  it('crossing a verdict band always is — the ANSWER changed, not just the number', () => {
    expect(verdictForScore(8.1)).not.toBe(verdictForScore(7.9));
    expect(isNews(8.1, 7.9)).toBe(true); // good → marginal
    expect(isNews(6.1, 5.9)).toBe(true); // marginal → walk away
    expect(isNews(5.9, 6.1)).toBe(true); // and back up again
  });

  it('a tenth of a point inside one band is noise', () => {
    expect(isNews(7.3, 7.2)).toBe(false);
    expect(isNews(9.5, 9.3)).toBe(false);
    expect(isNews(2.2, 1.6)).toBe(false);
  });

  it('a full point inside one band is news, because that is half a band', () => {
    expect(CHANGE_RULES.minPoints).toBe(1);
    expect(isNews(7.9, 6.9)).toBe(true);
    expect(isNews(6.9, 7.9)).toBe(true);
    expect(isNews(7.9, 7.0)).toBe(false); // 0.9 — still inside the slack
  });

  it('a score that did not move says nothing at all', () => {
    expect(isNews(7.3, 7.3)).toBe(false);
    expect(isNews(Number.NaN, 7)).toBe(false);
  });
});

describe('what it says', () => {
  it('the builder’s quote on the seeded BRRRR', () => {
    const l = changeLine(change());
    expect(`${l.was} ${l.moves} ${l.verdict}`).toBe(
      'This was 9.4. The builder’s quote £48,000 — you’d put £30,000 — moves it down to 6.8. '
      + '£16,341 would stay stuck after refinancing — pay £90,000 or less to get it all back out.',
    );
    expect(l.better).toBe(false);
    expect(l.killed).toBe(false);
  });

  it('a down-valuation that came in ABOVE the assumption is good news, said the same way', () => {
    const l = changeLine(change({
      fact_type: 'down-valuation', fact_value: 230_000, previous_value: 200_000,
      from_score: 6.8, to_score: 8.1,
      to_verdict_line: 'All your cash back out plus £8,400, and it still cashflows £131 a month.',
    }));
    expect(`${l.was} ${l.moves} ${l.verdict}`).toBe(
      'This was 6.8. The down-valuation £230,000 — you’d put £200,000 — moves it up to 8.1. '
      + 'All your cash back out plus £8,400, and it still cashflows £131 a month.',
    );
    expect(l.better).toBe(true);
    expect(l.killed).toBe(false);
  });

  it('a fact that takes the deal below walk-away says so, and offers nothing else', () => {
    const l = changeLine(change({
      fact_type: 'survey-finding', fact_value: 22_000, previous_value: null,
      from_score: 7.1, to_score: 4.3,
      to_verdict_line: 'Just 3.1% back on the cash you’d tie up, short of the 8.0% that makes the risk worth it.',
    }));
    expect(`${l.was} ${l.moves} ${l.verdict}`).toBe(
      'This was 7.1. The survey finding £22,000 moves it down to 4.3. '
      + 'Just 3.1% back on the cash you’d tie up, short of the 8.0% that makes the risk worth it.',
    );
    expect(l.killed).toBe(true);
  });

  it('an added cost names no earlier figure, because there was none to name', () => {
    expect(changeLine(change({ fact_type: 'auction-fees', fact_value: 3_200, previous_value: null })).moves)
      .toBe('The auction fees £3,200 moves it down to 6.8.');
  });

  it('only a deal that has just fallen below walk-away is killed', () => {
    expect(isKilled(change({ from_score: 7.1, to_score: 4.3 }))).toBe(true);
    expect(isKilled(change({ from_score: 4.3, to_score: 3.1 })), 'it was already there').toBe(false);
    expect(isKilled(change({ from_score: 9.4, to_score: 6.8 }))).toBe(false);
  });
});

describe('a change nobody has seen', () => {
  it('is listed newest first, per deal, and disappears once acknowledged', () => {
    const a = change({ id: 'a', at: '2026-09-01T00:00:00Z' });
    const b = change({ id: 'b', at: '2026-09-05T00:00:00Z' });
    const seen = change({ id: 'c', at: '2026-09-06T00:00:00Z', acknowledged_at: '2026-09-06T10:00:00Z' });
    const other = change({ id: 'd', deal_id: 'd2' });
    expect(unseen([a, b, seen, other], 'd1').map((c) => c.id)).toEqual(['b', 'a']);
    expect(unseen([seen], 'd1')).toEqual([]);
  });
});

/**
 * D4 — a fact can move the money you must find without moving the score. That
 * is news on its own, and the line has to make sense when the score is identical.
 */
describe('the cash needed moved (D4)', () => {
  const base = {
    id: 'c1', deal_id: 'd1', fact_type: 'builder-quote', fact_value: 25000, previous_value: null,
    from_score: 7, to_score: 7, to_verdict_line: 'Only £69 a month left.', at: '2026-09-06T10:00:00Z',
    acknowledged_at: null,
  };

  it('is news above the configured swing, and silence below it', () => {
    expect(cashIsNews(47000, 72000)).toBe(true);
    expect(cashIsNews(47000, 47500)).toBe(false);
    expect(cashIsNews(72000, 47000), 'a fall is news too').toBe(true);
    expect(cashIsNews(null, 72000), 'an older row carries no figures').toBe(false);
    expect(cashIsNews(47000, null)).toBe(false);
  });

  it('names both figures, and when the score did not move the cash IS the story', () => {
    const line = changeLine({ ...base, from_cash: 47000, to_cash: 72000 });
    expect(line.cash).toContain('£72,000');
    expect(line.cash).toContain('£47,000');
    expect(line.cashOnly, 'the score is identical').toBe(true);
  });

  it('rides alongside a score move without taking it over', () => {
    const line = changeLine({ ...base, to_score: 6.8, from_score: 6.9, from_cash: 44744, to_cash: 69744 });
    expect(line.cash).toContain('£69,744');
    expect(line.cashOnly).toBe(false);
    expect(line.moves).toContain('6.8');
  });

  it('says nothing about cash when it barely moved', () => {
    expect(changeLine({ ...base, from_cash: 47000, to_cash: 47100 }).cash).toBeNull();
  });
});
