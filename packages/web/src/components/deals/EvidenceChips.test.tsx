// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render } from 'preact-render-to-string';
import { EvidenceChips } from './EvidenceChips';

/** What the strip puts on screen, and what it says to a screen reader. */
const html = (strategy: string, inputs: Parameters<typeof EvidenceChips>[0]['inputs'], score: string | null = '7.4') =>
  render(<EvidenceChips strategy={strategy} inputs={inputs} score={score} />);

describe('the evidence strip', () => {
  it('marks each chip with its state, and says that state out loud', () => {
    const out = html('brrrr', { present: ['refurbCost', 'arv', 'rent'], facts: ['builder-quote'], comps: true });
    expect(out).toContain('ev-chip ev-evidenced');
    expect(out).toContain('Refurb: evidenced');
    expect(out).toContain('End value: assumed');
    expect(out).toContain('aria-label="What this score rests on"');
  });

  it('names the weakest input and the one thing that would fix it', () => {
    expect(html('btl', { present: ['rent'], comps: true }))
      .toContain('This 7.4 rests on no refurb figure and a rent you estimated. Get a builder’s number to trust it.');
  });

  it('says so plainly when nothing is left to doubt', () => {
    expect(html('hmo', { present: ['refurbCost', 'roomRent'], facts: ['builder-quote', 'rent-agreed'], roomsMeasured: true }))
      .toContain('This 7.4 rests on numbers you have checked.');
  });

  it('shows the chips but no line when there is no score to rest on anything', () => {
    const out = html('btl', { present: ['rent'] }, null);
    expect(out).toContain('ev-chip');
    expect(out).not.toContain('ev-line');
  });

  it('renders nothing for a strategy with no chips', () => {
    expect(html('comparables', { present: [] })).toBe('');
  });

  it('is a list of labels, with no control to tab through', () => {
    const out = html('btl', { present: ['rent'] });
    expect(out).toContain('<ul class="ev-chips"');
    expect(out).not.toContain('<button');
    expect(out).not.toContain('tabindex');
  });
});
