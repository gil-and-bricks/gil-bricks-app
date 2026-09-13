/**
 * R3 — THE SHAPE OF A CUE. Types only, so the library is data and this is the
 * contract it must satisfy.
 */

/** Rooms a user can tag a photo as. Never detected — always tapped. */
export const CUE_ROOMS = ['kitchen', 'bathroom', 'bedroom', 'living', 'hall', 'loft', 'outside', 'garden'] as const;
export type CueRoom = (typeof CUE_ROOMS)[number];

/**
 * How much a visual cue can actually tell you. FOUR levels, because the
 * research the library came from uses four and flattening them would have meant
 * moving a cue up or down a level to fit.
 *
 *  conclusive — the thing itself is visible and unambiguous.
 *  strong     — the OBSERVATION is reliable; what it implies may still not be.
 *  indicative — it suggests something worth investigating, nothing more.
 *  weak       — it is barely evidence; shown last, and rarely.
 *
 * This is not decoration: the honesty test reads it. Anything below conclusive
 * may not assert what a photo contains, and indicative and weak must be hedged.
 */
export type CueConfidence = 'conclusive' | 'strong' | 'indicative' | 'weak';

/**
 * What KIND of thing is behind the tip — the research's `reg_type`, kept
 * because "Part M" on screen with nothing beside it reads as though it binds
 * this house, and for an existing home it does not.
 *
 *  legal        — a legal requirement (often only for NEW or altered work).
 *  policy       — confirmed government policy, not yet fully in force.
 *  standard     — a standard or best practice; the lever is usually a report.
 *  practitioner — trade experience. No regulation at all, and it says so.
 */
export type CueBasis = 'legal' | 'policy' | 'standard' | 'practitioner';

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
  /**
   * The key of a REFURB_ITEMS entry, so a tip can tick its own box — or NULL
   * where the research says "cost: none direct". A cue about room size or a
   * missing photo has no price; offering a tick would put a nothing in a total.
   */
  costItem: string | null;
  /**
   * The key of a REGULATIONS entry, or NULL where the research says "none
   * direct". Fifteen of the forty are trade experience, not law, and a made-up
   * citation beside one would be worse than no citation at all.
   */
  regulation: string | null;
  /** What kind of thing the tip rests on. Said on screen beside the rule. */
  basis: CueBasis;
  /** What to look for. Never what we have seen. */
  look: string;
  /** What it might mean. Hedged unless conclusive or strong. */
  means: string;
  /** What would actually be needed to know. Never empty. */
  caveat: string;
}
