/**
 * THE HANDOVER GUARANTEE (P11).
 *
 * docs/PIPELINE_CONFIG.md promises the operator that every knob in this file
 * changes what it says it changes, without touching code. A promise nobody
 * checks is a promise that rots — so this turns each knob and asserts the
 * product actually moved.
 *
 * Every test restores the value it changed: these are the REAL config objects.
 */
import { describe, expect, it } from 'vitest';
import { verdictForScore } from '@gil-bricks/core';
import {
  AUCTION_WARNING_STAGE, BOARD_PAGE, CHAIN_RISK, CHANGE_RULES, DEAL_DATES, GRAVEYARD, LIVE_CAP_MESSAGE, MAX_LIVE_DEALS,
  PARK_REASONS, PROGRESS_STAGES, RETRADE, URGENCY, dateAppliesAt, parkReason,
} from './pipeline';
import { canAddLiveDeal } from '../worker/lib/pipeline';
import { auctionWarningDue, chainRiskDue, dwellState, nextStepLine, type BoardDeal } from '../lib/deals/board';
import { isNews } from '../lib/deals/changes';
import { headstones, patternIn, type DealDeath } from '../lib/deals/graveyard';
import { todayLine } from '../lib/deals/urgency';
import { retradeFor } from '../lib/deals/retrade';
import { features } from './features';

/** Turn a knob, look, put it back. */
function turn<T extends object, K extends keyof T>(obj: T, key: K, value: T[K], look: () => void): void {
  const kept = obj[key];
  try {
    (obj as Record<K, T[K]>)[key] = value;
    look();
  } finally {
    (obj as Record<K, T[K]>)[key] = kept;
  }
}

const DAY = 86_400_000;
const now = Date.parse('2026-09-06T09:00:00Z');
const deal = (over: Partial<BoardDeal> = {}): BoardDeal => ({
  id: 'd1', strategy: 'btl', title: 'Terraced · CF37 1HR · £185,000',
  url_params: 'postcode=CF37+1HR&price=185000&rent=1800&refurbCost=15000',
  stage: 'offer-in', current_score: 7.2, status: 'live', headline_figure: 'ROI 7%', key_figure: 'ROI 7%',
  stage_since: new Date(now - 5 * DAY).toISOString(), is_auction: false, verdict_line: 'Cashflows.',
  updated_at: '2026-09-01T00:00:00Z', sold_evidence: 'null', ...over,
});

