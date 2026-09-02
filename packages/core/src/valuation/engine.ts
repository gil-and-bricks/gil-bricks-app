/**
 * The ONE ValuationEngine (CLAUDE.md golden rule 3, Money & tax):
 * estimate = blend of two evidence lines —
 *   A: the subject's own last sale indexed to the data month with UK HPI
 *      (country-level: the local signal lives in line B, HPI carries market
 *      drift; finer HPI geography is a logged future upgrade);
 *   B: area £/sqm (the ComparablesEngine's typical £/sqm) × internal area.
 *      (CLAUDE.md words this line in £/sqft — identical maths, £/sqm units.)
 * NO per-attribute % adjustments — beds/baths/garden/parking are context the
 * user reads in the comps list, never multipliers (LOCKED rule).
 * Confidence is words + a plain range (±5/10/20%), never a bare %.
 */
import { getManifest, getUkhpi } from '../data/client';
import type { CountryCode } from '../data/types';
import type { Breakdown } from '../maths/breakdown';
import { fmtMoney } from '../maths/format';
import { valuationRange, type Confidence, type ValuationRange } from '../maths/valuation';
import { computeStats, findComparables, type ComparablesResult } from '../comparables/engine';
import { fetchSaleHistory } from '../landregistry/history';
import { ComparablesError } from '../comparables/errors';

export interface ValuationInput {
  postcode: string;
  /** House number/name — lets the engine auto-fill the last sale from
   * Land Registry when the user hasn't supplied one. */
  paon?: string;
  /** Flat number, when applicable. */
  saon?: string;
  /** Internal floor area, sqm — enables evidence line B. */
  floorAreaSqm?: number;
  /** What the subject last sold for — enables evidence line A; always wins
   * over the automatic Land Registry lookup. */
  lastSalePrice?: number;
  /** Completion date of that sale, yyyy-mm-dd or yyyy-mm. */
  lastSaleDate?: string;
  /** Reuse an existing comparables search (must be for the SAME postcode);
   * otherwise the engine runs its own (1 mile, 12 months, all types). */
  comparables?: ComparablesResult;
}

export interface EvidenceLine {
  label: 'Indexed last sale' | 'Area £/sqm × floor area';
  estimate: number;
  breakdown: Breakdown;
}

export interface Valuation {
  estimate: number;
  range: ValuationRange;
  confidence: Confidence;
  /** Why this confidence, in plain words. */
  confidenceReason: string;
  lines: EvidenceLine[];
  breakdown: Breakdown;
  /** As-of month of the evidence: the HPI month when the last sale was
   * indexed, otherwise the sales-data month. */
  asOf: string;
  /** Where line A's last sale came from. */
  lastSaleSource: 'landregistry' | 'user' | 'none';
}

/** Strict yyyy-mm(-dd) with a real month; returns the yyyy-mm. */
function monthOf(date: string): string {
  const m = /^(\d{4})-(\d{2})(-\d{2})?$/.exec(date.trim());
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) {
    throw new ComparablesError('BadInput', `lastSaleDate must be a real date, yyyy-mm or yyyy-mm-dd (got "${date}")`);
  }
  return `${m[1]}-${m[2]}`;
}

const compact = (pc: string): string => pc.trim().toUpperCase().replace(/\s+/g, '');

