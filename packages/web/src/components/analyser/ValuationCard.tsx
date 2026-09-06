import { dominantTypeOf, fmtMoney, typeMismatch } from '@gil-bricks/core';
import { SECTION_STRIP } from '../../config/analyserSections';
import { COMPARABLES, PROPERTY_KINDS_PLURAL, VALUATION_TYPE_CHECK } from '../../config/comparables';
import { features } from '../../config/features';
import { COPY } from '../../config/copy';
import type { Valuation } from '@gil-bricks/core';
import type { AddressCandidate } from '@gil-bricks/core';
import { MathsAccordion } from './Accordion';
import { state, update } from './state';

export function ValuationCard({ valuation, lrState, candidates, byType = null, sectorSales = null }: {
  valuation: Valuation | null;
  lrState: 'ok' | 'timeout' | null;
  candidates: AddressCandidate[] | null;
  /** The subject sector's typical sold price per property type (D4). */
  byType?: Partial<Record<'D' | 'S' | 'T' | 'F', number | null>> | null;
  /** The subject sector's own sales — what "mostly houses" is counted from (D4). */
  sectorSales?: readonly { type: string }[] | null;
}) {
  const subjectType = state.value.type === '' ? null : state.value.type;
  // The judgement is core's; this only turns it into words (D4).
  const dominantType = dominantTypeOf(sectorSales, VALUATION_TYPE_CHECK.dominantShare);
  const mismatch = features.valuationTypeCaveat && valuation
    ? typeMismatch({ subjectType, byType, estimate: valuation.estimate, dominantType }, VALUATION_TYPE_CHECK)
    : null;
  const C = COPY.valuation.typeCaveat;
  const typeName = subjectType ? COMPARABLES.propertyTypes[subjectType].toLowerCase() : '';
  const typeNamePlural = subjectType === 'F' ? PROPERTY_KINDS_PLURAL.flats : `${typeName} house`;
  // Hoisted out of the JSX: a string compared inside markup reads as copy to the
  // inline-copy ratchet (and it is easier to follow up here anyway).
  const demoted = mismatch?.level === 'demote';
  const caveat = mismatch === null ? null : (
    <p class={`val-type-caveat${demoted ? ' val-type-lead' : ''}`} role="note">
      {mismatch.differentType && mismatch.dominantType && <strong>{C.mostly(PROPERTY_KINDS_PLURAL[mismatch.dominantType])} </strong>}
      {mismatch.typicalForType > 0
        ? C.aboveType(typeName, fmtMoney(mismatch.typicalForType))
        : C.noTypeEvidence(typeNamePlural)}
    </p>
  );
  return (
    <section class="glass card" id="valuation" aria-labelledby="val-h">
      <h2 id="val-h">{COPY.valuation.title}</h2>
      {candidates && candidates.length > 0 && (
        <div class="picker">
          <p>{COPY.valuation.addressPicker}</p>
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
          {/* The caveat sits WHERE the number is. Under a demote it leads and the
              estimate is demoted beneath it — never removed, never replaced (D4). */}
          {demoted ? (
            <>
              {caveat}
              <p class="val-demoted-label">{C.demotedLabel}</p>
              <p class="val-demoted-figure">{fmtMoney(valuation.estimate)}</p>
            </>
          ) : (
            <>
              <p class="big-figure">{fmtMoney(valuation.estimate)}</p>
              {caveat}
            </>
          )}
          <p class="range-line">
            {COPY.valuation.rangeLead} <strong>{fmtMoney(valuation.range.low)}</strong> {COPY.valuation.rangeJoin}{' '}
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
          <MathsAccordion breakdown={valuation.breakdown} label={SECTION_STRIP.mathsFor(valuation.breakdown.label.toLowerCase())} />
          <p class="context-note">{COPY.valuation.contextOnly}</p>
        </>
      )}
    </section>
  );
}
