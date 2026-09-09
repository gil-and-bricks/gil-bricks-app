/**
 * When the sold-price data is old enough to say so (C3 follow-up).
 *
 * The monthly refresh is a scheduled job. When it stops, nothing else notices:
 * the site keeps serving the last good files and the footer keeps printing
 * their true — and frozen — as-of month. This is the threshold at which the
 * page stops leaving that to the reader, and the sentence it says.
 *
 * The maths is in @gil-bricks/core (`dataFreshness`); nothing here computes.
 */
export const DATA_FRESHNESS = {
  /**
   * Days since the pipeline last wrote the manifest. The refresh runs on the
   * 2nd of each month, so a healthy site is never more than ~31 days old; 45
   * gives a slow month room to land and still speaks about two weeks after a
   * cycle has plainly been missed.
   */
  staleAfterDays: 45,
  /** Said beside the as-of date, never instead of it. */
  note: 'This is older than usual — treat the figures as a rough guide.',
} as const;
