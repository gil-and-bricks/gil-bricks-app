/**
 * The read-once params (P7 review).
 *
 * `deal`, `factsAt` and `ev` are metadata about the deal this page was opened
 * from. They are stripped from the URL as soon as they have been read, so a link
 * copied before the first edit cannot tell a stranger's page something untrue —
 * which means they must be captured ONCE, at module load, BEFORE any component
 * mounts and before anything can rewrite the address bar. Capturing them in a
 * component's own ref was a race: whichever ran first won.
 */
const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);

/**
 * Everything here is stripped from the URL once read.
 *
 * The room MEASUREMENTS go too (D4 review): they are somebody's own work on a
 * floor plan, and a link copied out of the address bar must not carry them —
 * or a stranger's page would claim measurements nobody took. The criteria do
 * NOT: they are the bar this page is judged by, they are shown on screen as
 * such, and they have to survive a strategy switch and land in the saved deal
 * so the board judges it the same way.
 */
export const READ_ONCE = ['src', 'areaSrc', 'deal', 'factsAt', 'ev', 'roomFails', 'roomsMeasured'] as const;

/** The deal this page was opened from, or null. */
export const arrivedDealId: string | null = params.get('deal');
/** The newest fact those params already include — only those are folded in. */
export const arrivedFactsAt: string | null = params.get('factsAt');
/** Which KINDS of fact are behind these numbers (keys only, never values). */
export const arrivedFactKeys: readonly string[] = (params.get('ev') ?? '')
  .split('.')
  .filter((k) => /^[a-z-]{3,30}$/.test(k));
