/**
 * D4 — a saved score the evidence rule moved. The card must SAY so; the number
 * must never change on its own.
 */
import { describe, expect, it } from 'vitest';
import type { SectorFile } from '@gil-bricks/core';
import { soldEvidenceFor } from '@gil-bricks/core';
import { SOLD_EVIDENCE_OPTS } from '../../components/analyser/soldEvidence';
import { scoreFromParams } from './scoreFromParams';
import { scoreMoveFor, sectorOf } from './scoreMoved';
import type { BoardDeal } from './board';

const sector = (over: Partial<SectorFile['stats']> = {}): SectorFile => ({
  schemaVersion: 1, sector: 'LS28 9', country: 'E92000001', updatedAt: '2026-08-31T00:00:00Z', sales: [],
  stats: { count: 40, typicalPrice: 180000, typicalPpsqm: 2200, p10Price: 120000, p90Price: 240000, ...over },
} as SectorFile);

const deal = (over: Partial<BoardDeal> = {}): BoardDeal => ({
  id: 'd1', strategy: 'btl', title: 'Flat · LS28 9GD · £150,000',
  url_params: 'postcode=LS28+9GD&price=150000&type=F&rent=750',
  stage: 'worth-a-look', current_score: 1.1, status: 'live', headline_figure: '', key_figure: '',
  stage_since: '2026-09-01T00:00:00Z', is_auction: false, verdict_line: '', updated_at: '2026-09-01T00:00:00Z',
  sold_evidence: null, room_size_failures: null, ...over,
} as BoardDeal);

describe('which deals have moved', () => {
  it('spots a deal saved with no evidence that the sector now scores higher', () => {
    const mv = scoreMoveFor(deal(), [], sector());
    expect(mv).not.toBeNull();
    expect(mv!.from).toBe(1.1);
    expect(mv!.to).toBeGreaterThan(1.1);
    // and it carries the SECTOR band, so accepting it makes the card and the
    // extension agree from then on
    expect(JSON.parse(mv!.body.sold_evidence as string)).toEqual({ estimate: 180000, high: 240000 });
  });

  it('says nothing when the stored score already matches', () => {
    const mv = scoreMoveFor(deal(), [], sector());
    const settled = deal({ current_score: mv!.to });
    expect(scoreMoveFor(settled, [], sector())).toBeNull();
  });

  it('says nothing without a sector, without a score, or on a dead deal', () => {
    expect(scoreMoveFor(deal(), [], null)).toBeNull();
    expect(scoreMoveFor(deal({ current_score: null }), [], sector())).toBeNull();
    expect(scoreMoveFor(deal({ status: 'dead' }), [], sector())).toBeNull();
  });

  it('reads the sector off the deal’s own postcode, and rejects one outside E&W', () => {
    expect(sectorOf(deal())).toBe('LS28 9');
    expect(sectorOf(deal({ url_params: 'postcode=EH1+1AA&price=150000' }))).toBeNull();
    expect(sectorOf(deal({ url_params: 'price=150000' }))).toBeNull();
  });
});

/**
 * The sold component judges what a flip or BRRRR will be WORTH, not what it
 * cost. Recomputing the note against the price would offer — and then write — a
 * score judged on the wrong figure.
 */
describe('the note is judged by the same value the score is', () => {
  it('a flip is judged on its end value, not its purchase price', () => {
    const flip = deal({
      strategy: 'flip', current_score: 0,
      url_params: 'postcode=LS28+9GD&price=150000&type=F&gdv=600000&refurbCost=20000',
    });
    // p90 is 240,000 and the outside factor is 2, so a £600,000 end value sits
    // outside the local evidence: there is nothing to judge it against.
    const outside = scoreMoveFor(flip, [], sector());
    // …while the same deal at an end value inside the evidence does have some.
    const inside = scoreMoveFor(deal({
      strategy: 'flip', current_score: 0,
      url_params: 'postcode=LS28+9GD&price=150000&type=F&gdv=210000&refurbCost=20000',
    }), [], sector());
    const bandOf = (m: ReturnType<typeof scoreMoveFor>) => (m === null ? undefined : JSON.parse(m.body.sold_evidence as string));
    expect(bandOf(outside) ?? null).toBeNull();
    expect(bandOf(inside)).toEqual({ estimate: 180000, high: 240000 });
  });
});

/**
 * D4 review — the regression the review caught: the analyser judged by the
 * person's own minimums while every board-side recompute used the strategy's
 * defaults, so the note fired on a difference the sold-price rule had not
 * caused, and accepting it wrote the wrong bar over their own.
 */
describe('a deal carrying its own minimums is re-scored by them', () => {
  // rent 1300 is where the bar really bites: 9.4 by the strategy's own minimum,
  // 7.2 by a £400 personal one — the 2.2-point gap the review found.
  const withBar = deal({
    url_params: 'postcode=LS28+9GD&price=150000&type=F&rent=1300&minCashflow=400',
  });

  it('the board reproduces the analyser: no phantom move to announce', () => {
    // score the deal the way the ANALYSER did — its own bar, its own evidence —
    // and the note must then have nothing to say
    const asAnalyser = scoreFromParams(
      'btl', withBar.url_params,
      soldEvidenceFor(150000, sector(), SOLD_EVIDENCE_OPTS).evidence,
    );
    expect(scoreMoveFor(deal({ ...withBar, current_score: asAnalyser.score }), [], sector())).toBeNull();
  });

  it('and that bar really is applied — it is not the config score by accident', () => {
    const ev = soldEvidenceFor(150000, sector(), SOLD_EVIDENCE_OPTS).evidence;
    const withoutBar = scoreFromParams('btl', 'postcode=LS28+9GD&price=150000&type=F&rent=1300', ev);
    const withIt = scoreFromParams('btl', withBar.url_params, ev);
    expect(withoutBar.score).toBe(9.4);
    expect(withIt.score).toBe(7.2);
  });

  it('and it says whose bar it was, exactly as the analyser does', () => {
    const ev = soldEvidenceFor(150000, sector(), SOLD_EVIDENCE_OPTS).evidence;
    expect(scoreFromParams('btl', withBar.url_params, ev).verdict).toContain('you set as your minimum');
  });
});
