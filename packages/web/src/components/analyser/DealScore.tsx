/**
 * Deal Score UI (E2): a verdict chip (score + traffic light + headline) shown
 * at the top of an analyser's results, and the binding-constraint sentence
 * shown inside the existing verdict card. The score, verdict and constraint all
 * come from @gil-bricks/core's scoreDeal — the SINGLE verdict source shared
 * with the future extension. This component only presents; it computes nothing.
 */
import type { DealScore } from '@gil-bricks/core';
import { DEAL_SCORE_COPY } from '../../config/misc';

const LIGHT: Record<DealScore['verdict'], { cls: string; dot: string }> = {
  good: { cls: 'ds-good', dot: '●' },
  marginal: { cls: 'ds-marginal', dot: '●' },
  'walk away': { cls: 'ds-walk', dot: '●' },
};

export function DealScoreChip({ deal }: { deal: DealScore | null }) {
  if (!deal) return null;
  const l = LIGHT[deal.verdict];
  // role="img" (not "status"): there is exactly ONE polite live region on the
  // page — the sticky verdict bar while features.stickyVerdict is on, the
  // verdict banner when it is off. A second live region here would
  // double-announce and can drop messages. The full label carries score,
  // verdict AND headline so screen-reader users get the same summary sighted
  // users see. Score is formatted to match the visible "7.9".
  return (
    <div
      class={`deal-score ${l.cls}`}
      role="img"
      aria-label={DEAL_SCORE_COPY.ariaLabel(deal.score.toFixed(1), deal.verdict, deal.headline)}
    >
      <span class="ds-score">
        <strong>{deal.score.toFixed(1)}</strong>
        <span class="ds-outof">/10</span>
      </span>
      <span class="ds-light" aria-hidden="true">{l.dot}</span>
      <span class="ds-verdict">{deal.verdict}</span>
      <span class="ds-headline">{deal.headline}</span>
    </div>
  );
}

/** The single binding constraint, shown inside the verdict card. */
export function BindingConstraintNote({ deal }: { deal: DealScore | null }) {
  if (!deal || !deal.bindingConstraint) return null;
  const bc = deal.bindingConstraint;
  // plainExplanation is already a self-contained sentence (names the killing
  // number + the fix), so no "{metric} is {currentValue}" prefix — that produced
  // broken English for money-left-in / room-size and was redundant here.
  return (
    <p class="binding-note">
      <span class="binding-label">{DEAL_SCORE_COPY.bindingLead}</span> {bc.plainExplanation}
    </p>
  );
}
