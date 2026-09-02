import { fmtMoney } from '@gil-bricks/core';
import type { Valuation } from '@gil-bricks/core';
import type { AddressCandidate } from '@gil-bricks/core';
import { MathsAccordion } from './Accordion';
import { state, update } from './state';

export function ValuationCard({ valuation, lrState, candidates }: {
  valuation: Valuation | null;
  lrState: 'ok' | 'timeout' | null;
  candidates: AddressCandidate[] | null;
}) {
  return (
    <section class="glass card" id="valuation" aria-labelledby="val-h">
      <h2 id="val-h">What it's worth</h2>
      {candidates && candidates.length > 0 && (
        <div class="picker">
          <p>Which address is it? We found more than one match:</p>
          <div class="picker-row">
            {candidates.map((c) => (
              <button type="button" class="mini-btn" onClick={() => update({ paon: c.paon, saon: c.saon })}>
                {[c.saon, c.paon, c.street].filter(Boolean).join(' ')}
              </button>
            ))}
          </div>
        </div>
      )}
      {lrState === 'timeout' && (
        <div role="status" class="state-block">
          <h3 class="state-h">Sale history unavailable</h3>
          <p class="hint">
            We couldn’t reach HM Land Registry just now, so we can’t use this exact property’s own past sale. The
            estimate below still leans on nearby sold prices.
          </p>
        </div>
      )}
      {state.value.area === '' && (
        <div role="status" class="state-block">
          <h3 class="state-h">Add the floor area for £/sqft</h3>
          <p class="hint">
            Without the internal area we can’t show a price per square foot for this property. Type the size in square
            metres (it’s on the EPC) in the form above to unlock it.
          </p>
        </div>
      )}
      {valuation === null ? (
        <p class="hint">Not enough evidence yet — add the internal area, or a house number so we can find its sale history.</p>
      ) : (
        <>
          <p class="big-figure">{fmtMoney(valuation.estimate)}</p>
          <p class="range-line">
            Likely between <strong>{fmtMoney(valuation.range.low)}</strong> and{' '}
            <strong>{fmtMoney(valuation.range.high)}</strong> — {valuation.range.label}.
          </p>
          <p class="hint">{valuation.confidenceReason}.</p>
          {valuation.lines.map((l) => (
            <div class="evidence-line">
              <div class="evidence-head">
                <span>{l.label}</span>
                <strong>{fmtMoney(l.estimate)}</strong>
              </div>
              <MathsAccordion breakdown={l.breakdown} />
            </div>
          ))}
          <MathsAccordion breakdown={valuation.breakdown} />
          <p class="context-note">
            Beds, baths, garden and parking are context only — they never adjust the numbers.
          </p>
        </>
      )}
    </section>
  );
}
