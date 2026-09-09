/**
 * The tax, named, with its own figure (E9).
 *
 * WHY THIS EXISTS. Stamp duty is the biggest acquisition cost after the deposit
 * and it is inside cash-in on every strategy — but it was only VISIBLE on the
 * buy-to-let analyser. On flip, BRRRR and HMO the words "stamp duty" appeared
 * only inside a collapsed maths accordion, in the middle of a chain of
 * additions, attached to no figure of its own. The operator went looking for it
 * and could not find it, which is the whole test.
 *
 * ONE component for all four, so they cannot drift apart. It formats; it never
 * computes: the amount, the regime, the bands and whether the surcharge applied
 * are all facts from @gil-bricks/core's stampDuty.
 */
import { fmtMoney, fmtPct, type StampDutyResult, type WithBreakdown } from '@gil-bricks/core';
import { MathsAccordion } from './Accordion';
import { STAMP_DUTY_COPY } from '../../config/verdicts';

export function StampDutyCost({ id, sdlt, viaCompany = false }: {
  id?: string;
  sdlt: WithBreakdown<StampDutyResult>;
  /** Buying through a limited company forces the higher rates, so the "Purchase
   *  tax basis" choice is not the whole story and must not be the only thing
   *  we point at. */
  viaCompany?: boolean;
}) {
  const v = sdlt.value;
  return (
    <div class="tile tile-cost" id={id}>
      <p class="tile-label">{STAMP_DUTY_COPY.name(v.country)}</p>
      <p class="tile-value">{fmtMoney(v.tax)}</p>
      <p class="field-hint">{STAMP_DUTY_COPY.rules(v.country, v.buyerType, v.surchargeApplied)}</p>
      <p class="field-hint">{viaCompany ? STAMP_DUTY_COPY.forcedByCompany : STAMP_DUTY_COPY.changesWith}</p>
      <MathsAccordion breakdown={sdlt.breakdown}>
        <div class="bands">
          {v.bands.filter((b) => b.tax > 0).map((b) => (
            <p class="field-hint">{STAMP_DUTY_COPY.band(fmtPct(b.rate * 100), fmtMoney(b.slice), fmtMoney(b.tax))}</p>
          ))}
          <p class="field-hint">{STAMP_DUTY_COPY.asOf(v.effectiveFrom)}</p>
        </div>
      </MathsAccordion>
    </div>
  );
}
