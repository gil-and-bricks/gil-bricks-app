/**
 * Personal deal criteria (E7). The user's OWN bars replace the config defaults
 * in scoring for that user — minimum cashflow / ROI / ICR (rental strategies),
 * minimum profit (Flip), plus deposit % and rate. Lives in core so the web app
 * can adopt the same criteria later. Every field is OPTIONAL: unset ⇒ the
 * strategy's config default is used, so behaviour is unchanged until the user
 * touches a value. Stored locally only.
 */
import { strategyById } from '../strategies';
import type { StrategyId } from '../score/scoreDeal';

export interface Criteria {
  /** Cash share of the price (%). */
  depositPct?: number;
  /** Mortgage rate (%). */
  ratePct?: number;
  /** Minimum monthly cashflow after tax (£) — BTL/BRRRR/HMO. */
  minCashflow?: number;
  /** Minimum return on cash (%) — BTL/HMO. */
  minRoi?: number;
  /** Minimum ICR (×) — BTL/BRRRR/HMO. */
  minIcr?: number;
  /** Minimum profit before tax (£) — Flip. */
  minProfit?: number;
}

export interface CriterionField {
  key: keyof Criteria;
  label: string;
  unit: string;
  /** The current effective default (shown in Settings until the user overrides). */
  default: number;
  /** One-line explanation. */
  hint: string;
}

/** The effective defaults, read from the SAME config the web app scores against. */
export function criteriaDefaults(): Required<Criteria> {
  const btl = strategyById('btl')!.thresholds as Record<string, number>;
  const flip = strategyById('flip')!.thresholds as Record<string, number>;
  const dep = strategyById('btl')!.strategyInputs.find((f) => f.key === 'deposit');
  const rate = strategyById('btl')!.strategyInputs.find((f) => f.key === 'rate');
  return {
    depositPct: Number(dep?.default ?? 25),
    ratePct: Number(rate?.default ?? 5),
    minCashflow: btl.minCashflowGreen,
    minRoi: btl.minRoiGreen,
    minIcr: btl.icrBasic,
    minProfit: flip.greenProfit,
  };
}

/** The Settings-screen field list (order + labels + current defaults). */
export function criteriaFields(): CriterionField[] {
  const d = criteriaDefaults();
  return [
    { key: 'depositPct', label: 'Deposit', unit: '%', default: d.depositPct, hint: 'Your cash share of the price.' },
    { key: 'ratePct', label: 'Mortgage rate', unit: '%', default: d.ratePct, hint: 'The interest rate you’d expect.' },
    { key: 'minCashflow', label: 'Minimum cashflow', unit: '£/mo', default: d.minCashflow, hint: 'Least monthly profit (after tax) you’ll accept.' },
    { key: 'minRoi', label: 'Minimum return', unit: '%', default: d.minRoi, hint: 'Least return on the cash you put in.' },
    { key: 'minIcr', label: 'Minimum ICR', unit: '×', default: d.minIcr, hint: 'Least rent-to-mortgage cover a lender needs.' },
    { key: 'minProfit', label: 'Minimum profit (Flip)', unit: '£', default: d.minProfit, hint: 'Least profit before tax you’ll accept on a flip.' },
  ];
}

/** Strategy thresholds with the user's criteria applied where relevant. */
export function thresholdsFor(strategy: StrategyId, criteria: Criteria): Record<string, number> {
  const t: Record<string, number> = { ...(strategyById(strategy)!.thresholds as Record<string, number>) };
  if (criteria.minCashflow != null && 'minCashflowGreen' in t) t.minCashflowGreen = criteria.minCashflow;
  if (criteria.minRoi != null && 'minRoiGreen' in t) t.minRoiGreen = criteria.minRoi;
  if (criteria.minIcr != null && 'icrBasic' in t) {
    t.icrBasic = criteria.minIcr;
    t.icrHigher = criteria.minIcr;
  }
  if (criteria.minProfit != null && 'greenProfit' in t) t.greenProfit = criteria.minProfit;
  return t;
}

/**
 * Which score-component keys the user has personally set FOR THIS STRATEGY —
 * drives the "you set as your minimum" copy. Mirrors thresholdsFor: a key is
 * only "custom" where the criterion actually overrode that strategy's threshold
 * (so e.g. a BTL/HMO minRoi never claims Flip's config greenRoi as the user's).
 */
export function customKeysFor(criteria: Criteria, strategy: StrategyId): Set<string> {
  const t = (strategyById(strategy)?.thresholds ?? {}) as Record<string, number>;
  const keys = new Set<string>();
  if (criteria.minCashflow != null && 'minCashflowGreen' in t) keys.add('cashflow');
  if (criteria.minRoi != null && 'minRoiGreen' in t) keys.add('roi');
  if (criteria.minIcr != null && 'icrBasic' in t) keys.add('icr');
  if (criteria.minProfit != null && 'greenProfit' in t) keys.add('profit');
  return keys;
}

/** True when the user has customised any criterion (differs from config). */
export function criteriaAreCustom(criteria: Criteria): boolean {
  return (
    criteria.minCashflow != null || criteria.minRoi != null || criteria.minIcr != null ||
    criteria.minProfit != null || criteria.depositPct != null || criteria.ratePct != null
  );
}
