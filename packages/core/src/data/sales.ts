/**
 * DP2 — CHOOSING WHICH SOLD RECORDS TO SHOW.
 *
 * Ranking comparables is a decision about the deal, not about the page: it
 * decides which evidence an investor is shown and which is left out. So it
 * lives here with the rest of the maths rather than in a component, where the
 * arithmetic ratchet correctly objected to finding it.
 */
import type { Sale } from './types';

/**
 * The highest-priced sales first, capped.
 *
 * Highest first because the reader is comparing a purchase price against what
 * the area actually achieves, and the top of the range is the part that says
 * whether the price paid was sensible. The cap exists so one page cannot turn
 * into a list of forty addresses.
 */
export function salesByPrice(sales: readonly Sale[], limit: number): Sale[] {
  return sales.slice().sort((a, b) => b.price - a.price).slice(0, Math.max(0, limit));
}
