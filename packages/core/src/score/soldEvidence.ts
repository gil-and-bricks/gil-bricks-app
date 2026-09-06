/**
 * THE ONE PLACE SOLD EVIDENCE IS DECIDED (D4).
 *
 * The Deal Score's price/end-value component asks one question: how does the
 * number this deal turns on sit against what actually sold nearby? Two surfaces
 * used to answer it differently — the extension panel from the postcode
 * sector's own price distribution, the web analyser from the ValuationEngine —
 * so the same property scored 2.3 in the panel and 1.1 on the board with
 * nothing on either screen explaining why.
 *
 * It is now decided HERE, from the sector, for every surface. Three reasons:
 *
 *  1. The panel can never have a valuation (no floor-area lookup, no Land
 *     Registry history), so any rule that prefers one guarantees the surfaces
 *     can differ. Only a shared input makes them agree by construction.
 *  2. It restores the invariant the evidence chips are built on — "no Deal
 *     Score reads the floor area" (see evidence/chips.ts). The valuation is
 *     exactly the thing that needs a floor area.
 *  3. The valuation is a per-property estimate that can be confidently wrong
 *     (a flat in a house-dominated sector). It stays as the "what it's worth"
 *     card, where it carries its own caveats — it is not what a score rests on.
 */
import type { SectorFile } from '../data/types';
import type { DealEvidence } from './scoreDeal';

/**
 * WHICH number the sold-evidence component judges, per strategy. A flip or a
 * BRRRR is judged on what it will be WORTH, not what it cost. Exported so no
 * caller has to re-derive it — getting this wrong silently scores a deal
 * against the wrong figure.
 */
export const SOLD_JUDGED_PARAM: Record<string, string> = {
  btl: 'price', hmo: 'price', flip: 'gdv', brrrr: 'arv',
};

/** The judged value out of a params string, falling back to the price. */
export function judgedValueOf(strategy: string, params: URLSearchParams): number {
  const key = SOLD_JUDGED_PARAM[strategy] ?? 'price';
  const v = Number(params.get(key) ?? '');
  if (Number.isFinite(v) && v > 0) return v;
  const price = Number(params.get('price') ?? '');
  return Number.isFinite(price) && price > 0 ? price : 0;
}

export interface SoldEvidenceOptions {
  /** Below this many sector sales the distribution is not evidence. */
  minSales: number;
  /** A value above p90 × this sits outside the local evidence entirely. */
  outsideFactor: number;
}

export interface SoldEvidenceResult {
  /** What scoreDeal is given — `undefined` means "we could not check it". */
  evidence: DealEvidence | undefined;
  /** Why, so a surface can say it without re-deriving it. */
  reason: 'sector' | 'no-sector' | 'too-few-sales' | 'outside-evidence';
}

/**
 * @param value the number the component judges — the end value on a flip or
 *   BRRRR, the purchase price otherwise.
 */
export function soldEvidenceFor(
  value: number | null | undefined,
  sector: SectorFile | null | undefined,
  opts: SoldEvidenceOptions,
): SoldEvidenceResult {
  if (!sector) return { evidence: undefined, reason: 'no-sector' };
  if (sector.stats.count < opts.minSales) return { evidence: undefined, reason: 'too-few-sales' };
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  if (v > sector.stats.p90Price * opts.outsideFactor) {
    return { evidence: undefined, reason: 'outside-evidence' };
  }
  return {
    evidence: { estimate: sector.stats.typicalPrice, high: sector.stats.p90Price },
    reason: 'sector',
  };
}
