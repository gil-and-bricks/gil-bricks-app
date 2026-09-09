/**
 * How old is the sold-price data, and is that older than it should ever be?
 *
 * WHY THIS EXISTS. The monthly data refresh is a scheduled GitHub Action. When
 * it broke (ONSPD renamed a column, 2026-09) the site carried on serving the
 * last good data with no sign anything had stopped — the footer said "as of
 * 2026-07" and would have gone on saying it for ever. The date was true; the
 * silence was the problem.
 *
 * The maths lives here, in core, because a component may format a figure and
 * never compute one (CLAUDE.md → reversibility charter, rule 3).
 */

export interface Freshness {
  /** False when the manifest carries no usable date — we then claim NOTHING. */
  known: boolean;
  /** Whole days since the pipeline last wrote the manifest. */
  ageDays: number;
  /** True once a monthly refresh has plainly been missed. */
  stale: boolean;
}

const DAY_MS = 86_400_000;

/**
 * @param generatedAt the manifest's own ISO timestamp
 * @param nowMs       the caller's clock
 * @param staleAfterDays the threshold, from config — never hardcoded here
 */
export function dataFreshness(generatedAt: string | null | undefined, nowMs: number, staleAfterDays: number): Freshness {
  const at = typeof generatedAt === 'string' ? Date.parse(generatedAt) : Number.NaN;
  if (!Number.isFinite(at) || !Number.isFinite(nowMs)) return { known: false, ageDays: 0, stale: false };
  // A manifest dated in the future is a clock disagreeing with itself, not fresh
  // data and not stale data. Clamp to zero rather than reporting nonsense.
  const ageDays = Math.max(0, Math.floor((nowMs - at) / DAY_MS));
  return { known: true, ageDays, stale: staleAfterDays > 0 && ageDays >= staleAfterDays };
}
