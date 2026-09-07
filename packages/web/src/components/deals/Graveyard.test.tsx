// @vitest-environment happy-dom
/**
 * DEALS YOU KILLED (P9), as it reads. Two things this test exists to hold:
 * nothing here frames a kill as a failure, and nothing on a headstone is
 * recomputed — what is on screen is what was frozen.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'preact-render-to-string';
import { CHIP_SPECS } from '@gil-bricks/core';
import { BOARD_COPY, GRAVEYARD, GRAVEYARD_COPY, parkReason } from '../../config/pipeline';
import { buildDeathSnapshot, headstones, type DealDeath, type Headstone } from '../../lib/deals/graveyard';
import { factTypeFor } from '../../lib/deals/facts';
import type { BoardDeal } from '../../lib/deals/board';
import type { DealFact } from '../../lib/deals/facts';
import { Graveyard } from './Graveyard';
import { withFlags } from '../../testing/flags';

// The evidence line inside a death card is flagged (A1).
withFlags({ evidenceChips: true });

const PARAMS = 'postcode=CF37+1HR&paon=44&price=120000&type=T&rent=950&refurbCost=20000';
const deal = (over: Partial<BoardDeal> = {}): BoardDeal => ({
  id: 'd1', strategy: 'btl', title: 'Terraced · CF37 1HR · £120,000', url_params: PARAMS,
  stage: 'parked-dead', current_score: 2.1, status: 'dead', headline_figure: 'ROI 3%',
  key_figure: 'ROI 3%', stage_since: '2026-09-04T09:00:00Z', is_auction: false,
  verdict_line: 'A different sentence entirely', updated_at: '2026-09-04T09:00:00Z', sold_evidence: 'null', ...over,
});
const quote: DealFact = {
  id: 'f1', deal_id: 'd1', fact_type: 'builder-quote', value: 48000, note: 'Two quotes, took the lower',
  entered_at: '2026-08-30T10:00:00Z', folded_at: null,
};
const snapshot = buildDeathSnapshot(
  { ...deal(), stage: 'offer-in', current_score: 8.4, verdict_line: 'The rent covers it twice over' },
  [quote],
);
const death = (over: Partial<DealDeath> = {}): DealDeath => ({
  id: 'x1', deal_id: 'd1', reason_key: 'refurb-too-high', note: 'Quote came back at twice my guess',
  snapshot, at: '2026-09-04T09:00:00Z', revived_at: null, ...over,
});

const html = (stones: Headstone[], over: Partial<Parameters<typeof Graveyard>[0]> = {}) => render(
  <Graveyard
    stones={stones} total={over.total ?? stones.length} hasMore={false} loadingMore={false} onMore={() => {}}
    open onToggle={() => {}} note="" busy={() => false} onRevive={() => {}} {...over}
  />,
);
const one = (d = death()) => headstones([deal()], [d]);
const many = (keys: string[]): Headstone[] => headstones(
  keys.map((_, i) => deal({ id: `d${i}` })),
  keys.map((k, i) => death({ id: `x${i}`, deal_id: `d${i}`, reason_key: k, at: `2026-09-${String(i + 1).padStart(2, '0')}T09:00:00Z` })),
);

describe('what the graveyard says', () => {
  it('names itself and the doctrine, and never calls a kill a failure', () => {
    const out = html(one());
    expect(out).toContain(GRAVEYARD_COPY.open);
    expect(out).toContain(GRAVEYARD_COPY.lead);
    for (const word of ['failed', 'failure', 'Failed', 'wasted', 'mistake']) expect(out).not.toContain(word);
  });

  it('is CLOSED until it is asked for — it never clutters the board', () => {
    const shut = html(one(), { open: false });
    expect(shut).toContain('aria-expanded="false"');
    expect(shut).not.toContain(GRAVEYARD_COPY.lead);
    expect(shut).toContain(GRAVEYARD_COPY.open); // still one tap away
  });

  it('counts every dead deal, even the ones not on screen — a window is not a total', () => {
    // the board holds a window; the heading must still say how many there are
    const out = html(one(), { total: 43, hasMore: true });
    expect(out).toContain('>43<');
    expect(out).toContain(BOARD_COPY.card.more);
  });

  it('offers nothing more when there is nothing more', () => {
    expect(html(one(), { total: 1, hasMore: false })).not.toContain(BOARD_COPY.card.more);
  });

  it('says plainly when nothing has been killed yet', () => {
    const out = html([]);
    expect(out).toContain(GRAVEYARD_COPY.empty);
    expect(out).not.toContain(GRAVEYARD_COPY.noPattern(0));
  });
});

describe('a headstone shows the card AS IT DIED', () => {
  it('the frozen score, the frozen verdict line and the stage it reached', () => {
    const out = html(one());
    expect(out).toContain('8.4');                              // what it died on
    expect(out).not.toContain('2.1');                          // not what the row says now
    expect(out).toContain('The rent covers it twice over');
    expect(out).not.toContain('A different sentence entirely');
    expect(out).toContain(GRAVEYARD_COPY.reached('Offer in'));
    expect(out).toContain(GRAVEYARD_COPY.scoreLabel('8.4'));
  });

  it('the reason, the note and the day — nothing more', () => {
    const out = html(one());
    expect(out).toContain(parkReason('refurb-too-high')?.label);
    expect(out).toContain('Quote came back at twice my guess');
    expect(out).toContain(GRAVEYARD_COPY.killed('4 Sep'));
  });

  it('the evidence chips it carried, and the facts it had learned', () => {
    const out = html(one());
    expect(out).toContain('ev-chip ev-evidenced');   // the builder's quote filled Refurb
    expect(out).toContain(factTypeFor('builder-quote')?.label);
    expect(out).toContain('£48,000');
  });

  it('but NOT the line telling you how to fix it — the deal is dead', () => {
    const out = html(one());
    expect(out).not.toContain('ev-line');
    expect(out).not.toContain(CHIP_SPECS.refurb.action);
  });

  it('shows the stage it reached even when it never had a score to freeze', () => {
    const unscored = { ...snapshot, score: null, verdictLine: '' };
    const out = html(one(death({ snapshot: unscored })));
    expect(out).toContain(GRAVEYARD_COPY.reached('Offer in'));
    expect(out).not.toContain('board-score');
  });

  it('a death from another year says which year — a graveyard is kept for years', () => {
    const old = html(one(death({ at: '2024-09-04T09:00:00Z' })));
    expect(old).toContain(GRAVEYARD_COPY.killed('4 Sept 2024'));
    // this year stays short, like every other date in the app
    const now = new Date();
    const thisYear = `${now.getFullYear()}-09-04T09:00:00Z`;
    expect(html(one(death({ at: thisYear })))).toContain(GRAVEYARD_COPY.killed('4 Sept'));
  });

  it('says so when the card was not kept, rather than inventing one', () => {
    const out = html(one(death({ snapshot: null })));
    expect(out).toContain(GRAVEYARD_COPY.noSnapshot);
    expect(out).not.toContain(GRAVEYARD_COPY.reached('Offer in'));
  });

  it('offers the way back, and a screen reader hears which deal', () => {
    const out = html(one());
    expect(out).toContain(GRAVEYARD_COPY.revive);
    // the announced name CONTAINS the visible words (WCAG label in name)
    expect(out).toContain(`${GRAVEYARD_COPY.revive}<span class="sr-only">${GRAVEYARD_COPY.reviveFor('Terraced · CF37 1HR · £120,000')}</span>`);
  });

  it('a busy deal cannot be brought back twice', () => {
    expect(html(one(), { busy: () => true })).toContain('disabled');
  });
});

describe('the pattern line on screen', () => {
  it('is the honest "not enough yet" until the threshold, with its sample', () => {
    const out = html(many(Array(GRAVEYARD.patternMin - 1).fill('refurb-too-high')));
    expect(out).toContain(GRAVEYARD_COPY.noPattern(GRAVEYARD.patternMin - 1));
    expect(out).toContain('gy-pattern-none');
  });

  it('speaks once the sample is real, and states it', () => {
    const out = html(many(Array(GRAVEYARD.patternMin).fill('refurb-too-high')));
    expect(out).toContain(GRAVEYARD_COPY.pattern(GRAVEYARD.patternMin, GRAVEYARD.patternMin, parkReason('refurb-too-high')!.diedOn));
    expect(out).toContain(parkReason('refurb-too-high')!.pattern);
    expect(out).not.toContain('gy-pattern-none');
  });
});
