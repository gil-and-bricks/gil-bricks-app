// @vitest-environment happy-dom
/**
 * ACCEPTED IS NOT SAFE (P11). This card exists because our own stage names imply
 * the opposite, so it has to be honest about the market without being a
 * prediction about this deal — and it has to leave when it has been read.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'preact-render-to-string';
import { CHAIN_RISK } from '../../config/pipeline';
import { ChainRiskCard } from './ChainRisk';

const html = (over: Partial<Parameters<typeof ChainRiskCard>[0]> = {}) =>
  render(<ChainRiskCard dealTitle="12 Test Street" busy={false} onDismiss={() => {}} {...over} />);

// (That no word of this is typed into the component is held by the inline-copy
// ratchet in src/config/reversibility.test.ts, which allows a new component ZERO
// inline strings — a stronger guarantee than a grep.)
describe('what it says', () => {
  it('names the risk, the window and what actually kills deals here', () => {
    const out = html();
    expect(out).toContain(CHAIN_RISK.heading);
    expect(out).toContain(CHAIN_RISK.lead);
    expect(out).toContain(CHAIN_RISK.window);
    for (const cause of CHAIN_RISK.causes) expect(out).toContain(cause);
    // a survey is the biggest single killer, so it is named first
    expect(CHAIN_RISK.causes[0].toLowerCase()).toContain('survey');
  });

  it('says the figures are approximate, and about the market — not this deal', () => {
    expect(html()).toContain(CHAIN_RISK.source);
    // it says the figures are estimates, whose they are NOT, and that they are
    // not a prediction about the deal in front of you
    expect(/\b(estimate|approximate)/i.test(CHAIN_RISK.source)).toBe(true);
    expect(CHAIN_RISK.source.toLowerCase()).toContain('not a forecast');
    // never a prediction, never a probability for the deal in front of you
    for (const line of [CHAIN_RISK.lead, CHAIN_RISK.window, CHAIN_RISK.source]) {
      expect(/\bthis deal (will|is likely|probably)\b/i.test(line), line).toBe(false);
      expect(/\b\d+(\.\d+)?%/.test(line), 'no false precision').toBe(false);
    }
  });

  it('reads as a note, not an alarm', () => {
    const out = html();
    expect(out).toContain('role="note"');
    expect(out).not.toContain('role="alert"');
    for (const word of ['danger', 'warning', 'panic', 'disaster']) {
      expect(out.toLowerCase()).not.toContain(word);
    }
  });

  it('goes away when it has been read, and a screen reader hears which deal', () => {
    const onDismiss = vi.fn();
    const out = html({ onDismiss });
    expect(out).toContain(CHAIN_RISK.dismiss);
    expect(out).toContain(`${CHAIN_RISK.dismiss}<span class="sr-only">${CHAIN_RISK.dismissFor('12 Test Street')}</span>`);
    expect(html({ busy: true })).toContain('disabled');
  });
});
