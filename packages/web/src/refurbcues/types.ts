/**
 * R3 — THE SHAPE OF A CUE. Types only, so the library is data and this is the
 * contract it must satisfy.
 */

/** Rooms a user can tag a photo as. Never detected — always tapped. */
export const CUE_ROOMS = ['kitchen', 'bathroom', 'bedroom', 'living', 'hall', 'loft', 'outside', 'garden'] as const;
export type CueRoom = (typeof CUE_ROOMS)[number];

/**
 * How much a visual cue can actually tell you.
 *
 *  conclusive — the thing itself is visible and unambiguous.
 *  indicative — it suggests something worth investigating, nothing more.
 *  weak       — it is barely evidence; shown last, and rarely.
 *
 * This is not decoration: the honesty test reads it and requires hedged wording
 * for anything that is not conclusive.
 */
export type CueConfidence = 'conclusive' | 'indicative' | 'weak';

export interface RegulationRef {
  /** e.g. "Building Regulations Part P". */
  name: string;
  /** One line: what it governs. */
  what: string;
  /** ISO date the operator last checked this is current. */
  lastChecked: string;
}

export interface RefurbCue {
  /** Stable key. Used as the seen-set identity, so it must never be re-used. */
  key: string;
  /** Which room this applies to, or 'any' when it is general. */
  room: CueRoom | 'any';
  confidence: CueConfidence;
  /** The key of a REFURB_ITEMS entry, so a tip can tick its own box. */
  costItem: string;
  /** The key of a REGULATIONS entry. */
  regulation: string;
  /** What to look for. Never what we have seen. */
  look: string;
  /** What it might mean. Hedged unless conclusive. */
  means: string;
  /** What would actually be needed to know. Never empty. */
  caveat: string;
}
