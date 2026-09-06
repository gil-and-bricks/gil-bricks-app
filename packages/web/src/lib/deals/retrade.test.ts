/**
 * THE RE-TRADE RADAR (P11). The rule that matters most is the one about silence:
 * a negotiation is never manufactured. It speaks only when a fact really moved
 * the deal AND a lower price really would fix it, and the words it hands over
 * name real numbers.
 */
import { describe, expect, it } from 'vitest';
import { fmtMoney, verdictForScore } from '@gil-bricks/core';
import { RETRADE } from '../../config/pipeline';
import { factTypeFor } from './facts';
import { scoreFromParams } from './scoreFromParams';
import { retradeFor } from './retrade';
import type { BoardDeal } from './board';
import type { DealFact } from './facts';

// A deal that WORKS at £185,000 — the survey is what breaks it, which is the
// whole premise of a re-trade.
const PARAMS = 'postcode=CF37+1HR&paon=44&price=185000&type=T&rent=1800&refurbCost=15000';
const deal = (over: Partial<BoardDeal> = {}): BoardDeal => ({
  id: 'd1', strategy: 'btl', title: 'Terraced · CF37 1HR · £185,000', url_params: PARAMS,
  stage: 'offer-accepted', current_score: 6.2, status: 'live', headline_figure: 'ROI 6%',
  key_figure: 'ROI 6%', stage_since: '2026-09-01T00:00:00Z', is_auction: false,
  verdict_line: 'Thin.', updated_at: '2026-09-01T00:00:00Z', sold_evidence: 'null', ...over,
});
const fact = (over: Partial<DealFact> = {}): DealFact => ({
  id: 'f1', deal_id: 'd1', fact_type: 'survey-finding', value: 14_000, note: '',
  entered_at: '2026-09-04T10:00:00Z', folded_at: null, ...over,
});

describe('when the radar speaks', () => {
  it('a survey finding on a live deal: a new maximum, and the words to ask for it', () => {
    const r = retradeFor(deal(), [fact()]);
    expect(r).not.toBeNull();
    expect(r?.factType).toBe('survey-finding');
    expect(r?.price).toBe(185_000);
    expect(r?.maxOffer).toBeLessThan(185_000);
    expect(r?.after).toBeLessThan(r?.before as number);
    // the message names the fact, the price on the table and the new maximum
    expect(r?.message).toContain(fmtMoney(14_000));
    expect(r?.message).toContain(fmtMoney(185_000));
    expect(r?.message).toContain(fmtMoney(r?.maxOffer as number));
    expect(r?.message).toBe(RETRADE.message(
      factTypeFor('survey-finding')!.retrade!(fmtMoney(14_000)),
      fmtMoney(185_000),
      fmtMoney(r?.maxOffer as number),
    ));
  });

  it('the new maximum really does clear the bar the deal held before', () => {
    const r = retradeFor(deal(), [fact()])!;
    const held = verdictForScore(r.before);
    const target = held === 'walk away' ? RETRADE.floorTarget : held;
    // scored WITH the survey applied, at the new price, it is back where it was
    const withSurvey = PARAMS.replace('refurbCost=15000', 'refurbCost=29000');
    const at = scoreFromParams('btl', withSurvey.replace('price=185000', `price=${r.maxOffer}`));
    expect(verdictForScore(at.score)).toBe(target);
    // …and it could not have been asked for at the price on the table
    expect(verdictForScore(scoreFromParams('btl', withSurvey).score)).not.toBe(target);
  });

  it('a down-valuation opens it too, in its own words', () => {
    const brrrr = deal({
      strategy: 'brrrr',
      url_params: 'postcode=CF37+1HR&price=185000&rent=1800&arv=300000&refurbCost=20000',
    });
    const r = retradeFor(brrrr, [fact({ fact_type: 'down-valuation', value: 250_000 })]);
    expect(r, 'a valuer £50,000 under the plan is a re-trade').not.toBeNull();
    expect(r?.message).toContain(factTypeFor('down-valuation')!.retrade!(fmtMoney(250_000)));
  });
});

