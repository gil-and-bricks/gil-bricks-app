// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render } from 'preact-render-to-string';
import { DealDates, datesFor, datesShown } from './DealDates';

describe('PROBE: stranded exchange date after a backwards stage move', () => {
  it('claim: no control renders at getting-real-numbers', () => {
    const out = render(
      <DealDates
        dealId="d1" dealTitle="12 High St" stage="getting-real-numbers" isAuction={false}
        dates={{ chase_date: null, auction_date: null, exchange_date: '2026-09-07' }}
        busy={false} onSet={() => {}}
      />,
    );
    console.log('OFFERED:', datesFor('getting-real-numbers', false).map((d) => d.key));
    console.log('SHOWN:', datesShown('getting-real-numbers', false, { exchange_date: '2026-09-07' }).map((d) => d.key));
    console.log('HTML:', out);
    // the finding says the exchange row is absent and unclearable — assert that
    expect(out).not.toContain('date-exchange_date-d1');
  });

  it('claim: an auction date on a non-auction deal is unclearable', () => {
    const out = render(
      <DealDates
        dealId="d2" dealTitle="9 Low Rd" stage="offer-in" isAuction={false}
        dates={{ auction_date: '2026-09-09' }}
        busy={false} onSet={() => {}}
      />,
    );
    console.log('HTML2:', out);
    expect(out).not.toContain('date-auction_date-d2');
  });
});
