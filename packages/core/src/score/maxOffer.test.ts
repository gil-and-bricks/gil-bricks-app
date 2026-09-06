/**
 * The reverse solve (P11): the most you could pay and still clear your own bar.
 * It must never round UP (an answer you cannot offer is worse than none), never
 * invent a price on a deal that no price fixes, and always agree with the score
 * the rest of the product shows.
 */
import { describe, expect, it } from 'vitest';
import { maxOfferForVerdict } from './maxOffer';
import { scoreDeal, verdictForScore } from './scoreDeal';
import { strategies } from '../strategies';

const thresholds = (id: string): Record<string, number> =>
  (strategies.find((s) => s.id === id) as unknown as { thresholds: Record<string, number> }).thresholds;

const btl = (price: number, over: Record<string, unknown> = {}) => ({
  price, country: 'E92000001', monthlyRent: 1200, depositPct: 25, ratePct: 5.5,
  buyingAs: 'basic', selfManaged: false, voidWeeks: 2, agentPct: 10, maintPct: 10,
  insurancePerYear: 300, legals: 1800, refurb: 20000, stressRatePct: 8.5,
  taxBasis: 'additional', thresholds: thresholds('btl'), ...over,
});

describe('the most you could pay', () => {
  it('finds a price that really does clear the bar, and the one just above it does not', () => {
    const inputs = btl(250_000);
    expect(verdictForScore(scoreDeal('btl', inputs as never).score)).toBe('walk away');
    const max = maxOfferForVerdict('btl', inputs as never, 'marginal');
    expect(max).not.toBeNull();
    // at the answer it clears…
    expect(verdictForScore(scoreDeal('btl', { ...inputs, price: max as number } as never).score))
      .not.toBe('walk away');
    // …and a step above it does not, so the answer is the MOST you could pay
    expect(verdictForScore(scoreDeal('btl', { ...inputs, price: (max as number) + 2000 } as never).score))
      .toBe('walk away');
  });

  it('rounds DOWN to something you could actually offer', () => {
    const max = maxOfferForVerdict('btl', btl(250_000) as never, 'marginal', undefined, { step: 500 });
    expect((max as number) % 500).toBe(0);
    const finer = maxOfferForVerdict('btl', btl(250_000) as never, 'marginal', undefined, { step: 100 });
    expect((finer as number) % 100).toBe(0);
    // a coarser step can only ever be lower or equal — never rounded up past it
    expect(max as number).toBeLessThanOrEqual(finer as number);
  });

  it('says NOTHING when no price fixes it', () => {
    // no rent at all: cheapening the purchase cannot rescue it
    expect(maxOfferForVerdict('btl', btl(250_000, { monthlyRent: 1 }) as never, 'good')).toBeNull();
  });

  it('hands back the asking price when the deal already clears it — UNROUNDED', () => {
    const inputs = btl(70_000);
    expect(verdictForScore(scoreDeal('btl', inputs as never).score)).not.toBe('walk away');
    expect(maxOfferForVerdict('btl', inputs as never, 'marginal')).toBe(70_000);
    // £69,995 is what asking prices look like: rounding it down here invented a
    // discount on a deal that never needed one (P11 review).
    const odd = btl(69_995);
    expect(maxOfferForVerdict('btl', odd as never, 'marginal')).toBe(69_995);
  });

  it('asking for a HIGHER bar never returns a higher price', () => {
    const inputs = btl(200_000) as never;
    const marginal = maxOfferForVerdict('btl', inputs, 'marginal');
    const good = maxOfferForVerdict('btl', inputs, 'good');
    if (good !== null && marginal !== null) expect(good).toBeLessThanOrEqual(marginal);
  });

  it('works for every strategy the product scores', () => {
    const flip = {
      price: 300_000, country: 'E92000001', refurb: 40_000, gdv: 360_000, funding: 'cash', months: 9,
      agentSalePctExVat: 1.2, saleLegals: 1200, flipAs: 'personal', incomeBand: 'higher',
      bridgeLoanPct: 70, bridgeRatePctMonth: 0.85, arrangementPct: 2, exitPct: 1, legals: 2500,
      contingencyPct: 10, taxBasis: 'additional', thresholds: thresholds('flip'),
    };
    const max = maxOfferForVerdict('flip', flip as never, 'marginal');
    expect(max === null || max < 300_000).toBe(true);
    if (max !== null) {
      expect(verdictForScore(scoreDeal('flip', { ...flip, price: max } as never).score)).not.toBe('walk away');
    }
  });
});
