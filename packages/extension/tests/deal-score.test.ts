import { describe, expect, it } from 'vitest';
import { scoreDeal } from '@gil-bricks/core';
import { SAMPLE_STRATEGY, SAMPLE_INPUTS } from '../src/sample';

/**
 * Proves @gil-bricks/core (and the E2.1 headline templates) run inside the
 * extension and produce THE SAME numbers the web app renders for these inputs.
 * The snapshot below is exactly what the web's analyser shows for the sample
 * (same scoreDeal, no valuation evidence loaded). If the extension's bundled
 * core ever drifts from the web, this fails loudly.
 */
// Same @gil-bricks/core engine in both, so the extension and web render the same
// number. Score is now placed CONTINUOUSLY within the marginal band (E8.3) — the
// verdict tier is unchanged.
const WEB_APP_RENDERS = {
  score: 7.0,
  verdict: 'marginal' as const,
  headline: 'Just 5.0% back on the cash you’d tie up, short of the 8.0% that makes the risk worth it.',
};

describe('shared Deal Score inside the extension', () => {
  const deal = scoreDeal(SAMPLE_STRATEGY, SAMPLE_INPUTS);

  it('matches the web app score/verdict/headline for the sample inputs', () => {
    expect(deal.score).toBe(WEB_APP_RENDERS.score);
    expect(deal.verdict).toBe(WEB_APP_RENDERS.verdict);
    expect(deal.headline).toBe(WEB_APP_RENDERS.headline);
  });

  it('produces the full breakdown (components + binding) from the shared engine', () => {
    // exact BTL component set — an added/removed/renamed component fails here
    expect(deal.components.map((c) => c.name)).toEqual([
      'Rent covers the mortgage (ICR)',
      'Monthly cashflow after tax',
      'Return on the cash you put in',
      'Price vs nearby sold prices',
    ]);
    expect(deal.components.reduce((s, c) => s + c.points, 0)).toBeCloseTo(deal.rawScore, 5);
    expect(deal.bindingConstraint?.plainExplanation).toMatch(/5\.0%/);
  });
});
