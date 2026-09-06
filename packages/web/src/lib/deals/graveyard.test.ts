/**
 * THE GRAVEYARD (P9) — the frozen card, and the one answer it is allowed to give.
 *
 * Two things have to be true or the whole feature is a lie: a snapshot never
 * changes after the deal died (even when the rules do), and a pattern never
 * speaks below its threshold or without stating its sample.
 */
import { describe, expect, it } from 'vitest';
import { strategies } from '@gil-bricks/core';
import { GRAVEYARD, GRAVEYARD_COPY, PARK_REASONS, parkReason } from '../../config/pipeline';
import { scoreFromParams } from './scoreFromParams';
import {
  buildDeathSnapshot, frozenChips, headstones, noPatternYet, parseSnapshot, patternIn, toDeath,
  type DealDeath, type Headstone,
} from './graveyard';
import type { BoardDeal } from './board';
import type { DealFact } from './facts';

const PARAMS = 'postcode=CF37+1HR&paon=44&price=120000&type=T&rent=950&refurbCost=20000';

const deal = (over: Partial<BoardDeal> = {}): BoardDeal => ({
  id: 'd1', strategy: 'btl', title: 'Terraced · CF37 1HR · £120,000', url_params: PARAMS,
  stage: 'parked-dead', current_score: 6.4, status: 'dead', headline_figure: 'ROI 7.1%',
  key_figure: 'ROI 7.1%', stage_since: '2026-09-01T09:00:00Z', is_auction: false,
  verdict_line: 'The rent barely covers it', updated_at: '2026-09-01T09:00:00Z', sold_evidence: 'null',
  ...over,
});

const fact = (over: Partial<DealFact> = {}): DealFact => ({
  id: 'f1', deal_id: 'd1', fact_type: 'builder-quote', value: 48000, note: 'Two quotes, took the lower',
  entered_at: '2026-08-30T10:00:00Z', folded_at: null, ...over,
});

const death = (over: Partial<DealDeath> = {}): DealDeath => ({
  id: 'x1', deal_id: 'd1', reason_key: 'refurb-too-high', note: '', snapshot: null,
  at: '2026-09-01T09:00:00Z', revived_at: null, ...over,
});

describe('the card as it died', () => {
  it('freezes what it scored, the engine’s own line, its chips, its facts and the stage it reached', () => {
    const snap = buildDeathSnapshot(
      { ...deal({ stage: 'offer-in' }), current_score: 6.4, verdict_line: 'The rent barely covers it' },
      [fact()],
    );
    expect(snap.v).toBe(1);
    expect(snap.score).toBe(6.4);
    expect(snap.verdictLine).toBe('The rent barely covers it');
    expect(snap.stage).toBe('offer-in');
    expect(snap.facts).toEqual([{ type: 'builder-quote', value: 48000, note: 'Two quotes, took the lower', at: '2026-08-30T10:00:00Z' }]);
    // the quote evidenced the refurb; the rent was only ever an assumption
    expect(snap.chips.find((c) => c.key === 'refurb')?.state).toBe('evidenced');
    expect(snap.chips.find((c) => c.key === 'rent')?.state).toBe('assumed');
    // no sold-price band was stored, so the comps chip is honestly unknown
    expect(snap.chips.find((c) => c.key === 'comps')?.state).toBe('unknown');
  });

  it('THE SNAPSHOT IS FROZEN: change the rules and today’s score moves, the headstone does not', () => {
    const btl = strategies.find((s) => s.id === 'btl') as unknown as { thresholds: Record<string, number> };
    const before = scoreFromParams('btl', PARAMS).score;
    const snap = buildDeathSnapshot({ ...deal(), current_score: before }, []);
    const stored = JSON.stringify(snap); // exactly what the database holds
    const kept = { ...btl.thresholds };
    try {
      // a rules change of the kind the operator can make in config any day
      btl.thresholds.minRoiGreen = 40;
      btl.thresholds.minCashflowGreen = 900;
      const after = scoreFromParams('btl', PARAMS).score;
      expect(after, 'the rules change must actually move a live score').not.toBe(before);
      expect(parseSnapshot(stored)?.score, 'the headstone still reads what it died on').toBe(before);
    } finally {
      Object.assign(btl.thresholds, kept);
    }
    expect(scoreFromParams('btl', PARAMS).score).toBe(before);
  });

  it('a snapshot we cannot read is null — never half a card', () => {
    expect(parseSnapshot('')).toBeNull();
    expect(parseSnapshot('not json')).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot('{"v":2,"strategy":"btl"}'), 'a shape we do not know').toBeNull();
    expect(parseSnapshot('{"v":1,"strategy":"btl"}')?.score).toBeNull();
  });

  it('frozen chips keep their STATES and read their labels from config', () => {
    const chips = frozenChips(parseSnapshot(JSON.stringify(buildDeathSnapshot(deal(), [fact()]))));
    expect(chips.map((c) => c.state)).toContain('evidenced');
    expect(chips.every((c) => c.label !== '')).toBe(true);
    // a chip key we no longer know is dropped rather than shown as itself
    expect(frozenChips({ ...buildDeathSnapshot(deal(), []), chips: [{ key: 'gone', state: 'evidenced' }] })).toEqual([]);
  });

  it('a stored row becomes a death, snapshot read once', () => {
    const row = {
      id: 'x1', deal_id: 'd1', reason_key: 'survey', note: 'Roof',
      snapshot_json: JSON.stringify(buildDeathSnapshot(deal(), [])), at: '2026-09-01T09:00:00Z', revived_at: null,
    };
    expect(toDeath(row).snapshot?.strategy).toBe('btl');
    expect(toDeath(row).reason_key).toBe('survey');
  });
});

