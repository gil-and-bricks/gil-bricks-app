// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render } from 'preact-render-to-string';
import { DealFacts } from './DealFacts';
import type { DealFact } from '../../lib/deals/facts';

/**
 * What a fact SHOWS once it is on the deal (P5). A fact the person cannot see
 * is not reversible in any meaningful way, and a note they typed and never see
 * again was not worth asking for.
 */
const fact = (over: Partial<DealFact> = {}): DealFact => ({
  id: 'f1', deal_id: 'd1', fact_type: 'builder-quote', value: 48_000,
  note: 'Two quotes, took the lower', entered_at: '2026-09-04T09:00:00.000Z', ...over,
});

const html = (facts: DealFact[]): string => render(
  <DealFacts
    dealId="d1" dealTitle="12 Test Street" strategy="btl" facts={facts}
    onAdd={async () => true} onRemove={async () => true} busy={false}
  />,
);

describe('a fact on the card', () => {
  it('shows what happened, the money, the day and the words the person typed', () => {
    const out = html([fact()]);
    expect(out).toContain('Builder’s quote');
    expect(out).toContain('£48,000');
    expect(out).toContain('4 Sept');
    expect(out).toContain('Two quotes, took the lower');
  });

  it('a flag shows no money at all — nothing is invented for it', () => {
    const out = html([fact({ fact_type: 'covenant', value: null, note: null })]);
    expect(out).toContain('Covenant');
    expect(out).not.toMatch(/£\d/);
    expect(out).toContain('fact-flagged');
  });

  it('every fact can be taken back, and the button says which one', () => {
    expect(html([fact()])).toContain('aria-label="Remove Builder’s quote"');
  });

  it('with no facts there is just the one control', () => {
    const out = html([]);
    expect(out).toContain('What happened?');
    expect(out).not.toContain('fact-row');
  });
});
