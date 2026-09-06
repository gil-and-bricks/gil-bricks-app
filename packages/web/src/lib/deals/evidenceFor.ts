/**
 * What the BOARD knows about a deal's evidence (P7).
 *
 * Turns a saved deal — its params, its facts and what its score was judged
 * against — into the small, surface-agnostic shape @gil-bricks/core reads. It
 * decides nothing itself: presence and provenance in, evidence state out.
 */
import type { EvidenceInputs } from '@gil-bricks/core';
import type { DealFact } from './facts';
import { parseStoredEvidence } from './scoreFromParams';

export interface EvidenceSource {
  url_params: string;
  sold_evidence?: string | null;
  room_size_failures?: number | null;
}

/** Every param that actually carries a value — presence, never size. */
export function presentKeys(urlParams: string): string[] {
  const out: string[] = [];
  for (const [k, v] of new URLSearchParams(urlParams)) {
    if (v.trim() !== '') out.push(k);
  }
  return out;
}

export function evidenceInputsFor(deal: EvidenceSource, facts: readonly DealFact[]): EvidenceInputs {
  return {
    // A FOLDED fact still evidences its input: the quote is in these numbers.
    facts: facts.map((f) => f.fact_type),
    present: presentKeys(deal.url_params),
    comps: parseStoredEvidence(deal.sold_evidence) !== null,
    roomsMeasured: deal.room_size_failures !== null && deal.room_size_failures !== undefined,
  };
}