describe('every knob moves what it says it moves', () => {
  it('1. MAX_LIVE_DEALS — how many live deals you can hold', () => {
    expect(canAddLiveDeal(MAX_LIVE_DEALS - 1)).toBe(true);
    expect(canAddLiveDeal(MAX_LIVE_DEALS)).toBe(false);
    // the message the board shows at the cap names the same number
    expect(LIVE_CAP_MESSAGE).toContain(String(MAX_LIVE_DEALS));
  });

  it('2. a stage’s dwell days — when a deal starts to look stale', () => {
    const offerIn = PROGRESS_STAGES.find((s) => s.key === 'offer-in') as { dwellNormalDays: number; dwellColdDays: number };
    const d = deal(); // five days at offer-in
    expect(dwellState(d, now)).toBe('amber'); // normal is 4 days
    turn(offerIn, 'dwellNormalDays', 30, () => {
      expect(dwellState(d, now), 'a longer normal dwell makes the same deal fresh').toBe('fresh');
      expect(nextStepLine(d, now)).not.toContain('no update');
    });
    turn(offerIn, 'dwellColdDays', 2, () => {
      expect(dwellState(d, now), 'a shorter cold dwell makes it cold').toBe('cold');
    });
  });

  it('3. URGENCY.order — what the today line shouts about first', () => {
    const stale = deal({ id: 'a', stage_since: new Date(now - 40 * DAY).toISOString() });
    const changed = deal({ id: 'b', url_params: 'postcode=CF37+1HR&price=999999&rent=1800' });
    const changes = [{
      id: 'c1', deal_id: 'b', fact_type: 'builder-quote', fact_value: 40_000, previous_value: 15_000,
      from_score: 9.3, to_score: 4.1, to_verdict_line: 'x', at: '2026-09-05T00:00:00Z', acknowledged_at: null,
    }];
    const input = { deals: [stale, changed], facts: [], changes, now };
    expect(todayLine(input).dealId, 'unread-change outranks stale by default').toBe('b');
    turn(URGENCY as unknown as { order: readonly string[] }, 'order', ['stale', 'unread-change', 'deadline', 'missing-evidence'], () => {
      expect(todayLine(input).dealId, 'reorder the tiers and the line follows').toBe('a');
    });
  });

  it('4. GRAVEYARD.patternMin — when a pattern is worth saying', () => {
    const deaths: DealDeath[] = Array.from({ length: 3 }, (_, i) => ({
      id: `x${i}`, deal_id: `d${i}`, reason_key: 'survey', note: '', snapshot: null,
      at: `2026-09-0${i + 1}T09:00:00Z`, revived_at: null,
    }));
    const stones = headstones(deaths.map((x, i) => deal({ id: `d${i}`, status: 'dead', stage: 'parked-dead' })), deaths);
    expect(patternIn(stones), 'three is not a pattern at the default of five').toBeNull();
    turn(GRAVEYARD as unknown as { patternMin: number }, 'patternMin', 3, () => {
      expect(patternIn(stones)?.count, 'lower the bar and it speaks').toBe(3);
    });
  });

  it('5. CHANGE_RULES — when a score move is news', () => {
    expect(isNews(9.0, 8.6), 'inside a band, under a point: quiet').toBe(false);
    turn(CHANGE_RULES as unknown as { minPoints: number }, 'minPoints', 0.2, () => {
      expect(isNews(9.0, 8.6), 'a smaller minimum makes it news').toBe(true);
    });
    expect(isNews(8.1, 7.9), 'crossing a band always announces').toBe(true);
    turn(CHANGE_RULES as unknown as { onBandChange: boolean }, 'onBandChange', false, () => {
      expect(isNews(8.1, 7.9), 'switch band-crossing off and a small move is quiet again').toBe(false);
    });
  });

  it('6. RETRADE.facts — which facts open the re-trade radar', () => {
    const survey = [{
      id: 'f1', deal_id: 'd1', fact_type: 'survey-finding', value: 14_000, note: '',
      entered_at: '2026-09-04T10:00:00Z', folded_at: null,
    }];
    expect(retradeFor(deal(), survey)).not.toBeNull();
    turn(RETRADE as unknown as { facts: readonly string[] }, 'facts', ['down-valuation'], () => {
      expect(retradeFor(deal(), survey), 'take a fact off the list and the radar stays shut').toBeNull();
    });
  });

  it('7. CHAIN_RISK.stage — where the "accepted is not safe" card appears', () => {
    // The card is flagged, so force the flag rather than trusting the default —
    // otherwise this knob stops being tested the moment the flag goes off (A1).
    turn(features, 'chainRisk', true, () => {
      const accepted = deal({ stage: 'offer-accepted' });
      const nearly = deal({ stage: 'nearly-there' });
      expect(chainRiskDue(accepted)).toBe(true);
      expect(chainRiskDue(nearly)).toBe(false);
      turn(CHAIN_RISK as unknown as { stage: string }, 'stage', 'nearly-there', () => {
        expect(chainRiskDue(nearly), 'move the knob and the card moves with it').toBe(true);
        expect(chainRiskDue(accepted)).toBe(false);
      });
      // and it is only ever for a LIVE deal that has not read it
      expect(chainRiskDue({ ...accepted, status: 'dead' })).toBe(false);
      expect(chainRiskDue({ ...accepted, chain_ack_at: '2026-09-06T00:00:00Z' })).toBe(false);
    });
  });

  it('7b. AUCTION_WARNING_STAGE — where the legal-pack warning shows', () => {
    const auction = deal({ is_auction: true, stage: 'offer-in' });
    expect(auctionWarningDue(auction)).toBe(true);
    expect(auctionWarningDue({ ...auction, is_auction: false })).toBe(false);
    expect(auctionWarningDue({ ...auction, stage: 'going-to-view' })).toBe(false);
  });

  it('8. DEAL_DATES — which dates a deal is offered, and where', () => {
    const viewing = DEAL_DATES.find((d) => d.key === 'viewing_date')!;
    expect(dateAppliesAt(viewing, 'offer-in', false)).toBe(false);
    turn(viewing as unknown as { stages?: readonly string[] }, 'stages', undefined, () => {
      expect(dateAppliesAt(viewing, 'offer-in', false), 'no stage list means every stage').toBe(true);
    });
  });

  it('9. PARK_REASONS — the reasons a deal can die, and what a run of them means', () => {
    expect(parkReason('chain-fell')?.label).toBe('Chain fell through');
    turn(parkReason('chain-fell') as unknown as { label: string }, 'label', 'The chain broke', () => {
      expect(parkReason('chain-fell')?.label, 'reword it and every headstone follows').toBe('The chain broke');
    });
    // every reason the graveyard can show has the words it needs
    for (const r of PARK_REASONS) expect(r.diedOn.length, r.key).toBeGreaterThan(2);
  });

  it('10. BOARD_PAGE — how much of the kept-for-ever lists travels at once', () => {
    expect(BOARD_PAGE.dead).toBeGreaterThan(0);
    expect(BOARD_PAGE.dead).toBeGreaterThanOrEqual(GRAVEYARD.patternWindow);
    expect(BOARD_PAGE.more).toBeGreaterThan(0);
  });

  it('and the verdict bands themselves are the ONE source everything reads', () => {
    // not a knob in this file on purpose: the bands live in @gil-bricks/core so
    // the board, the analyser and the extension can never disagree
    expect(verdictForScore(8)).toBe('good');
    expect(verdictForScore(6)).toBe('marginal');
    expect(verdictForScore(5.9)).toBe('walk away');
  });
});
