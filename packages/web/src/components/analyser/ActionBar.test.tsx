// @vitest-environment happy-dom
/**
 * THE SAVE IS OFFERED ONLY WHERE IT CAN WORK (A1).
 *
 * /comparables runs this same shell with the verdict switched off, so a deal
 * saved there could never be scored — the board had to carry it for ever as
 * unscoreable. The button is gone from that page and the API refuses the
 * strategy. Both ends are held here, so neither can be undone quietly.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'preact-render-to-string';
import { strategies } from '@gil-bricks/core';
import { ActionBar } from './ActionBar';
import { ACTION_BAR } from '../../config/analyserForm';
import { isDealStrategy } from '../../worker/lib/outbox';

const bar = (strategyId: string): string =>
  render(<ActionBar valuation={null} comps={null} strategyId={strategyId} />);

describe('the analyser action bar', () => {
  it('offers Save on every real strategy', () => {
    for (const s of strategies) {
      expect(bar(s.id), s.id).toContain(ACTION_BAR.buttons.save);
    }
  });

  it('does NOT offer Save on /comparables, which cannot score anything', () => {
    expect(bar('comparables')).not.toContain(ACTION_BAR.buttons.save);
  });

  it('still offers what the comps page CAN do — share and copy the link', () => {
    const html = bar('comparables');
    expect(html).toContain(ACTION_BAR.buttons.share);
    expect(html).toContain(ACTION_BAR.buttons.copyLink);
  });
});

describe('the API agrees with the button', () => {
  it('accepts exactly the strategies that offer a Save', () => {
    for (const s of strategies) expect(isDealStrategy(s.id), s.id).toBe(true);
    expect(isDealStrategy('comparables')).toBe(false);
  });
});
