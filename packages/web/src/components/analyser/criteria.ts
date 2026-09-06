/**
 * THE PERSON'S OWN MINIMUMS, CARRIED FROM THE PANEL (D4).
 *
 * The extension scores against the bar somebody set for themselves and says
 * "you set as your minimum" when it binds. The analyser used to ignore them and
 * judge the same property by the strategy's defaults, so one click on "Send to
 * my analyser" quietly changed the standard.
 *
 * Read ONCE at module load, like the other arrival params, so nothing can race a
 * component's mount. The maths is core's (`thresholdsFor`, `customKeysFor`);
 * this reads the URL and nothing else.
 */
import { MEASURED_PARAMS, criteriaFromParams, criteriaToParams, customKeysFor, thresholdsFor, type Criteria, type StrategyId } from '@gil-bricks/core';
import { features } from '../../config/features';

const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);

const numOf = (raw: string | null, min: number, max: number): number | undefined => {
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

/** What arrived, read by core's ONE reader — the same one the board's re-score
 *  uses, so the two can never bound a value differently. */
export const arrivedCriteria: Criteria = criteriaFromParams(params);

/** Serialised for every URL this page writes, so a saved deal carries the bar it
 *  was judged by and the board reproduces the analyser exactly (D4 review). */
export const criteriaQueryParams = (): Record<string, string> =>
  (features.criteriaHandoff ? criteriaToParams(arrivedCriteria) : {});

/** Room measurements taken on the floor plan in the panel (D4). */
export const arrivedRoomSizeFailures: number | null = (() => {
  const n = numOf(params.get(MEASURED_PARAMS.roomSizeFailures), 0, 50);
  return n === undefined ? null : Math.round(n);
})();
export const arrivedRoomsMeasured: number | null = (() => {
  const n = numOf(params.get(MEASURED_PARAMS.roomsMeasured), 0, 50);
  return n === undefined ? null : Math.round(n);
})();

/**
 * True when a carried minimum actually OVERRODE this strategy's own threshold.
 * A BTL minimum on a flip page changes nothing, and saying "judged by the
 * minimums you set" there would be a false claim (D4 review).
 */
export function hasArrivedCriteria(strategy: StrategyId): boolean {
  if (!features.criteriaHandoff) return false;
  return customKeysFor(arrivedCriteria, strategy).size > 0;
}

/**
 * The thresholds this strategy is judged by, and which of them are the person's
 * own. With no criteria carried, both are exactly what they always were.
 */
export function judgedBy(strategy: StrategyId, configThresholds: Record<string, number>): {
  thresholds: Record<string, number>;
  customKeys: Set<string>;
} {
  if (!hasArrivedCriteria(strategy)) return { thresholds: configThresholds, customKeys: new Set() };
  return {
    thresholds: thresholdsFor(strategy, arrivedCriteria),
    customKeys: customKeysFor(arrivedCriteria, strategy),
  };
}
