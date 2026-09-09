/**
 * When the app should call itself unhealthy (C3 follow-up).
 *
 * Every threshold the health endpoint uses lives here, so tuning the alarm is a
 * config edit and never a code change. Nothing here computes: the checks are in
 * src/worker/lib/health.ts and the data-age maths is in @gil-bricks/core.
 *
 * Set a threshold too tight and the operator learns to ignore the alert, which
 * is worse than having none. These are deliberately generous.
 */
import { DATA_FRESHNESS } from './freshness';

export const HEALTH = {
  /**
   * A Kit outbox row still 'pending' this long has stopped being retried — the
   * cron runs every 15 minutes and gives up after its own attempt limit. Three
   * hours is twelve missed attempts, not a blip.
   */
  outboxPendingMaxMinutes: 180,
  /**
   * Rows that gave up entirely. ANY of these is somebody's enquiry that never
   * reached Kit, so the threshold is one — but only counting recent ones, so an
   * old failure that has already been dealt with stops shouting.
   */
  outboxFailedWithinDays: 14,
  /** The 15-minute cron. Four missed firings, not one. */
  outboxCronMaxMinutes: 90,
  /** The daily 06:00 UTC cron, with two hours of slack for a late trigger. */
  dailyCronMaxHours: 26,
  /**
   * The monthly data refresh, in days. TAKEN from the footer's own threshold,
   * not retyped beside it: the page tells visitors at the same moment the
   * endpoint tells the operator, so the two can never disagree about what
   * "stale" means.
   */
  dataStaleAfterDays: DATA_FRESHNESS.staleAfterDays,
  /** A slow answer is a broken answer to a poller. */
  manifestTimeoutMs: 8000,
} as const;
