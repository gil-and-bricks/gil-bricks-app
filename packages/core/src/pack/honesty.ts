/**
 * DP1 — THE RULE THAT GOVERNS THE DEAL PACK.
 *
 * The pack is the first thing this product makes that ONE PERSON SHOWS ANOTHER
 * to influence a financial decision. Everything else the app produces is for
 * the user's own eyes; this leaves the building with their name on it and lands
 * in front of somebody deciding where to put money.
 *
 * So the honesty is STRUCTURAL, not optional. Not a checklist, not a review
 * step, not a warning the user can dismiss — code that refuses. This module is
 * that code, and the pack cannot render a page without going through it.
 *
 * FOUR RULES, each of which can refuse:
 *
 *  1. WORDS THAT CANNOT APPEAR. Guaranteed, guarantee, risk-free, no risk,
 *     assured return. Refused in any free text the user writes, WITH AN
 *     EXPLANATION — a silent strip would teach nothing and would leave them
 *     believing they had said it.
 *  2. NO PROJECTED FIGURE STATED AS FACT. Every forward-looking number carries
 *     the word estimate and its basis, or it does not render.
 *  3. NO MODELLED FIGURE CALLED A VALUATION. Ours are data-derived estimates.
 *     A valuation is a regulated act performed by a qualified valuer, and
 *     calling ours one would be claiming a status we do not have.
 *  4. NO COMPARABLE WITHOUT ITS SOURCE AND ITS DATE. A sold price with neither
 *     is an assertion, not evidence.
 *
 * The phrases live in config so the operator can add to them without a code
 * change; the matching lives here, and it is the SAME whole-word matcher the
 * listing extractors use — one matcher, so "guaranteed" can never mean one
 * thing on a listing and another in a pack.
 */
import { firstMatch, plainText } from '../listing/wording';
import type { SignalPattern } from '../listing/config';

/** A phrase the pack refuses, and the reason the user is given. */
export interface BannedPhrase {
  /** Matched whole-word, case-insensitively. A trailing '*' marks a stem. */
  phrase: string;
  /** Said to the user. Plain, specific, and never a bare "not allowed". */
  why: string;
}

export interface BannedHit {
  phrase: string;
  why: string;
  /** The words around it, so they can see exactly what to change. */
  context: string;
}

/**
 * Check a piece of the user's own free text.
 *
 * Returns EVERY hit rather than the first, because a person fixing one phrase
 * and being refused again for the next learns nothing except that the software
 * is hostile.
 */
export function checkFreeText(text: string, banned: readonly BannedPhrase[]): {
  ok: boolean;
  hits: BannedHit[];
} {
  const clean = plainText(String(text ?? ''));
  const lower = clean.toLowerCase();
  const hits: BannedHit[] = [];
  for (const b of banned) {
    const group: SignalPattern = { key: b.phrase, label: b.phrase, patterns: [b.phrase] };
    const hit = firstMatch(clean, lower, group);
    if (hit !== null) hits.push({ phrase: b.phrase, why: b.why, context: hit.phrase });
  }
  return { ok: hits.length === 0, hits };
}

/**
 * A number the pack is allowed to print.
 *
 * There is deliberately no way to construct one of these without a basis: the
 * type is the enforcement, so a page cannot render a figure and forget the
 * line underneath it.
 */
export interface EvidencedFigure {
  /** What it is, e.g. "Return on cash". */
  label: string;
  /** Already formatted — presentation formats, this module carries. */
  value: string;
  /**
   * Where it came from, in the user's own reading age. Never empty: a figure
   * with an empty basis is refused by `figure()`.
   */
  basis: string;
  /** True for anything forward-looking. Forces the word "estimate" on screen. */
  projected: boolean;
  /**
   * DP2 — THE RAW FIGURE, for GEOMETRY ONLY.
   *
   * A chart has to know how long to draw a bar, and it must not re-derive that
   * from the formatted string — parsing "£120,000" back into a number is how a
   * chart and its own label start disagreeing. So the engine hands over both:
   * `value` is what gets printed, this is what gets measured. Optional, because
   * a percentage or a duration has nothing a bar could usefully be drawn from.
   */
  amount?: number;
}

/** Thrown rather than returned: a pack that cannot evidence a figure must stop. */
export class PackHonestyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackHonestyError';
  }
}

const VALUATION_WORDS = /\bvaluations?\b|\bvalued at\b|\bvaluer\b/i;

/**
 * Build a figure the pack may print. Refuses, loudly, if it cannot be evidenced.
 *
 * This is the choke point: every number on every page goes through here, so
 * "every projected number carries its basis" is a property of the type system
 * and this function rather than of anybody's diligence.
 */
export function figure(label: string, value: string, basis: string, projected = false): EvidencedFigure {
  if (basis.trim() === '') {
    throw new PackHonestyError(`"${label}" has no basis. Every figure in a pack says where it came from.`);
  }
  // Rule 3: ours are data-derived estimates, and a valuation is a regulated act.
  if (VALUATION_WORDS.test(basis) || VALUATION_WORDS.test(label)) {
    throw new PackHonestyError(
      `"${label}" calls a modelled figure a valuation. Ours are estimates from data; `
      + 'a valuation is a regulated act by a qualified valuer.',
    );
  }
  return { label, value, basis, projected };
}

/** A sold comparable the pack may cite. */
export interface CitedComparable {
  address: string;
  price: string;
  /** e.g. "HM Land Registry Price Paid Data". */
  source: string;
  /** The date of the SALE, not of the export. */
  soldOn: string;
}

/**
 * Rule 4. A comparable with no source or no date is an assertion; the pack
 * drops it rather than printing it bare.
 */
export function citable(c: Partial<CitedComparable>): c is CitedComparable {
  return typeof c.address === 'string' && c.address.trim() !== ''
    && typeof c.price === 'string' && c.price.trim() !== ''
    && typeof c.source === 'string' && c.source.trim() !== ''
    && typeof c.soldOn === 'string' && c.soldOn.trim() !== '';
}

/** Keep only the comparables that can be cited properly. */
export function citableOnly(list: readonly Partial<CitedComparable>[]): CitedComparable[] {
  return list.filter(citable);
}

/**
 * THE THINGS A PACK MAY NEVER SHOW, whatever anybody ticks.
 *
 * The Deal Score and the verdict are for the user's own judgement. Putting
 * either in front of an investor would turn our internal read on a deal into
 * the sourcer's sales pitch, and it is not ours to lend for that.
 */
export const NEVER_IN_A_PACK = ['dealScore', 'verdict', 'bindingConstraint', 'lever'] as const;

/**
 * The sections the user cannot untick. The pack refuses to render without them.
 *
 * Returned as data rather than enforced by each page, so one test can assert
 * the whole set and a page cannot quietly drop one.
 */
export const LOCKED_SECTIONS = ['disclaimer', 'basis', 'compliance'] as const;
export type LockedSection = (typeof LOCKED_SECTIONS)[number];

/**
 * Refuse a selection that has dropped a locked section. The UI also disables
 * those tick boxes, but a disabled box is a suggestion — this is the rule.
 */
export function assertLocked(selected: readonly string[]): void {
  const missing = LOCKED_SECTIONS.filter((s) => !selected.includes(s));
  if (missing.length > 0) {
    throw new PackHonestyError(
      `A pack cannot be made without ${missing.join(', ')}. These keep the sender inside the rules.`,
    );
  }
}

/** Every locked section, always on, whatever the user ticked. */
export function withLocked(selected: readonly string[]): string[] {
  return [...new Set([...selected, ...LOCKED_SECTIONS])];
}
