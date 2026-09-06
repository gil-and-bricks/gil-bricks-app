/**
 * IS THIS SECTOR'S EVIDENCE ABOUT THIS KIND OF PROPERTY? (D4)
 *
 * The valuation blends a last sale with area £/sqm × floor area, and applies no
 * per-attribute adjustment — that is deliberate and locked. It means that in a
 * sector of large houses, a flat with a big floor area can be valued far above
 * anything a flat there has ever sold for. The number is not wrong by its own
 * method; it is answering a question about the wrong kind of home, and it is
 * wrong in the direction that costs somebody money.
 *
 * The sector data already carries the typical sold price PER TYPE, so this
 * compares the estimate with what the subject's own type actually sells for and
 * reports the mismatch. It decides nothing about wording and never alters, or
 * substitutes for, the estimate.
 */

export type PropertyTypeCode = 'D' | 'S' | 'T' | 'F';
/**
 * What a sector's sales are mostly made of. A BUCKET, never a single code: in a
 * sector of 30% terraces, 25% semis and 25% detached, no one type dominates but
 * "mostly houses" is plainly true — and naming the largest of them would print
 * "mostly terraced houses" about a minority (D4 review).
 */
export type DominantKind = 'houses' | 'flats';

export interface TypeMismatchOptions {
  /** Estimate ÷ typical-for-type at or above this = say so beside the number. */
  cautionRatio: number;
  /** …and at or above this, the caveat leads and the estimate is demoted. */
  demoteRatio: number;
  /** Share of a sector's sales one kind must hold before we call it "mostly". */
  dominantShare: number;
}

export interface TypeMismatchInput {
  /** The subject's property type, when it is known. */
  subjectType: PropertyTypeCode | null | undefined;
  /** The sector's IQM sold price per type; a null entry = too few sales to say. */
  byType: Partial<Record<PropertyTypeCode, number | null>> | null | undefined;
  /** The valuation estimate being shown. */
  estimate: number | null | undefined;
  /** What the sector's sales are mostly made of — see `dominantTypeOf`. */
  dominantType?: DominantKind | null;
}

export interface TypeMismatch {
  /** 'none' = nothing to say. */
  level: 'none' | 'caution' | 'demote';
  /** What this TYPE typically sells for in this sector. */
  typicalForType: number;
  /** How many times that the estimate is. */
  ratio: number;
  /** What the sector's sales are mostly made of, when one kind dominates. */
  dominantType: DominantKind | null;
  /** True when the sector's evidence is mostly about a different kind of home. */
  differentType: boolean;
}

/**
 * What this sector's sales are mostly MADE OF, by count — not by which types
 * happen to have a price. "Mostly houses" is a claim about the evidence, so it
 * is counted from the evidence.
 *
 * Houses are counted together (a sector of terraces and semis is a sector of
 * houses), and the winner is returned only when it clears `minShare`.
 */
export function dominantTypeOf(
  sales: readonly { type: string }[] | null | undefined,
  minShare: number,
): DominantKind | null {
  if (!sales || sales.length === 0) return null;
  let houses = 0;
  let flats = 0;
  for (const s of sales) {
    if (s.type === 'D' || s.type === 'S' || s.type === 'T') houses += 1;
    else if (s.type === 'F') flats += 1;
  }
  const total = houses + flats;
  if (total === 0) return null;
  if (houses / total >= minShare) return 'houses';
  if (flats / total >= minShare) return 'flats';
  return null;
}

/** Which bucket a property type belongs to. */
export const kindOf = (t: PropertyTypeCode): DominantKind => (t === 'F' ? 'flats' : 'houses');

export function typeMismatch(i: TypeMismatchInput, opts: TypeMismatchOptions): TypeMismatch | null {
  const none = null;
  if (!i.subjectType || !i.byType || typeof i.estimate !== 'number' || !(i.estimate > 0)) return none;
  const typical = i.byType[i.subjectType];
  const dominantType = i.dominantType ?? null;
  // No priced evidence for this TYPE at all: the sector cannot say what one goes
  // for, which is itself worth saying when other types ARE priced.
  const differentType = dominantType !== null && dominantType !== kindOf(i.subjectType);
  // Too few sales of THIS type to price one. Worth saying only when the sector's
  // evidence really is about something else — otherwise the sector is simply
  // thin, which the valuation's own confidence line already covers (D4 review).
  if (typeof typical !== 'number' || !(typical > 0)) {
    return differentType ? { level: 'caution', typicalForType: 0, ratio: 0, dominantType, differentType } : none;
  }
  const ratio = i.estimate / typical;
  if (ratio < opts.cautionRatio) return none;
  return {
    level: ratio >= opts.demoteRatio ? 'demote' : 'caution',
    typicalForType: typical,
    ratio,
    dominantType,
    differentType,
  };
}
