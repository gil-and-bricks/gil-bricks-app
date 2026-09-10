/**
 * EVIDENCE CHIPS (P7) — what a Deal Score rests on.
 *
 * A 7.4 built on a guessed refurb and a suggested end value is a very different
 * thing from a 7.4 built on a builder's quote and a survey, and until now they
 * looked identical. This says which inputs are evidenced, which are assumed and
 * which are simply unknown.
 *
 * IT IS NOT A SECOND SCORE. Nothing here is weighted, added up or compared with
 * the Deal Score: each chip reports the provenance of ONE input, and the states
 * are the three honest answers — we were told, you assumed, nobody knows.
 *
 * It lives in the shared library because three surfaces show it — the deal card,
 * the analyser's verdict and the extension panel — and they must never disagree.
 * Each surface passes what it genuinely knows; anything it cannot know is
 * `unknown`, never a guess.
 */
import type { StrategyId } from '../score/scoreDeal';

export type ChipState = 'evidenced' | 'assumed' | 'unknown';
export type ChipKey = 'refurb' | 'endValue' | 'rent' | 'comps' | 'roomSizes';

export interface ChipSpec {
  key: ChipKey;
  /** The chip's own word. A label, never a judgement. */
  label: string;
  /** How to name it when it is only assumed, inside "This 7.4 rests on …". */
  assumedPhrase: string;
  /** The same when nobody knows it at all. */
  unknownPhrase: string;
  /** The one thing that would fill it: "Get a builder's number". */
  action: string;
  /** Fact types (P5 FACT_TYPES keys) that evidence this input. */
  evidencedBy: readonly string[];
  /** Analyser input keys whose presence makes it an assumption rather than a blank. */
  inputs: readonly string[];
  /** True where the input can only be evidenced or unknown — never assumed. */
  neverAssumed?: boolean;
}

/**
 * The chips themselves. Wording lives here so all three surfaces say the same
 * words about the same deal; each surface owns only the sentence around them.
 */
export const CHIP_SPECS: Record<ChipKey, ChipSpec> = {
  refurb: {
    key: 'refurb',
    label: 'Refurb',
    assumedPhrase: 'a guessed refurb',
    unknownPhrase: 'no refurb figure',
    action: 'Get a builder’s number',
    // A quote REPLACES the guess, so it evidences it. A survey finding ADDS to
    // whatever is there: the base is still a guess, so it does not (P7 review).
    evidencedBy: ['builder-quote'],
    inputs: ['refurbCost'],
  },
  endValue: {
    key: 'endValue',
    label: 'End value',
    assumedPhrase: 'a suggested end value',
    unknownPhrase: 'no end value',
    action: 'Get it valued',
    evidencedBy: ['down-valuation'],
    inputs: ['arv', 'gdv'],
  },
  rent: {
    key: 'rent',
    label: 'Rent',
    assumedPhrase: 'a rent you estimated',
    unknownPhrase: 'no rent',
    action: 'Get a letting agent’s figure',
    evidencedBy: ['rent-agreed'],
    inputs: ['rent', 'roomRent'],
  },
  comps: {
    key: 'comps',
    label: 'Comps',
    // Said about the SCORE, never about the page: sold prices can be on screen
    // while the score had no valuation to check against (P7 review).
    assumedPhrase: 'no sold-price check',
    unknownPhrase: 'no sold-price check',
    action: 'Check it against the sold prices',
    evidencedBy: [],
    inputs: [],
    neverAssumed: true,
  },
  roomSizes: {
    key: 'roomSizes',
    label: 'Room sizes',
    assumedPhrase: 'unmeasured rooms',
    unknownPhrase: 'unmeasured rooms',
    action: 'Measure the rooms',
    evidencedBy: [],
    inputs: [],
    neverAssumed: true,
  },
};

/**
 * Which chips each strategy shows, in the order they matter.
 *
 * A chip that can NEVER be filled is never shown: an HMO's Deal Score has no
 * sold-evidence component (its four are ICR, cashflow, ROI and room sizes), so
 * it gets no Comps chip rather than one that is dashed for ever.
 *
 * There is no FLOOR AREA chip on any strategy: no Deal Score reads the floor
 * area. It feeds the valuation, and whether that landed is exactly what the
 * Comps chip already reports — a second chip for it would either duplicate Comps
 * or, worse, disagree with it between surfaces (P7).
 */
export const CHIPS_BY_STRATEGY: Record<StrategyId, readonly ChipKey[]> = {
  btl: ['refurb', 'rent', 'comps'],
  brrrr: ['refurb', 'endValue', 'rent', 'comps'],
  flip: ['refurb', 'endValue', 'comps'],
  hmo: ['refurb', 'rent', 'roomSizes'],
};

/** What a surface knows. Anything it cannot know is left out, and reads unknown. */
export interface EvidenceInputs {
  /** Fact-type keys on the deal (P5). A fact is the strongest evidence there is. */
  facts?: readonly string[];
  /**
   * The analyser inputs that HAVE a value — presence, not size. A refurb typed
   * as 0 is an assumption ("no work needed"); a refurb never entered is unknown.
   */
  present?: readonly string[];
  /** Sold-price comparables were loaded and scored against. */
  comps?: boolean;
  /** HMO room sizes were actually measured. */
  roomsMeasured?: boolean;
}