describe('the graveyard list', () => {
  it('shows dead deals only, most recent first, with the reason in today’s words', () => {
    const deals = [
      deal({ id: 'a' }), deal({ id: 'b' }), deal({ id: 'c', status: 'live', stage: 'offer-in' }),
    ];
    const deaths = [
      death({ id: 'x1', deal_id: 'a', at: '2026-09-01T09:00:00Z', reason_key: 'survey' }),
      death({ id: 'x2', deal_id: 'b', at: '2026-09-04T09:00:00Z', reason_key: 'changed-mind', note: 'Too far from home' }),
    ];
    const stones = headstones(deals, deaths);
    expect(stones.map((s) => s.deal.id)).toEqual(['b', 'a']);
    expect(stones[0].reason).toBe(parkReason('changed-mind')?.label);
    expect(stones[0].note).toBe('Too far from home');
  });

  it('a deal killed before P9 still gets a headstone — with no card, and it says so', () => {
    const stones = headstones([deal({ id: 'old' })], []);
    expect(stones).toHaveLength(1);
    expect(stones[0].snapshot).toBeNull();
    expect(stones[0].at).toBe('2026-09-01T09:00:00Z'); // when it entered the dead stage
  });

  it('and it keeps the reason the DEAL itself stored, which is all we have (review)', () => {
    const stones = headstones([deal({ id: 'old', dead_reason: 'Chain fell through' })], []);
    expect(stones[0].reason).toBe('Chain fell through');
    // a recorded key always wins, in today's words
    const withKey = headstones([deal({ dead_reason: 'Chain fell through' })], [death({ reason_key: 'survey' })]);
    expect(withKey[0].reason).toBe(parkReason('survey')?.label);
  });

  it('a death that was undone is not a headstone; a deal killed AGAIN shows the newest one', () => {
    const revived = death({ id: 'x1', at: '2026-08-01T09:00:00Z', revived_at: '2026-08-10T09:00:00Z', reason_key: 'survey' });
    const again = death({ id: 'x2', at: '2026-09-01T09:00:00Z', reason_key: 'down-valued' });
    const stones = headstones([deal()], [revived, again]);
    expect(stones).toHaveLength(1);
    expect(stones[0].death?.id).toBe('x2');
    expect(stones[0].reason).toBe(parkReason('down-valued')?.label);
    // and a revived deal (now live) leaves the graveyard entirely
    expect(headstones([deal({ status: 'live', stage: 'offer-in' })], [revived])).toEqual([]);
  });
});

