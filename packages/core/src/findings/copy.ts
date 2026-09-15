/**
 * X2 — EVERY WORD A FINDING CAN SAY, keyed by its code.
 *
 * ── THE RULE THAT GOVERNS ALL OF IT ─────────────────────────────────────────
 * THIS IS AN IDENTIFIER, NOT A LESSON.
 *
 * A chip is TWO OR THREE WORDS. There are no sentences on the portal's page. Tap
 * one and it gives ONE SHORT LINE of why, and nothing more. This product has a
 * continual problem with too much text, and a page somebody else owns is the
 * worst possible place to repeat it.
 *
 * So `label` is capped at THREE words by a test, and `why` at one short line.
 * Three rather than two because the shortest honest name for several of these
 * genuinely needs three — "No floor plan", "Cash buyers only" — and padding a
 * rule to two would have produced worse English, not less of it. What the cap
 * really forbids is a sentence, and three words cannot be one.
 *
 * "No council tax band" was the one casualty: four words, shortened to "No tax
 * band", which is what anyone would say out loud anyway.
 *
 * If a thing cannot be said in that space it does not go on their page; it goes
 * on the deal's own page, where there is room to explain.
 *
 * ── AND NO JARGON, ANYWHERE ─────────────────────────────────────────────────
 * No "BMV", no "off-market", no "motivated seller", no "stacking". Somebody who
 * reads our wording and repeats it to an agent is marked out by it, and that
 * damages them. Plain English, always — tested.
 *
 * ── THE SAME LAW AS THE PANEL ───────────────────────────────────────────────
 * Warn and point out; never endorse. And never state an absence as a FACT: "the
 * listing does not give this" is a fact about the listing. "There is no ground
 * rent" would be a claim about a lease nobody here has read.
 */
import type { FindingCode } from './findings';

export interface FindingWords {
  /** At most three words, and never a sentence. This is the chip. */
  label: string;
  /** One short line, shown only when the chip is tapped. */
  why: string;
}

export const FINDING_COPY: Record<FindingCode, FindingWords> = {
  // ── RISKS — always what the LISTING SAYS, never what is true ──────────────
  LEASE: {
    label: 'Leasehold',
    why: 'You own it for a fixed term. Ask the length, the ground rent and the service charge.',
  },
  AUCT: {
    label: 'Auction',
    why: 'Read the legal pack before you bid. Fees and deadlines are different.',
  },
  TENANT: {
    label: 'Tenant in situ',
    why: 'You inherit the tenancy and its terms. Ask to see them.',
  },
  CASH: {
    label: 'Cash buyers only',
    why: 'The listing says no mortgage. Ask why before you spend on a survey.',
  },
  CONSTR: {
    label: 'Non-standard construction',
    why: 'Some lenders decline these. Check with a broker before you offer.',
  },
  COMM: {
    label: 'Commercial nearby',
    why: 'Commercial neighbours can affect lending, noise and resale.',
  },

  // ── GAPS — the portal publishes it and this listing did not fill it in ────
  NOPLAN: {
    label: 'No floor plan',
    why: 'Nothing on the listing shows the layout. Ask the agent for one.',
  },
  NOEPC: {
    label: 'No EPC',
    why: 'Sellers must provide one. Ask for the certificate.',
  },
  NOAREA: {
    label: 'No floor area',
    why: 'Without a size you cannot compare the price with anything.',
  },
  NOTEN: {
    label: 'No tenure',
    why: 'The listing does not say freehold or leasehold. Ask.',
  },
  NOCT: {
    label: 'No tax band',
    why: 'The listing gives no council tax band. Ask the agent.',
  },
  NOLEASE: {
    label: 'No lease length',
    why: 'A short lease costs a lot to extend. Ask how many years are left.',
  },
  NOGR: {
    label: 'No ground rent',
    why: 'The listing does not give the ground rent. Ask what it is and how it rises.',
  },
  NOSC: {
    label: 'No service charge',
    why: 'The listing does not give the service charge. Ask for the last three years.',
  },
};

/**
 * The headings on the deal's own page. Two groups, plainly named — one for
 * things that might end the purchase, one for things to ask about.
 */
export const FINDINGS_COPY = {
  riskHeading: 'What might kill it',
  gapHeading: 'What to ask the agent',
  /** Said where a listing produced neither. Never "all clear". */
  none: 'Nothing flagged from this listing.',
  noneWhy: 'Not an all clear: condition, lease and the exact street need a viewing, a survey or a solicitor.',
  /** On the portal's page, above the chips in the box. */
  boxTitle: 'From this listing',
  dismiss: 'Hide',
  dismissLabel: 'Hide these for this property',
} as const;

/** Colour by kind. Two, and never more — and never used on its own. */
export const FINDING_TONE: Record<'risk' | 'gap', 'pink' | 'yellow'> = {
  risk: 'pink',
  gap: 'yellow',
};

/**
 * THE ICON, BECAUSE COLOUR ALONE EXCLUDES ABOUT ONE MAN IN TWELVE.
 *
 * Every chip carries its label AND one of these AND its colour, so the two
 * kinds are told apart three ways over. These are drawn as SVG paths by the
 * caller; the names are here so both surfaces use the same two.
 */
export const FINDING_ICON: Record<'risk' | 'gap', 'warning' | 'question'> = {
  risk: 'warning',
  gap: 'question',
};