export async function valueProperty(input: ValuationInput): Promise<Valuation> {
  const userGaveSale = input.lastSalePrice !== undefined || input.lastSaleDate !== undefined;
  if (userGaveSale && (input.lastSalePrice === undefined || input.lastSaleDate === undefined)) {
    throw new ComparablesError('BadInput', 'A last sale needs both its price and its date');
  }
  if (input.lastSalePrice !== undefined && (!Number.isFinite(input.lastSalePrice) || input.lastSalePrice <= 0)) {
    throw new ComparablesError('BadInput', `lastSalePrice must be a positive number (got ${String(input.lastSalePrice)})`);
  }
  // fail fast on a malformed date — before any network work
  let saleMonth = userGaveSale ? monthOf(input.lastSaleDate as string) : null;
  let salePrice = input.lastSalePrice ?? null;
  let lastSaleSource: 'landregistry' | 'user' | 'none' = userGaveSale ? 'user' : 'none';
  if (input.floorAreaSqm !== undefined && (!Number.isFinite(input.floorAreaSqm) || input.floorAreaSqm < 10 || input.floorAreaSqm > 500)) {
    throw new ComparablesError('BadInput', 'floorAreaSqm must be between 10 and 500 (the honest EPC bounds)');
  }

  // Auto-fill line A from Land Registry when the user gave an address but no
  // sale. Best-effort: lookup failures or ambiguity degrade to no line A —
  // the automatic enhancement must never break the core valuation.
  if (!userGaveSale && input.paon !== undefined && input.paon.trim() !== '') {
    try {
      const history = await fetchSaleHistory({ postcode: input.postcode, paon: input.paon, saon: input.saon });
      if (history.kind === 'ok') {
        // only a sale the HPI can actually index: UKHPI lags PPD by a month
        // or two, so a very recent auto-found sale must not break line A —
        // fall back to the next-newest category-A sale that is indexable
        const [ukhpi, manifest] = await Promise.all([getUkhpi(), getManifest()]);
        const hpiEnd = manifest.ukhpiMonth || ukhpi.ukhpiMonth;
        const newest = history.sales.find((s) => s.category === 'A' && s.date.slice(0, 7) <= hpiEnd);
        if (newest) {
          saleMonth = newest.date.slice(0, 7);
          salePrice = newest.price;
          lastSaleSource = 'landregistry';
        }
      }
      // ambiguous → the UI should call fetchSaleHistory itself and ask the user
    } catch {
      // timeout/network — carry on without line A
    }
  }
  const hasA = salePrice !== null && saleMonth !== null;

  if (!hasA && input.floorAreaSqm === undefined) {
    throw new ComparablesError('BadInput', 'Nothing to value with — provide the last sale (price + date), the floor area, or both');
  }

  // Comparables run also resolves the subject (postcode → country) for line A.
  const comps = input.comparables ??
    (await findComparables({
      postcode: input.postcode,
      radiusMiles: 1,
      periodMonths: 12,
      propertyType: 'all',
      tenure: 'any',
      age: 'all',
    }));
  if (compact(comps.subject.postcode) !== compact(input.postcode)) {
    throw new ComparablesError(
      'BadInput',
      `The supplied comparables are for ${comps.subject.postcode}, not ${input.postcode} — run them for the same property`,
    );
  }
  const country: CountryCode = comps.subject.country;
  // Correct-by-construction: recompute from the comps array rather than
  // trusting stats a caller may not have refreshed after toggling includes.
  const stats = computeStats(comps.comps);

  const lines: EvidenceLine[] = [];
  let indexedAsOf: string | null = null;

  if (hasA) {
    const ukhpi = await getUkhpi();
    const manifest = await getManifest();
    const asOfMonth = manifest.ukhpiMonth || ukhpi.ukhpiMonth;
    const table = ukhpi.index[country];
    const saleIdx = table[saleMonth as string];
    const nowIdx = table[asOfMonth];
    if (nowIdx === undefined) {
      throw new ComparablesError('DataUnavailable', `HPI data missing for ${asOfMonth} — try again after the next data refresh`);
    }
    if (saleIdx === undefined) {
      const months = Object.keys(table).sort();
      if ((saleMonth as string) > asOfMonth) {
        throw new ComparablesError(
          'BadInput',
          `The house price index currently ends at ${asOfMonth} (it lags a couple of months) — for a very recent purchase, just use the price you paid as the value`,
        );
      }
      throw new ComparablesError('BadInput', `No HPI data for ${saleMonth} — the index covers ${months[0]} onwards`);
    }
    const estimate = (salePrice as number) * (nowIdx / saleIdx);
    indexedAsOf = asOfMonth;
    lines.push({
      label: 'Indexed last sale',
      estimate,
      breakdown: {
        label: 'Indexed last sale',
        formula: 'last sale price × (house price index now ÷ index at the sale date)',
        substituted: `${fmtMoney(salePrice as number)} × (${nowIdx} ÷ ${saleIdx})`,
        result: fmtMoney(estimate),
        note: `${country === 'W92000004' ? 'Wales' : 'England'} house price index, ${saleMonth} → ${asOfMonth}${lastSaleSource === 'landregistry' ? ' — sale found automatically at Land Registry (you can override it)' : ''}`,
      },
    });
  }

  let droppedAreaLine = false;
  if (input.floorAreaSqm !== undefined) {
    if (stats.typicalPpsqm !== null) {
      const estimate = stats.typicalPpsqm * input.floorAreaSqm;
      lines.push({
        label: 'Area £/sqm × floor area',
        estimate,
        breakdown: {
          label: 'Area £/sqm × floor area',
          formula: 'typical £/sqm nearby × the property’s floor area',
          substituted: `${fmtMoney(stats.typicalPpsqm)}/sqm × ${input.floorAreaSqm} sqm`,
          result: fmtMoney(estimate),
          note: `typical £/sqm from the ${stats.ppsqmCount} of ${stats.count} sales within ${comps.radiusMiles} mile${comps.radiusMiles === 1 ? '' : 's'} that have a known floor area`,
        },
      });
    } else {
      droppedAreaLine = true;
    }
  }

  if (lines.length === 0) {
    throw new ComparablesError(
      'DataUnavailable',
      'Not enough evidence to value this property — too few nearby sales have a known floor area. Add the last sale price and date instead.',
    );
  }

  const estimate = lines.reduce((a, l) => a + l.estimate, 0) / lines.length;

  // Confidence ladder (logged in DECISIONS_LOG). "Behind the £/sqm" means the
  // comps that actually CARRY a £/sqm (ppsqmCount), not the whole comp list.
  let confidence: Confidence;
  let confidenceReason: string;
  if (lines.length === 2) {
    const gapPct = (Math.abs(lines[0].estimate - lines[1].estimate) / estimate) * 100;
    const strongB = stats.ppsqmCount >= 5;
    if (gapPct <= 10 && strongB) {
      confidence = 'high';
      confidenceReason = 'two independent estimates agree closely, with plenty of nearby evidence';
    } else if (gapPct <= 25) {
      confidence = 'medium';
      confidenceReason = 'two estimates broadly agree, but not tightly';
    } else {
      confidence = 'low';
      confidenceReason = 'the two estimates disagree — treat this as a starting point only';
    }
  } else if (lines[0].label === 'Indexed last sale') {
    confidence = 'medium';
    confidenceReason = droppedAreaLine
      ? 'your floor area could not be used — too few nearby sales have a known floor area — so this rests only on the indexed last sale'
      : 'based only on the last sale indexed to today — no floor-area evidence to cross-check';
  } else {
    if (stats.ppsqmCount < 5) {
      confidence = 'low';
      confidenceReason = 'based on nearby £/sqm from only a handful of sales';
    } else {
      confidence = 'medium';
      confidenceReason = 'based only on nearby £/sqm — no last sale to cross-check';
    }
  }

  const range = valuationRange(estimate, confidence);
  return {
    estimate,
    range: range.value,
    confidence,
    confidenceReason,
    lines,
    breakdown: {
      label: 'Estimated value',
      formula: lines.length === 2 ? 'the average of the two evidence lines' : 'the single available evidence line',
      substituted: lines.map((l) => fmtMoney(l.estimate)).join(' and '),
      result: `${fmtMoney(estimate)} — likely between ${fmtMoney(range.value.low)} and ${fmtMoney(range.value.high)} (${range.value.label})`,
      note: 'no adjustments for beds, baths, garden or parking — those are context, never multipliers',
    },
    asOf: indexedAsOf ?? comps.asOf,
    lastSaleSource: hasA ? lastSaleSource : 'none',
  };
}
