// @vitest-environment happy-dom
/**
 * THE RE-TRADE RADAR on screen (P11). Two things it must never do: promise to
 * send anything, or hand over a message when there is no honest one to give.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'preact-render-to-string';
import { RETRADE } from '../../config/pipeline';
import { RetradeRadar } from './RetradeRadar';

const MSG = 'The survey has come back with £14,000 of work I hadn’t allowed for. At £185,000 the numbers no longer work for me. I can still proceed at £175,000.';
const html = (over: Partial<Parameters<typeof RetradeRadar>[0]> = {}) =>
  render(<RetradeRadar maxOffer="£175,000" message={MSG} busy={false} {...over} />);

describe('the radar on a card', () => {
  it('leads with the one number that matters now', () => {
    expect(html()).toContain(RETRADE.max('£175,000'));
  });

  it('shows the words to paste, and offers to copy them', () => {
    const out = html();
    expect(out).toContain('£14,000');
    expect(out).toContain('£185,000');
    expect(out).toContain('£175,000');
    expect(out).toContain(RETRADE.copy);
  });

  it('says out loud that nothing is sent — because nothing is', () => {
    const out = html();
    expect(out).toContain(RETRADE.sendNothing);
    for (const word of ['Send', 'Email the agent', 'sends']) expect(out).not.toContain(word);
  });

  it('when no price fixes it: says so, and hands over NO message', () => {
    const out = html({ maxOffer: null, message: '' });
    expect(out).toContain(RETRADE.none);
    expect(out).not.toContain(RETRADE.copy);
    expect(out).not.toContain('proceed at');
  });

  it('cannot be copied while the card is busy', () => {
    expect(html({ busy: true })).toContain('disabled');
  });
});
