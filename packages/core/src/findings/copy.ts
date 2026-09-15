/**
 * X2 — EVERY WORD A FINDING CAN SAY, keyed by its code.
 *
 * ── THE RULE THAT GOVERNS ALL OF IT ─────────────────────────────────────────
 * THIS IS AN IDENTIFIER, NOT A LESSON — AND IT MUST NOT READ THE PAGE BACK.
 *
 * The first cut of these named the fact: "the listing mentions auction", "the
 * listing says leasehold". On a listing from an agent called Peter Alan Auctions
 * with a guide price on it, that is worth nothing — the reader can see it. The
 * finding is the thing they CANNOT see.
 *
 * So the LABEL names the thing, in two or three words, and the line names the
 * CONSEQUENCE or the QUESTION: not "this is an auction" but that the buyer's fee
 * is often around 5% on top and is often not on the listing. That is the number
 * that kills the deal and nobody tells you.
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
  // ── RISKS ────────────────────────────────────────────────────────────────
  // The LABEL names the thing. The line names the CONSEQUENCE, because the
  // thing itself is already on the page and repeating it is worth nothing.
  LEASE: {
    label: 'Leasehold',
    why: 'Under about 80 years left costs tens of thousands to extend. Ask the years and the charges.',
  },
  AUCT: {
    label: 'Auction',
    why: 'The buyer’s fee is often around 5% on top, and is often not on the listing. Ask what it is.',
  },
  TENANT: {
    label: 'Tenant in situ',
    why: 'You cannot view it freely, you inherit their rent and their arrears, and vacant possession can take months.',
  },
  CASH: {
    label: 'Cash buyers only',
    why: 'Usually means no lender will touch it. A problem if you need a mortgage; the point if you are refinancing.',
  },
  CONSTR: {
    label: 'Non-standard construction',
    why: 'Many lenders decline outright, which cuts your buyers when you sell as well as your options now.',
  },
  COMM: {
    label: 'Commercial nearby',
    why: 'Some lenders decline flats over food or licensed premises, and it narrows who can buy it from you later.',
  },

  // ── GAPS ─────────────────────────────────────────────────────────────────
  // Not "the listing does not say X" — what the missing X would have told you.
  NOPLAN: {
    label: 'No floor plan',
    why: 'You cannot judge the layout or whether a room splits. Ask for one before you travel.',
  },
  NOEPC: {
    label: 'No EPC',
    why: 'It is the only free read on the size and the running costs. Ask for the certificate.',
  },
  NOAREA: {
    label: 'No floor area',
    why: 'Without a size the price cannot be compared with anything.',
  },
  NOTEN: {
    label: 'No tenure',
    why: 'Freehold and leasehold are different purchases. Ask which before anything else.',
  },
  NOCT: {
    label: 'No tax band',
    why: 'A band or two out is a few hundred a year on a rental you may be paying between tenants.',
  },
  NOLEASE: {
    label: 'No lease length',
    why: 'A short lease is the single most expensive thing to find out late. Ask the years left.',
  },
  NOGR: {
    label: 'No ground rent',
    why: 'A doubling ground rent can make a flat unmortgageable. Ask the figure and how it rises.',
  },
  NOSC: {
    label: 'No service charge',
    why: 'It comes straight off the rent every month. Ask for the last three years, not the quoted figure.',
  },
};

/**
 * X4 — THE ONE THING ON THEIR PAGE THAT IS NOT A WORRY.
 *
 * Everything else we put on a portal's page is a risk or a gap: things to check,
 * things to ask about. Useful, and relentlessly negative — and none of it
 * answers the question somebody actually opened the listing with.
 *
 * This does. It is the asking price set against what similar-sized homes of the
 * same type ACTUALLY SOLD FOR nearby, which is the one number the portal never
 * shows and the one thing this product computes that nobody else can: Land
 * Registry sold prices joined to EPC floor areas.
 *
 * ONE LINE, and it obeys the same law as everywhere else. It states a POSITION —
 * within, above, below — and never an adjective. "Below the range" is a fact
 * about arithmetic; "a bargain" is a claim about a house nobody has seen, on a
 * street this tool cannot resolve. The caveat is not decoration: cheap for the
 * size very often means cheap for a reason.
 */
export const PRICE_LINE = {
  within: 'Within the typical range for this size and type',
  above: 'Above the typical range for this size and type',
  below: 'Below the typical range for this size and type',
  /** Always the count, so the reader can weigh the evidence themselves. */
  basis: (n: number): string => `${n} similar sales, last 3 years`,
  /** Said when the sector could not reach five and the wider area was used. */
  widened: 'wider area',
  /**
   * PERMANENT, and carrying both halves: what the comparison cannot see, and how
   * coarse the data underneath it is. Tighter than the panel's wording because
   * this sits on somebody else's page, but it loses neither fact.
   */
  caveat: 'Compares size, not quality, across about 1,500 people. Cheap for the size can mean cheap for a reason.',
} as const;

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
