/**
 * X1 — THE FLAGS. Read from the listing's own words, and worded as DETECTED.
 *
 * THE RULE THAT SHAPES EVERY LINE HERE: the panel may warn, it may state facts,
 * and it may never bless. A flag says "the listing says X — verify it". It never
 * says X is true, and — the half that is easier to get wrong — it never says X is
 * ABSENT. The absence of the word "leasehold" in a description does not make a
 * property freehold; it makes the listing silent. A panel that said "freehold"
 * because it found no leasehold would be inventing a fact about a legal title
 * from a marketing document.
 *
 * So there is no negative flag in this file, and there cannot be one: every
 * detector returns a flag or nothing, and "nothing" is reported by the panel as
 * "not found in the listing", never as "not the case".
 *
 * WHY THESE SIX AND NOT MORE. Each is a thing that kills deals, is stated in
 * plain words by the people writing listings, and can be matched without
 * guessing. What is deliberately absent is as important:
 *
 *   ARTICLE 4 and COAL MINING — no clean free national dataset. A wrong flag is
 *   worse than no flag.
 *
 *   FLOOD RISK and LISTED BUILDING — asked for, and refused on evidence. The
 *   Environment Agency's flood-monitoring API serves live WARNINGS, not flood
 *   risk: a listing viewed on a dry day would show nothing, which reads as "no
 *   flood risk" and is precisely the false reassurance this product must not
 *   give. Its spatial endpoint timed out at 25 seconds when tested, which is
 *   unusable in a panel meant to answer in seconds. Historic England's feature
 *   service answered 200 with no layers. Neither could be stood behind, so
 *   neither ships. See docs/DECISIONS_LOG.md.
 */

export type FlagId =
  | 'leasehold' | 'auction' | 'tenantInSitu' | 'cashBuyers'
  | 'nonStandardConstruction' | 'commercialBelow';

export interface TriageFlag {
  id: FlagId;
  /** The exact words found, so the reader can judge the match themselves. */
  matched: string;
}

export interface FlagInput {
  /** The listing's free text: description, key features, anything prose. */
  text: string;
  /** The portal's own tenure field, where it has one. */
  tenure?: string | null;
  /** The portal's own auction flag, where it has one. */
  isAuction?: boolean | null;
}

/**
 * The phrases, in config-shaped data so they can be tuned without touching the
 * matching. Ordered most-specific first within each flag: the matched phrase is
 * shown to the user, so "modern method of auction" must win over "auction".
 */
const PATTERNS: { id: FlagId; phrases: readonly string[] }[] = [
  {
    id: 'auction',
    phrases: ['modern method of auction', 'traditional auction', 'auction reservation fee',
      'buyers premium', 'buyer’s premium', 'reservation fee', 'for sale by auction', 'auction'],
  },
  { id: 'leasehold', phrases: ['share of freehold', 'leasehold'] },
  {
    id: 'tenantInSitu',
    phrases: ['tenant in situ', 'tenants in situ', 'currently tenanted', 'sitting tenant',
      'subject to an existing tenancy', 'investment sale with tenant'],
  },
  { id: 'cashBuyers', phrases: ['cash buyers only', 'cash purchasers only', 'cash buyer only', 'no mortgage possible'] },
  {
    id: 'nonStandardConstruction',
    phrases: ['non-standard construction', 'non standard construction', 'concrete construction',
      'timber framed', 'timber frame', 'steel framed', 'prefabricated', 'system built',
      'airey', 'cornish unit', 'woolaway', 'spar finish'],
  },
  {
    id: 'commercialBelow',
    phrases: ['above a shop', 'above commercial premises', 'above a takeaway', 'above a restaurant',
      'above a pub', 'commercial premises below', 'adjacent to commercial', 'above retail'],
  },
];

/** Normalise once: lowercase, curly quotes flattened, whitespace collapsed. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
}

/**
 * What the listing SAYS. Never what is true, and never what is absent.
 *
 * `max` caps how many are returned, because a panel showing eight flags is a
 * panel nobody reads — and the point of triage is the two or three things that
 * would kill the deal, not a complete audit.
 */
export function detectFlags(input: FlagInput, max = 4): TriageFlag[] {
  const hay = norm(`${input.text ?? ''} ${input.tenure ?? ''}`);
  const out: TriageFlag[] = [];

  for (const { id, phrases } of PATTERNS) {
    // The portal's own structured field is stronger evidence than prose, and it
    // is still only evidence of what the LISTING says.
    if (id === 'auction' && input.isAuction === true) {
      const phrase = phrases.find((p) => hay.includes(norm(p)));
      out.push({ id, matched: phrase ?? 'auction' });
      continue;
    }
    if (id === 'leasehold' && typeof input.tenure === 'string' && /leasehold/i.test(input.tenure)) {
      out.push({ id, matched: input.tenure.trim() });
      continue;
    }
    const hit = phrases.find((p) => hay.includes(norm(p)));
    if (hit !== undefined) out.push({ id, matched: hit });
  }
  return out.slice(0, max);
}