describe('when it says nothing at all', () => {
  it('a deal you killed is not a negotiation', () => {
    expect(retradeFor(deal({ status: 'dead', stage: 'parked-dead' }), [fact()])).toBeNull();
    expect(retradeFor(deal({ status: 'done', stage: 'bought-it' }), [fact()])).toBeNull();
  });

  it('a fact that cannot touch this strategy’s maths moves no price', () => {
    // a down-valuation has no end value to replace on a BTL
    expect(retradeFor(deal(), [fact({ fact_type: 'down-valuation', value: 150_000 })])).toBeNull();
  });

  it('a fact that costs nothing is not a re-trade', () => {
    expect(retradeFor(deal(), [fact({ value: 0 })])).toBeNull();
  });

  it('a fact already folded into the numbers has had its conversation', () => {
    expect(retradeFor(deal(), [fact({ folded_at: '2026-09-05T00:00:00Z' })])).toBeNull();
  });

  it('a price that is not a round number does NOT invent a discount (P11 review)', () => {
    // £249,995 is what asking prices look like. The old rounding turned "you are
    // still fine" into a £245 ask with a message saying the numbers no longer work.
    const odd = deal({ url_params: PARAMS.replace('price=185000', 'price=185995') });
    const tiny = retradeFor(odd, [fact({ value: 500 })]);
    expect(tiny, 'a fact that costs almost nothing is not a negotiation').toBeNull();
    // and the real one is still found, at a real number
    const real = retradeFor(odd, [fact()]);
    expect(real?.maxOffer).toBeLessThan(185_995 - RETRADE.minAsk);
  });

  it('an ask too small to make is not an ask', () => {
    const r = retradeFor(deal(), [fact({ value: 200 })]);
    expect(r).toBeNull();
  });

  it('a newer fact this strategy cannot use never silences a live radar', () => {
    // a down-valuation has no end value to replace on a BTL, and the card says so
    const survey = fact({ id: 'f1', entered_at: '2026-09-04T10:00:00Z' });
    const later = fact({ id: 'f2', fact_type: 'down-valuation', value: 150_000, entered_at: '2026-09-06T10:00:00Z' });
    const r = retradeFor(deal(), [survey, later]);
    expect(r?.factId, 'the survey is still the one being re-traded').toBe('f1');
  });

  it('no triggering fact, no radar — a builder’s quote is not a re-trade', () => {
    expect(retradeFor(deal(), [fact({ fact_type: 'builder-quote', value: 30_000 })])).toBeNull();
    expect(retradeFor(deal(), [])).toBeNull();
  });

  it('and when NO price fixes it, it says so and hands over no message', () => {
    // a survey bigger than the whole deal: nothing you could pay rescues it
    const r = retradeFor(deal(), [fact({ value: 400_000 })]);
    expect(r).not.toBeNull();
    expect(r?.maxOffer).toBeNull();
    expect(r?.message, 'never a message that cannot be true').toBe('');
  });

  it('a deal that is not scoreable at all keeps quiet', () => {
    expect(retradeFor(deal({ url_params: 'postcode=CF37+1HR&price=0' }), [fact()])).toBeNull();
  });
});

describe('which fact it listens to', () => {
  it('the NEWEST unfolded one, so the latest news is what you are asking about', () => {
    const older = fact({ id: 'f1', value: 5_000, entered_at: '2026-09-02T10:00:00Z' });
    const newer = fact({ id: 'f2', value: 14_000, entered_at: '2026-09-06T10:00:00Z' });
    expect(retradeFor(deal(), [older, newer])?.factId).toBe('f2');
  });

  it('the triggering facts are CONFIG, not a rule in the code', () => {
    expect(RETRADE.facts).toContain('survey-finding');
    expect(RETRADE.facts).toContain('down-valuation');
    for (const key of RETRADE.facts) expect(factTypeFor(key)?.retrade, key).toBeTypeOf('function');
  });
});
