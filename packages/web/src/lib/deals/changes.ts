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
import { features } from '../../config/features';
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
  /** D4 — the cash needed up front, before and after this fact. Null on rows
   *  written before the columns existed; the cash line is then simply absent. */
  from_cash?: number | null;
  to_cash?: number | null;
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

/**
 * D4 — the money you must find moved, whatever the score did. This is news on
 * its own: a £25,000 quote that leaves the score untouched still changes what
 * you have to put on the table.
 */
export function cashIsNews(fromCash: number | null, toCash: number | null): boolean {
  if (typeof fromCash !== 'number' || typeof toCash !== 'number') return false;
  if (!Number.isFinite(fromCash) || !Number.isFinite(toCash)) return false;
  const moved = fromCash < toCash ? toCash - fromCash : fromCash - toCash;
  return moved >= CHANGE_RULES.minCashChange;
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
  /** D4 — "You'd now need £72,000 up front, not £47,000.", or null. */
  cash: string | null;
  /** True when the CASH is the whole story: the score did not move at all. */
  cashOnly: boolean;
}

const score = (n: number): string => n.toFixed(1);

/** The change, said in the user's own voice. Nothing here is computed. */
export function changeLine(change: DealChange): ChangeLine {
  const type = factTypeFor(change.fact_type);
  const label = (type?.label ?? change.fact_type).toLowerCase();
  const scoreBetter = change.to_score > change.from_score;
  const direction = scoreBetter ? CHANGE_COPY.direction.up : CHANGE_COPY.direction.down;
  const value = change.fact_value === null ? '' : fmtMoney(change.fact_value);
  const moves = change.previous_value === null
    ? CHANGE_COPY.movesAdded(label, value, direction, score(change.to_score))
    : CHANGE_COPY.movesReplaced(label, value, fmtMoney(change.previous_value), direction, score(change.to_score));
  const cash = features.cashNeededChange && cashIsNews(change.from_cash ?? null, change.to_cash ?? null)
    ? CHANGE_COPY.cashMoved(fmtMoney(change.to_cash as number), fmtMoney(change.from_cash as number))
    : null;
  // Saying "this was 7.0 … moves it down to 7.0" would be nonsense: when the
  // score is unchanged the cash IS the change (D4).
  const cashOnly = cash !== null && change.from_score === change.to_score;
  return {
    was: CHANGE_COPY.was(score(change.from_score)),
    moves,
    verdict: change.to_verdict_line,
    killed: isKilled(change),
    // A FALL in what you must find up front is good news, and when the cash is
    // the whole story it decides the styling (D4 review).
    better: cashOnly ? (change.to_cash as number) < (change.from_cash as number) : scoreBetter,
    cash,
    cashOnly,
  };
}

/**
 * Has this row anything to say? (A1)
 *
 * A row where the score did not move only exists because the CASH moved, and
 * the cash line is flagged. With `cashNeededChange` off there is nothing left
 * to report: announcing it anyway would print "this was 7.0 … moves it down to
 * 7.0" on the card, and "the answer moved to 7.0" in the today line, when the
 * answer did not move at all. Rows written before that flag existed always
 * moved the score, so this is exactly what P6 did.
 */
export function saysSomething(change: DealChange): boolean {
  if (change.from_score !== change.to_score) return true;
  return features.cashNeededChange && cashIsNews(change.from_cash ?? null, change.to_cash ?? null);
}

/** The changes on one deal that nobody has seen yet, newest first. */
export function unseen(changes: readonly DealChange[], dealId: string): DealChange[] {
  return changes
    .filter((c) => c.deal_id === dealId && c.acknowledged_at === null && saysSomething(c))
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}
