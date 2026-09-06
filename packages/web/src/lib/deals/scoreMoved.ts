/**
 * A SAVED SCORE THAT NO LONGER MATCHES WHAT THE DEAL PRODUCES (D4).
 *
 * D4 changed which sold evidence the Deal Score rests on: the sector's own price
 * distribution, on every surface, instead of the ValuationEngine on the web and
 * the sector in the panel. That is the right answer — it is why the panel said
 * 2.3 and the board said 1.1 about the same property — but it moves the score of
 * deals somebody has already saved and may well remember.
 *
 * So nothing is rewritten quietly. The card says what it was, what it is now,
 * and offers to take the new one. Until they do, the stored number stands.
 */
import { judgedValueOf, postcodeToSector, soldEvidenceFor, type SectorFile } from '@gil-bricks/core';
import { SCORE_MOVED } from '../../config/pipeline';
import { SOLD_EVIDENCE_OPTS } from '../../components/analyser/soldEvidence';
import { applyFacts, type DealFact } from './facts';
import { scoreFromParams } from './scoreFromParams';
import type { BoardDeal } from './board';

/** The subject sector a deal's own params put it in, or null. */
export function sectorOf(deal: Pick<BoardDeal, 'url_params'>): string | null {
  const pc = new URLSearchParams(deal.url_params).get('postcode') ?? '';
  if (pc.trim() === '') return null;
  const parsed = postcodeToSector(pc);
  return parsed.inEnglandWales ? parsed.sector : null;
}

export interface ScoreMove {
  /** What the card has been showing. */
  from: number;
  /** What the same inputs produce under today's rule. */
  to: number;
  /** Everything the accept needs, ready to send. */
  body: Record<string, unknown>;
}

/**
 * Null unless this deal's own inputs now produce a materially different score.
 * A deal with no sector loaded, no stored score, or one that is not live gets
 * nothing — silence is honest; a guess is not.
 */
export function scoreMoveFor(
  deal: BoardDeal,
  facts: readonly DealFact[],
  sector: SectorFile | null | undefined,
): ScoreMove | null {
  if (deal.status !== 'live' || deal.current_score === null || !Number.isFinite(deal.current_score)) return null;
  if (!sector) return null;
  const params = applyFacts(deal.strategy, deal.url_params, [...facts]);
  // The sold component judges the END value on a flip or BRRRR, not the price.
  // Using the price here would recompute the note against the wrong figure, and
  // accepting it would then WRITE that wrong score.
  const judged = judgedValueOf(deal.strategy, new URLSearchParams(params));
  if (judged <= 0) return null;
  const { evidence } = soldEvidenceFor(judged, sector, SOLD_EVIDENCE_OPTS);
  let scored;
  try {
    scored = scoreFromParams(deal.strategy, params, evidence, deal.room_size_failures ?? null);
  } catch {
    return null;
  }
  // Both numbers are shown to one decimal, so compare what is SHOWN: a raw
  // 0.09999 gap between two figures that both print 7.0 is not a move, and a
  // 6.85 vs 6.95 that print 6.9 and 7.0 is (D4 review).
  const moved = Math.round(Math.abs(scored.score - deal.current_score) * 10) / 10;
  if (moved < SCORE_MOVED.minPoints) return null;
  return {
    from: deal.current_score,
    to: scored.score,
    body: {
      score: scored.score,
      verdict_line: scored.verdict,
      headline_figure: scored.figure,
      sold_evidence: JSON.stringify(evidence ?? null),
      criteria_json: JSON.stringify({ source: 'evidence-rule-change', params }),
      evidence_json: JSON.stringify({ facts: facts.map((f) => ({ type: f.fact_type, value: f.value, at: f.entered_at })) }),
    },
  };
}