describe('the pattern, guarded hard', () => {
  const stonesFor = (keys: string[]): Headstone[] => headstones(
    keys.map((_, i) => deal({ id: `d${i}` })),
    keys.map((k, i) => death({ id: `x${i}`, deal_id: `d${i}`, reason_key: k, at: `2026-09-${String(i + 1).padStart(2, '0')}T09:00:00Z` })),
  );

  it('says NOTHING below the threshold — two data points are never a trend', () => {
    expect(patternIn(stonesFor(['refurb-too-high', 'refurb-too-high']))).toBeNull();
    expect(patternIn(stonesFor(Array(GRAVEYARD.patternMin - 1).fill('refurb-too-high')))).toBeNull();
  });

  it('speaks at exactly the threshold, and states the sample', () => {
    const p = patternIn(stonesFor([...Array(GRAVEYARD.patternMin).fill('survey'), 'beaten', 'changed-mind']));
    expect(p?.reasonKey).toBe('survey');
    expect(p?.count).toBe(GRAVEYARD.patternMin);
    expect(p?.total).toBe(GRAVEYARD.patternMin + 2);
    expect(p?.line).toContain(GRAVEYARD_COPY.pattern(GRAVEYARD.patternMin, GRAVEYARD.patternMin + 2, parkReason('survey')!.diedOn));
    expect(p?.line).toContain(parkReason('survey')!.pattern);
  });

  it('the operator’s own example reads exactly as they wrote it', () => {
    // five refurb kills among fourteen deaths, with nothing else tying them
    const keys = [
      ...Array(5).fill('refurb-too-high'), ...Array(4).fill('survey'),
      'beaten', 'down-valued', 'lease-legal', 'numbers-fail', 'changed-mind',
    ];
    expect(keys).toHaveLength(14);
    expect(patternIn(stonesFor(keys))?.line)
      .toBe('5 of your last 14 dead deals died on refurb cost. Your refurb guesses may be running light.');
  });

  it('a reason with no lesson states the sample and stops — a kill is never judged', () => {
    const p = patternIn(stonesFor(Array(6).fill('changed-mind')));
    expect(p?.line).toBe(GRAVEYARD_COPY.pattern(6, 6, parkReason('changed-mind')!.diedOn));
    expect(parkReason('changed-mind')?.pattern).toBeUndefined();
  });

  it('only the last N deaths count, so a pattern you fixed stops shouting', () => {
    const old = Array(GRAVEYARD.patternMin).fill('refurb-too-high');
    const recent = Array(GRAVEYARD.patternWindow).fill('beaten');
    // newest first once ordered, so the old run falls outside the window
    const stones = stonesFor([...old, ...recent]);
    const p = patternIn(stones);
    expect(p?.reasonKey).toBe('beaten');
    expect(p?.total).toBe(GRAVEYARD.patternWindow);
  });

  it('a tie keeps the config’s own order, so the answer never flickers', () => {
    const first = PARK_REASONS[0].key;
    const second = PARK_REASONS[1].key;
    const p = patternIn(stonesFor([...Array(5).fill(second), ...Array(5).fill(first)]));
    expect(p?.reasonKey).toBe(first);
  });

  it('a death with no recorded reason is in no SHARE, but it is still one of your dead deals', () => {
    const stones = headstones(
      Array.from({ length: 6 }, (_, i) => deal({ id: `d${i}` })),
      Array.from({ length: 5 }, (_, i) => death({ id: `x${i}`, deal_id: `d${i}`, reason_key: 'survey', at: `2026-09-0${i + 1}T09:00:00Z` })),
    );
    const p = patternIn(stones);
    expect(p?.count).toBe(5);
    // six headstones on screen, so the line says six — anything else contradicts
    // what the person can count (P9 review)
    expect(p?.total).toBe(6);
    expect(p?.line).toContain(GRAVEYARD_COPY.pattern(5, 6, parkReason('survey')!.diedOn));
  });

  it('the "no pattern" line states the SAME sample the pattern line would have', () => {
    const three = stonesFor(['survey', 'beaten', 'survey']);
    expect(noPatternYet(three)).toBe(GRAVEYARD_COPY.noPattern(3));
    expect(noPatternYet(stonesFor(['survey']))).toBe(GRAVEYARD_COPY.noPattern(1));
    // and past the window it never claims a total it did not look at
    const many = stonesFor(Array(GRAVEYARD.patternWindow + 23).fill('changed-mind').map((k, i) => (i % 2 ? k : 'survey')));
    expect(noPatternYet(many)).toBe(GRAVEYARD_COPY.noPattern(GRAVEYARD.patternWindow));
  });
});