export interface EvidenceChip {
  key: ChipKey;
  label: string;
  state: ChipState;
}

const stateOf = (spec: ChipSpec, i: EvidenceInputs): ChipState => {
  if (spec.key === 'comps') return i.comps === true ? 'evidenced' : 'unknown';
  if (spec.key === 'roomSizes') return i.roomsMeasured === true ? 'evidenced' : 'unknown';
  if (spec.evidencedBy.some((f) => (i.facts ?? []).includes(f))) return 'evidenced';
  if (spec.inputs.some((k) => (i.present ?? []).includes(k))) return 'assumed';
  return 'unknown';
};

/** The chips for one deal, in the strategy's own order. */
export function evidenceChips(strategy: StrategyId, inputs: EvidenceInputs): EvidenceChip[] {
  return (CHIPS_BY_STRATEGY[strategy] ?? []).map((key) => {
    const spec = CHIP_SPECS[key];
    return { key, label: spec.label, state: stateOf(spec, inputs) };
  });
}

/**
 * THE FACT THAT WOULD FILL THIS CHIP (P12), or null when nothing can.
 *
 * A chip names something the score rests on, so the obvious move is to press it
 * and record the real number. Two chips cannot work that way and must never look
 * pressable: `comps` is a sold-price check the analyser performs, not a fact
 * anybody types, and `roomSizes` comes from measuring in the extension. Both
 * declare no `evidencedBy`, so this returns null and the surface leaves them
 * inert — the rule is the data, not a list repeated in a component.
 */
export function factForChip(key: ChipKey): string | null {
  return CHIP_SPECS[key].evidencedBy[0] ?? null;
}

/**
 * Can pressing this chip actually change anything? Only when a fact could fill
 * it AND it is not already evidenced — an evidenced chip has nothing left to fix.
 */
export function chipIsFixable(chip: EvidenceChip): boolean {
  return chip.state !== 'evidenced' && factForChip(chip.key) !== null;
}

/**
 * What the score is weakest on, worst first: nobody knows it, then you assumed
 * it. Ties keep the strategy's own order, so the answer is the same every time.
 */
export function weakestEvidence(chips: readonly EvidenceChip[]): EvidenceChip[] {
  return [...chips.filter((c) => c.state === 'unknown'), ...chips.filter((c) => c.state === 'assumed')];
}

/**
 * The parts of the plain line beneath the chips. The surface owns the sentence;
 * this owns WHICH inputs it names and WHAT would fix the weakest of them, so
 * every surface names the same thing.
 */
export interface EvidenceLineParts {
  /** Up to `limit` weak inputs, phrased ("a guessed refurb"). Empty = nothing weak. */
  weak: string[];
  /** The single action that would fix the weakest one, or null when none is weak. */
  action: string | null;
  /** The chip that action belongs to. */
  weakest: ChipKey | null;
}

export function evidenceLine(chips: readonly EvidenceChip[], limit = 2): EvidenceLineParts {
  const weak = weakestEvidence(chips);
  if (weak.length === 0) return { weak: [], action: null, weakest: null };
  const named = weak.slice(0, limit).map((c) => {
    const spec = CHIP_SPECS[c.key];
    return c.state === 'unknown' ? spec.unknownPhrase : spec.assumedPhrase;
  });
  return { weak: named, action: CHIP_SPECS[weak[0].key].action, weakest: weak[0].key };
}

/**
 * The words around the chips. They live HERE, with the chips, because the deal
 * card, the analyser verdict and the extension panel all say them about the same
 * deal — one wording, edited in one place, so they cannot drift apart.
 *
 * The line is exempt from the two-sentence copy rule by rule 7: it is a Deal
 * Score line, and naming the binding input IS the plain-English win.
 */
export const CHIP_COPY = {
  /** Named for a screen reader; the chips are the visible label. */
  stripLabel: 'What this score rests on',
  /** Said after a chip's label, for anyone who cannot see filled from outline. */
  states: { evidenced: 'evidenced', assumed: 'assumed', unknown: 'not known' } as Record<ChipState, string>,
  chipLabel: (label: string, state: string): string => `${label}: ${state}`,
  /** "This 7.4 rests on a guessed refurb and a suggested end value. Get a builder’s number to trust it." */
  line: (score: string, weak: string, action: string): string => `This ${score} rests on ${weak}. ${action} to trust it.`,
  /** Nothing left to doubt. */
  allEvidenced: (score: string): string => `This ${score} rests on numbers you have checked.`,
  /** Joins the weak inputs: "a guessed refurb and a suggested end value". */
  join: ' and ',
  /** P12 — a chip you can press. Names what pressing it does, for anyone who
   *  cannot see that it is a button: "Refurb: assumed — Get a builder's number". */
  fixLabel: (label: string, state: string, action: string): string => `${label}: ${state} — ${action}`,
} as const;

/** The finished sentence for a set of chips — the same words on every surface. */
export function evidenceSentence(score: string, chips: readonly EvidenceChip[]): string {
  const line = evidenceLine(chips);
  if (line.action === null) return CHIP_COPY.allEvidenced(score);
  return CHIP_COPY.line(score, line.weak.join(CHIP_COPY.join), line.action);
}
