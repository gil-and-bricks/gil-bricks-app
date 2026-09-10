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

/**
 * P12 — PRESSING A CHIP FIXES WHAT IT NAMES.
 *
 * The whole loop of the product: the chip tells you the score is weak on
 * something, and pressing it opens the fact that would settle it. A chip nothing
 * can settle must never look pressable.
 */
describe('pressing a chip to fix what it names (P12)', () => {
  const withFix = (strategy: string, inputs: Parameters<typeof EvidenceChips>[0]['inputs'], onFix = () => {}) =>
    render(<EvidenceChips strategy={strategy} inputs={inputs} score="7.4" onFix={onFix} />);
  /** The ONE <li> that carries a given chip — asserting on a slice of the whole
   *  string reads the neighbouring chip's markup and proves nothing. */
  const chipFor = (out: string, label: string): string => {
    const li = out.split('<li').map((x) => `<li${x}`).find((x) => x.includes(`>${label}</span>`));
    if (li === undefined) throw new Error(`no chip labelled ${label} in: ${out}`);
    return li;
  };

  it('makes the chips a fact could fill into real buttons', () => {
    const out = withFix('brrrr', { present: ['refurbCost'] });
    expect(chipFor(out, 'Refurb')).toContain('ev-fix');
    expect(chipFor(out, 'Refurb')).toContain('<button');
    // and it says what pressing does, for anyone who cannot see it is a button
    expect(chipFor(out, 'Refurb')).toContain('Refurb: assumed — Get a builder’s number');
  });

  it('NEVER makes Comps pressable — a sold-price check is not a fact anybody types', () => {
    const out = withFix('btl', { present: ['rent'] });
    expect(chipFor(out, 'Comps')).not.toContain('ev-fix');
    expect(chipFor(out, 'Comps')).not.toContain('<button');
  });

  it('NEVER makes Room sizes pressable — those are measured, not recorded here', () => {
    const out = withFix('hmo', { present: ['refurbCost'], roomsMeasured: false });
    expect(chipFor(out, 'Room sizes')).not.toContain('ev-fix');
    expect(chipFor(out, 'Room sizes')).not.toContain('<button');
  });

  it('leaves an already-evidenced chip inert — there is nothing left to fix', () => {
    const out = withFix('brrrr', { present: ['refurbCost'], facts: ['builder-quote'] });
    expect(chipFor(out, 'Refurb')).toContain('ev-evidenced');
    expect(chipFor(out, 'Refurb')).not.toContain('ev-fix');
  });

  it('offers NOTHING pressable where no handler was given (the analyser, a dead deal)', () => {
    const out = html('brrrr', { present: ['refurbCost'] });
    expect(out).not.toContain('<button');
    expect(out).not.toContain('ev-fix');
  });

  it('an interactive strip is marked so its chips become 44px touch targets', () => {
    // 27px is not a target on a phone; the rest of this product is 44px.
    expect(withFix('btl', { present: ['rent'] })).toContain('ev-chips ev-chips-fixable');
    // and a strip of plain labels is NOT given the interactive sizing
    expect(html('btl', { present: ['rent'] })).toContain('class="ev-chips"');
    expect(html('btl', { present: ['rent'] })).not.toContain('ev-chips-fixable');
  });

  it('the detector is not vacuous: the same helper finds a pressable chip', () => {
    expect(chipFor(withFix('btl', { present: ['rent'] }), 'Rent')).toContain('ev-fix');
  });
});
