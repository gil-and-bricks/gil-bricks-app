/**
 * What the ANALYSER knows about a deal's evidence (P7).
 *
 * The page has more than the board does about provenance (it knows whether the
 * floor area came off a listing or an EPC) and less about facts — so a deal
 * opened from its own card carries its fact keys in the link, and a page opened
 * cold simply reports what it has. Nothing is guessed.
 */
import type { EvidenceInputs } from '@gil-bricks/core';
import { strategies } from '@gil-bricks/core';
import { arrivedFactKeys } from './arrival';
import { editedKeys } from './provenance';
import { state, strategyParams } from './state';

/**
 * Which analyser inputs each fact type stands behind. Editing one of them by
 * hand takes that evidence away — the number in the box is no longer the fact's.
 * Keyed by FACT_TYPES key; anything not listed evidences no input.
 */
const EVIDENCED_INPUTS: Record<string, readonly string[]> = {
  'builder-quote': ['refurbCost'],
  'down-valuation': ['arv', 'gdv'],
  'rent-agreed': ['rent', 'roomRent'],
};

/**
 * Fact keys carried from the board. Captured at MODULE LOAD in arrival.ts, so
 * stripping them from the URL cannot race a component's mount. The setter stays
 * for tests, which drive several URLs in one process.
 */
let arrivedFacts: readonly string[] = arrivedFactKeys;
export function initArrivedFacts(search: string): void {
  const raw = new URLSearchParams(search).get('ev') ?? '';
  arrivedFacts = raw === '' ? [] : raw.split('.').filter((k) => /^[a-z-]{3,30}$/.test(k));
}
export const factsFromBoard = (): readonly string[] => arrivedFacts;

/**
 * @param comps  sold-price comparables loaded for this subject
 * @param roomSizeFailures  HMO only: null until the rooms are measured
 */
export function analyserEvidence(
  comps: boolean, roomSizeFailures?: number | null, strategy?: string,
): EvidenceInputs {
  /**
   * A field still holding its CONFIG DEFAULT is not somebody's assumption — the
   * engine simply used its own number, and the analyser's URL writer drops it
   * for exactly that reason. Counting it as present would make the same deal
   * read "assumed" here and "not known" on the board (P7 review).
   */
  const config = strategies.find((s) => s.id === strategy);
  const defaults = new Map<string, string>(
    [...(config?.strategyInputs ?? []), ...(config?.assumptions ?? [])].map((f) => [f.key, String(f.default ?? '')]),
  );
  const present: string[] = [];
  for (const [k, v] of Object.entries(state.value)) if (String(v ?? '').trim() !== '') present.push(k);
  for (const [k, v] of Object.entries(strategyParams.value)) {
    const val = String(v ?? '').trim();
    if (val !== '' && val !== (defaults.get(k) ?? '')) present.push(k);
  }
  /**
   * A number the person has TYPED OVER this session is theirs again, whatever
   * brought it here. An evidenced input must never keep saying evidenced after
   * the evidence has been edited out of the box (P7 review).
   */
  const overwritten = editedKeys.value;
  const facts = arrivedFacts.filter((key) => !EVIDENCED_INPUTS[key]?.some((k) => overwritten.has(k)));
  return {
    facts,
    present,
    comps,
    roomsMeasured: roomSizeFailures !== null && roomSizeFailures !== undefined,
  };
}
