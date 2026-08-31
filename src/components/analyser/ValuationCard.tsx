import { fmtMoney } from '../../lib/maths/format';
import type { Valuation } from '../../lib/valuation/engine';
import type { AddressCandidate } from '../../lib/landregistry/history';
import { MathsAccordion } from './Accordion';
import { update } from './state';

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
        <p class="hint">Sale history is unavailable right now — you can enter the last sale manually once that arrives in assumptions (next sprint), or just rely on the £/sqm evidence below.</p>
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
