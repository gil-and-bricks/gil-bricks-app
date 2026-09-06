/**
 * The analyser's sold evidence — the SAME rule and the SAME numbers the
 * extension panel uses (D4).
 *
 * This file wires; it decides nothing. `soldEvidenceFor` in @gil-bricks/core is
 * the rule, and the two thresholds come from the shared extractor config that
 * the panel reads, so neither surface can be tuned without the other.
 *
 * Note what this deliberately does NOT read: the ValuationEngine. A valuation
 * needs a floor area, the panel can never have one, and a Deal Score that moves
 * with it would put the two surfaces permanently out of step. The valuation is
 * still what the "What it's worth" card shows — it is just not what the score
 * rests on.
 */
import { FALLBACK_CONFIG, soldEvidenceFor, type ComparablesResult, type DealEvidence } from '@gil-bricks/core';

export const SOLD_EVIDENCE_OPTS = {
  minSales: FALLBACK_CONFIG.thresholds.minSectorSales,
  outsideFactor: FALLBACK_CONFIG.thresholds.evidenceOutsideFactor,
} as const;

/**
 * @param value the number the sold-evidence component judges — the end value on
 *   a flip or BRRRR, the purchase price otherwise.
 */
export function evidenceFromComps(
  value: number | null | undefined,
  comps: ComparablesResult | null,
): DealEvidence | undefined {
  return soldEvidenceFor(value, comps?.subjectSector ?? null, SOLD_EVIDENCE_OPTS).evidence;
}
