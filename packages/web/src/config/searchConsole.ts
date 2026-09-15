/**
 * S1 — WHAT "FALLS OFF A CLIFF" MEANS, so it can be tuned without code.
 *
 * A console nobody opens is worth nothing, so this exists to come and find the
 * operator rather than wait to be visited. The thresholds are here, in config,
 * because the right numbers are not knowable in advance — a site with 40
 * impressions a day and one with 40,000 need different definitions of a cliff,
 * and the only way to find out is to watch it for a month and adjust.
 *
 * THE SHAPE OF THE COMPARISON. Search data is weekly-seasonal — a Tuesday looks
 * nothing like a Sunday — so nothing here compares a day with the day before it.
 * Every check compares the last 7 days with the 7 days before that, which
 * cancels the weekday effect. Search Console data also lags by about two days,
 * so both windows are offset to avoid reading a half-filled bucket as a
 * collapse.
 *
 * THE FLOOR EXISTS TO STOP NOISE. On small numbers a "50% drop" is two clicks
 * becoming one, and an alert that cries wolf gets muted, which is worse than no
 * alert. Below `minImpressionsToJudge` a drop is recorded but never alerted on.
 */
export const SEARCH_MONITOR = {
  /** Search Console data lags; do not read the most recent days as real. */
  lagDays: 3,
  /** Each window, in days. 7 cancels the weekday effect; 1 does not. */
  windowDays: 7,

  /**
   * Below this many impressions in the earlier window, a percentage change is
   * noise and is never alerted on. Recorded in history either way.
   */
  minImpressionsToJudge: 50,

  /** A fall of THIS MUCH or more, week on week, is a cliff. 0.5 = halved. */
  impressionsDropAlert: 0.5,
  clicksDropAlert: 0.6,

  /**
   * Average position getting WORSE by this many places. Positive is worse:
   * position 8 → 14 is a rise of 6. Coarse on purpose — position moves about.
   */
  positionWorseningAlert: 5,

  /**
   * INDEXATION IS THE ONE THAT MATTERS MOST, and it gets the tightest rule. If
   * the number of pages Google has indexed falls by even a fifth, something has
   * gone wrong that no amount of ranking work will fix — a bad robots.txt, a
   * noindex that escaped, a broken sitemap.
   */
  indexedDropAlert: 0.2,
  /** Never alert on indexation below this many pages; the site has ~19. */
  minIndexedToJudge: 5,

  /** How many daily rows of history to keep. A year, so a year-on-year is possible. */
  historyDays: 400,
} as const;

export interface SearchSnapshot {
  /** ISO date of the day this snapshot describes. */
  day: string;
  impressions: number;
  clicks: number;
  /** Google's average position. Lower is better. */
  position: number;
  /** Pages Google reports as indexed, when the API provides it. */
  indexed: number | null;
}

export interface CliffVerdict {
  id: string;
  fell: boolean;
  detail: string;
}

/** Sum a window, guarding against a short or empty series. */
function windowTotals(rows: readonly SearchSnapshot[]): { impressions: number; clicks: number; position: number } {
  if (rows.length === 0) return { impressions: 0, clicks: 0, position: 0 };
  const impressions = rows.reduce((n, r) => n + r.impressions, 0);
  const clicks = rows.reduce((n, r) => n + r.clicks, 0);
  // Position is an average, so it is weighted by impressions or it lies: a day
  // with 2 impressions at position 1 must not outvote 2,000 at position 30.
  const weighted = rows.reduce((n, r) => n + r.position * r.impressions, 0);
  return { impressions, clicks, position: impressions === 0 ? 0 : weighted / impressions };
}

/**
 * Compare the most recent complete window with the one before it and say what,
 * if anything, fell off a cliff.
 *
 * PURE, so it can be tested without a network or a credential — which is the
 * whole reason the thresholds live in config and the comparison lives here
 * rather than inside the job that fetches the data.
 */
export function findCliffs(history: readonly SearchSnapshot[]): CliffVerdict[] {
  const cfg = SEARCH_MONITOR;
  const sorted = [...history].sort((a, b) => a.day.localeCompare(b.day));
  const usable = sorted.slice(0, Math.max(0, sorted.length - cfg.lagDays));
  const out: CliffVerdict[] = [];

  if (usable.length < cfg.windowDays * 2) {
    return [{
      id: 'history',
      fell: false,
      detail: `only ${usable.length} usable days — need ${cfg.windowDays * 2} before a comparison means anything`,
    }];
  }

  const recent = usable.slice(-cfg.windowDays);
  const earlier = usable.slice(-cfg.windowDays * 2, -cfg.windowDays);
  const now = windowTotals(recent);
  const was = windowTotals(earlier);

  const drop = (a: number, b: number): number => (b === 0 ? 0 : (b - a) / b);

  if (was.impressions < cfg.minImpressionsToJudge) {
    out.push({
      id: 'impressions',
      fell: false,
      detail: `${was.impressions} impressions last week — below the floor of ${cfg.minImpressionsToJudge}, so a percentage would be noise`,
    });
  } else {
    const d = drop(now.impressions, was.impressions);
    out.push({
      id: 'impressions',
      fell: d >= cfg.impressionsDropAlert,
      detail: `${was.impressions} → ${now.impressions} (${(d * 100).toFixed(0)}% down)`,
    });
    const dc = drop(now.clicks, was.clicks);
    out.push({
      id: 'clicks',
      fell: dc >= cfg.clicksDropAlert,
      detail: `${was.clicks} → ${now.clicks} (${(dc * 100).toFixed(0)}% down)`,
    });
    const worse = now.position - was.position;
    out.push({
      id: 'position',
      fell: worse >= cfg.positionWorseningAlert,
      detail: `average position ${was.position.toFixed(1)} → ${now.position.toFixed(1)}`,
    });
  }

  const idxNow = recent.map((r) => r.indexed).filter((n): n is number => n !== null).at(-1) ?? null;
  const idxWas = earlier.map((r) => r.indexed).filter((n): n is number => n !== null).at(-1) ?? null;
  if (idxNow === null || idxWas === null) {
    out.push({ id: 'indexed', fell: false, detail: 'no indexation figure in this window' });
  } else if (idxWas < cfg.minIndexedToJudge) {
    out.push({ id: 'indexed', fell: false, detail: `${idxWas} pages indexed — below the floor to judge` });
  } else {
    const d = drop(idxNow, idxWas);
    out.push({
      id: 'indexed',
      fell: d >= cfg.indexedDropAlert,
      detail: `${idxWas} → ${idxNow} pages indexed (${(d * 100).toFixed(0)}% down)`,
    });
  }
  return out;
}
