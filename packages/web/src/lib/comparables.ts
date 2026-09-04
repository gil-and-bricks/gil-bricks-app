/**
 * Pure decisions for the comparables module on a phone (N3). No DOM, no copy —
 * the words live in config/comparables.ts and every figure is formatted by
 * @gil-bricks/core. Tested in comparables.test.ts.
 */
import { DEFAULTS, type UrlState } from '../components/analyser/state';

/** The comparables filters, in the order they appear in the sheet. `excluded`
 * and `view` are not filters — they are what you ticked and what you're looking at. */
export const FILTER_KEYS = ['radius', 'period', 'ctype', 'tenure', 'cage', 'minArea', 'maxArea', 'minPrice', 'maxPrice'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

/** How many filters are set to something other than their default — the number
 * on the Filters button, so a folded sheet can never hide a filter silently. */
export function activeFilterCount(s: Pick<UrlState, FilterKey>): number {
  return FILTER_KEYS.filter((k) => {
    const value = (s as Record<string, string>)[k] ?? '';
    return value !== '' && value !== (DEFAULTS as unknown as Record<string, string>)[k];
  }).length;
}

/** The filters back to their defaults — one patch, so resetting can never miss
 * a key or clobber the ticks and the view. */
export function clearedFilters(): Pick<UrlState, FilterKey> {
  const out = {} as Record<string, string>;
  for (const k of FILTER_KEYS) out[k] = (DEFAULTS as unknown as Record<string, string>)[k];
  return out as Pick<UrlState, FilterKey>;
}

/** Cards or table? Cards below the site's mobile breakpoint — a phone should
 * never have to scroll an 11-column table sideways to tick one box. */
export const CARDS_MAX_WIDTH = 640;
export function wantsCards(viewportWidth: number, flagOn: boolean): boolean {
  return flagOn && viewportWidth > 0 && viewportWidth <= CARDS_MAX_WIDTH;
}
