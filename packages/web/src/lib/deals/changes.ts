/**
 * WHEN THE ANSWER CHANGES (P6).
 *
 * A fact re-scores a deal. This module decides whether that move is NEWS, and
 * turns a stored change into the sentences the card shows. It computes no money
 * and no score: every figure here has already come back from @gil-bricks/core.
 * The only arithmetic is comparing two scores that already exist, to decide
 * whether to speak — a display decision, never an input to one.
 *
 * The wording lives in CHANGE_COPY (src/config/pipeline.ts) so the operator can
 * reword any part of it, including for changes recorded months ago.
 */
import { fmtMoney, verdictForScore } from '@gil-bricks/core';
import { CHANGE_COPY, CHANGE_RULES } from '../../config/pipeline';
import { factTypeFor } from './facts';

export interface DealChange {
  id: string;
  deal_id: string;
  fact_type: string;
  /** The number the fact carried, or null for a flag. */
  fact_value: number | null;
  /** What that number replaced, or was added to — null when there was nothing. */
  previous_value: number | null;
  from_score: number;
  to_score: number;
  /** The engine's OWN line after the change: the consequence and the fix. */
  to_verdict_line: string;
  at: string;
  acknowledged_at: string | null;
}

/**
 * Is this move worth interrupting someone for? Crossing a verdict band always
 * is — the answer itself changed. Inside a band it takes `minPoints`. Both
 * rules live in CHANGE_RULES; neither is hardcoded here.
 */
export function isNews(fromScore: number, toScore: number): boolean {
  if (!Number.isFinite(fromScore) || !Number.isFinite(toScore)) return false;
  if (CHANGE_RULES.onBandChange && verdictForScore(fromScore) !== verdictForScore(toScore)) return true;
  const moved = fromScore < toScore ? toScore - fromScore : fromScore - toScore;
  return moved >= CHANGE_RULES.minPoints;
}

/** A deal a fact has just taken below where the score says walk away. */
export function isKilled(change: DealChange): boolean {
  return verdictForScore(change.to_score) === 'walk away' && verdictForScore(change.from_score) !== 'walk away';
}

export interface ChangeLine {
  /** "This was 9.4." */
  was: string;
  /** "The builder's quote £48,000 — you'd put £30,000 — moves it down to 6.8." */
  moves: string;
  /** The engine's own sentence: what it means now, and what would fix it. */
  verdict: string;
  /** True when the deal has just dropped below walk-away. */
  killed: boolean;
  /** Better news, so the card can style it as such. */
  better: boolean;
}

const score = (n: number): string => n.toFixed(1);

/** The change, said in the user's own voice. Nothing here is computed. */
export function changeLine(change: DealChange): ChangeLine {
  const type = factTypeFor(change.fact_type);
  const label = (type?.label ?? change.fact_type).toLowerCase();
  const better = change.to_score > change.from_score;
  const direction = better ? CHANGE_COPY.direction.up : CHANGE_COPY.direction.down;
  const value = change.fact_value === null ? '' : fmtMoney(change.fact_value);
  const moves = change.previous_value === null
    ? CHANGE_COPY.movesAdded(label, value, direction, score(change.to_score))
    : CHANGE_COPY.movesReplaced(label, value, fmtMoney(change.previous_value), direction, score(change.to_score));
  return {
    was: CHANGE_COPY.was(score(change.from_score)),
    moves,
    verdict: change.to_verdict_line,
    killed: isKilled(change),
    better,
  };
}

/** The changes on one deal that nobody has seen yet, newest first. */
export function unseen(changes: readonly DealChange[], dealId: string): DealChange[] {
  return changes
    .filter((c) => c.deal_id === dealId && c.acknowledged_at === null)
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}
