/**
 * C1 — A DEAL THAT WAS JUDGED AGAINST A DIFFERENT SET OF SALES.
 *
 * ── WHAT ACTUALLY CHANGED, AND WHAT DID NOT ─────────────────────────────────
 * NOTHING STORED MOVED. A saved deal carries the numbers the person entered,
 * the score those produced, and the sector's own sold-price distribution — and
 * none of those three reads the comparables engine. So there is no figure to
 * rewrite and nothing has been rewritten.
 *
 * What DID change is the evidence the analyser puts in front of them. Before
 * C1 it compared against every sale within a mile, of any type; now it is the
 * subject's own type, twelve months, half a mile. Re-open a deal saved under
 * the old rule and the comparables — and the end value drawn from them — are
 * not the ones they were looking at when they judged it. That is worth saying
 * plainly, and worth saying only once.
 *
 * ── WHY THE FILTERS IN THE PARAMS DECIDE IT ─────────────────────────────────
 * The analyser writes a filter into a deal's URL only when it differs from the
 * default, so a deal that carries `radius`, `period` or `ctype` is one where
 * the person CHOSE those filters. Their choice still applies exactly as it did
 * and nothing has moved for them, so they are not told that it has.
 */
import { COMPARABLES_CHANGED } from '../../config/pipeline';
import type { BoardDeal } from './board';

/** The filter keys the analyser writes only when somebody has set them. */
const PINNED = ['radius', 'period', 'ctype'] as const;

export function comparablesMoved(
  deal: Pick<BoardDeal, 'status' | 'updated_at' | 'url_params'>,
): boolean {
  if (deal.status !== 'live') return false;
  const at = (deal.updated_at ?? '').slice(0, 10);
  // No date is not evidence that it is old. Silence beats a guess.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) return false;
  if (at >= COMPARABLES_CHANGED.at) return false;
  const params = new URLSearchParams(deal.url_params ?? '');
  return !PINNED.some((k) => (params.get(k) ?? '') !== '');
}
