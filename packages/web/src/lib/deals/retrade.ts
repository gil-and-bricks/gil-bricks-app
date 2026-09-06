/**
 * THE RE-TRADE RADAR's decision (P11) — pure, and testable without a board.
 *
 * It answers three questions in order, and stops at the first "no":
 *   1. is this deal still alive, and does it carry a fact that re-trades?
 *   2. did that fact actually MOVE the deal? (a fact that cost nothing is not a
 *      negotiation, and inventing one would be the worst thing this could do)
 *   3. is there a lower price that puts the deal back where it was? (if no price
 *      does, we say exactly that, and hand over no message at all)
 *
 * NO MATHS LIVES HERE. The scores come back from the ONE scoring path, and the
 * new maximum from @gil-bricks/core's reverse solve. This only asks.
 */
import { fmtMoney, verdictForScore, type Verdict } from '@gil-bricks/core';
import { RETRADE } from '../../config/pipeline';
import { applyFacts, factMoves, factTypeFor, type DealFact } from './facts';
import { maxOfferFromParams, scoreFromParams, type SoldEvidence } from './scoreFromParams';
import type { BoardDeal } from './board';

export interface Retrade {
  /** The fact that opened it. */
  factId: string;
  factType: string;
  /** What the deal is on the table at, and what it is now worth. */
  price: number;
  maxOffer: number | null;
  /** What it scored before this fact, and after it. */
  before: number;
  after: number;
  /** The words to paste, or '' when there is nothing honest to say. */
  message: string;
}

/** The price a set of params is about. */
function priceOf(params: string): number {
  const n = Number(new URLSearchParams(params).get('price') ?? '');
  return Number.isFinite(n) ? n : 0;
}

/**
 * The radar for a deal, or null when there is nothing to say. `evidence` and
 * `roomSizeFailures` are what the SAVE knew, so every score here is judged on
 * the same footing as the card's own (P5.1).
 */
export function retradeFor(
  deal: BoardDeal,
  facts: readonly DealFact[],
  evidence?: SoldEvidence | null,
  roomSizeFailures?: number | null,
): Retrade | null {
  // A dead or bought deal is not a negotiation.
  if (deal.status !== 'live') return null;
  // The newest un-folded fact that re-trades. A folded fact is already IN the
  // deal's numbers — that conversation has been had.
  const trigger = [...facts]
    .filter((f) => RETRADE.facts.includes(f.fact_type))
    .filter((f) => (f.folded_at ?? null) === null && f.value !== null)
    .sort((a, b) => a.entered_at.localeCompare(b.entered_at) || a.id.localeCompare(b.id))
    .pop();
  if (!trigger) return null;
  // A fact this strategy has no input for cannot have moved the price.
  if (!factMoves(trigger.fact_type, deal.strategy)) return null;

  const withFact = applyFacts(deal.strategy, deal.url_params, facts);
  const without = applyFacts(deal.strategy, deal.url_params, facts.filter((f) => f.id !== trigger.id));
  let before: number;
  let after: number;
  try {
    before = scoreFromParams(deal.strategy, without, evidence, roomSizeFailures).score;
    after = scoreFromParams(deal.strategy, withFact, evidence, roomSizeFailures).score;
  } catch {
    return null; // not scoreable at all — there is no negotiation to have
  }
  // It cost nothing, so there is nothing to ask for.
  if (after >= before) return null;

  // Aim at where the deal WAS. If it was already below the bar, aim at the
  // lowest band the score still calls a deal (RETRADE.floorTarget).
  const held = verdictForScore(before);
  const target: Verdict = held === 'walk away' ? RETRADE.floorTarget : held;
  const price = priceOf(withFact);
  const maxOffer = maxOfferFromParams(deal.strategy, withFact, target, evidence, roomSizeFailures);
  // No discount needed is not a re-trade either.
  if (maxOffer !== null && maxOffer >= price) return null;

  const opener = factTypeFor(trigger.fact_type)?.retrade?.(fmtMoney(trigger.value as number)) ?? '';
  const message = maxOffer === null || opener === ''
    ? '' // nothing honest to send: no price fixes it, or the fact has no words
    : RETRADE.message(opener, fmtMoney(price), fmtMoney(maxOffer));
  return { factId: trigger.id, factType: trigger.fact_type, price, maxOffer, before, after, message };
}
