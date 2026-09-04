import { fmtMoney } from '@gil-bricks/core';
import { COPY } from '../../config/copy';
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
          <h3 class="state-h">{COPY.valuation.lrTimeoutTitle}</h3>
          <p class="hint">{COPY.valuation.lrTimeout}</p>
        </div>
      )}
      {state.value.area === '' && (
        <div role="status" class="state-block">
          <h3 class="state-h">{COPY.valuation.needAreaTitle}</h3>
          <p class="hint">{COPY.valuation.needArea}</p>
        </div>
      )}
      {valuation === null ? (
        <p class="hint">{COPY.valuation.thinEvidence}</p>
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
          <p class="context-note">{COPY.valuation.contextOnly}</p>
        </>
      )}
    </section>
  );
}
