/**
 * THE REFURB SECTION (R1) — the items, the words, and the param keys.
 *
 * WHAT THIS REPLACED. A dropdown reading "Refurb needed: None / Light /
 * Moderate / Heavy" that was never converted into pounds by anything — see
 * docs/DECISIONS_LOG.md (R1). The real refurb figure was, and still is, the
 * `refurbCost` field the Deal Score reads; it was simply one bare box with no
 * working shown. This section is that box plus its arithmetic.
 *
 * ADD, REMOVE OR RENAME AN ITEM HERE AND NOWHERE ELSE. The rows, the param
 * keys and the operator's figures all key off this list. Two rules:
 *   1. a new item needs a matching key in refurbFigures.ts (test-enforced);
 *   2. changing an item's `key` orphans anything already saved against the old
 *      one — the old value stays in the URL and is ignored, which is honest but
 *      invisible, so prefer editing a `label` over editing a `key`.
 */

import type { RefurbDriver } from '@gil-bricks/core';

/** One big-ticket item. Nothing here is a door handle. */
export interface RefurbItem {
  /** Stable key: the URL param is `rf` + this, capitalised. Never re-used. */
  key: string;
  /** The row's label. Short — it sits beside a tick on a 390px screen. */
  label: string;
  /** Said under the label ONLY where the label alone could be misread. */
  hint?: string;
  /**
   * R2 — how this item's cost scales. Several are meaningless as a flat figure,
   * so they are sized from what we already know rather than guessed:
   *   'flat'    a job price on a typical property
   *   'perSqm'  × internal floor area (EPC, or typed)
   *   'beds'    priced by band, from the bedroom count
   *   'perUnit' × a count the person sets (windows)
   * A row whose driver needs something we do not have SAYS SO on the row — it
   * never contributes a guess to a total somebody then trusts.
   */
  driver: RefurbDriver;
}

/**
 * THE BIG-TICKET ITEMS, in the order a job actually runs: strip it out, fix
 * the fabric, then the trades, then the surfaces, then outside. That order is
 * deliberate — someone reading down the list is walking through the job.
 */
export const REFURB_ITEMS: readonly RefurbItem[] = [
  { key: 'ripOut', label: 'Rip-out and skips', driver: 'flat' },
  { key: 'damp', label: 'Damp or structural', driver: 'flat' },
  { key: 'roof', label: 'Roof', driver: 'flat' },
  { key: 'windows', label: 'Windows', driver: 'perUnit' },
  { key: 'rewire', label: 'Full rewire', driver: 'beds' },
  { key: 'plumbing', label: 'Plumbing', hint: 'Not the boiler — that is the next row.', driver: 'flat' },
  { key: 'heating', label: 'Boiler and heating', driver: 'flat' },
  { key: 'plastering', label: 'Plastering', driver: 'perSqm' },
  { key: 'kitchen', label: 'Kitchen', driver: 'flat' },
  { key: 'bathroom', label: 'Bathroom', driver: 'flat' },
  { key: 'flooring', label: 'Flooring', driver: 'perSqm' },
  { key: 'decoration', label: 'Decoration', driver: 'flat' },
  { key: 'externals', label: 'Garden and externals', driver: 'flat' },
  { key: 'other', label: 'Anything else', hint: 'Fees, surveys, anything the list misses.', driver: 'flat' },
];

/** The URL param a row writes to. One rule, so nothing keeps a second list. */
export function paramFor(key: string): string {
  return `rf${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

export const REFURB = {
  /** The strategy field this section owns. StrategyInputs stops drawing it, so
   * the figure appears once on the page — here, with its working. */
  fieldKey: 'refurbCost',
  /** R2 — how old the operator's figures may get before the page says so. */
  staleAfterMonths: 12,
  /** R2 — the label over his suggested figures. Only shown once he has some. */
  figuresLabel: 'Gil’s rough figures — change them to yours',
  /** The anchor and its chip. Kept with the section, not retyped in the strip. */
  sectionId: 'sec-refurb',
  chipLabel: 'Refurb',
  copy: {
    heading: 'Refurb',
    /** Under the heading. Says what the number is for, in one line. */
    lead: 'The figure the score uses. Type it, or add it up below.',
    totalLabel: 'Refurb budget',
    /** The disclosure that holds the fourteen rows. Closed on a phone. */
    breakdown: 'Break it down',
    breakdownOpen: 'Hide the breakdown',
    /** Beside the sum, when the list is in charge. */
    sumLabel: 'Added up from your list',
    /** The one-line working, e.g. "4 items · £18,500". */
    sumLine: (count: number, total: string): string =>
      `${count} ${count === 1 ? 'item' : 'items'} · ${total}`,
    /** Said when the list is in charge, beside the now-derived total. */
    listInCharge: 'Your list sets this. Untick everything to type your own.',
    /** The per-row number box. */
    amountLabel: (item: string): string => `${item} — cost (£)`,
    tickLabel: (item: string): string => `Include ${item}`,
    /** Nothing ticked. Not an error — the honest empty state. */
    nothingTicked: 'Nothing ticked. The typed figure above is being used.',
    /** R1 rule 4 — shown while the operator has given no figures at all. */
    figuresEmpty: 'Suggested figures are not in yet. Type your own for now.',
    /** A quote (or anything else) has replaced an itemised list. */
    superseded: (total: string): string => `A later figure of ${total} is being used instead.`,
    supersededWhy: 'Your list is kept below. Untick everything to use it again.',
    /** R1 rule 3 — a deal saved before this section existed. Said ONCE. */
    legacy: 'This deal’s refurb was one figure. It carried over. Break it down if you want.',
    legacyDismiss: 'Got it',

    // ---- R2 ----
    /** The inferred region, said in one line with a way to change it. */
    regionLine: (region: string): string => `Figures for ${region}.`,
    regionChange: 'Change region',
    regionLabel: 'Region these figures are for',
    /** No region could be inferred — honest, and the picker is the fix. */
    regionUnknown: 'Pick a region to see suggested figures.',
    /** The range under a filled row, e.g. "typically £3,800–£6,200". */
    rowRange: (low: string, high: string): string => `typically ${low}–${high}`,
    /** A row we cannot size. One line each, naming what is missing. */
    needsArea: 'Add a floor area to size this one.',
    needsBeds: 'Add bedrooms to size this one.',
    needsCount: 'How many?',
    countLabel: (item: string): string => `${item} — how many`,
    /** The windows count is prefilled from bedrooms and must say so. */
    countGuess: 'A guess from the bedrooms. Change it.',
    /** Who is doing the work. */
    labourLabel: 'Who is doing the work',
    /** The total's range, beside the mid-point. */
    totalRange: (low: string, high: string): string => `Range ${low}–${high}`,
    /** The working. Every step, named. */
    maths: 'How is this worked out?',
    mathsItem: 'Item',
    mathsBase: 'Base',
    mathsRegion: 'Region',
    mathsLabour: 'Labour',
    mathsRow: 'Figure',
    mathsSubtotal: 'Subtotal',
    mathsContingency: (pct: string): string => `Contingency ${pct}%`,
    mathsTotal: 'Total',
    /** A per-unit or per-m² base, e.g. "£45/m² × 92 m²". */
    mathsQuantity: (base: string, qty: string): string => `${base} × ${qty}`,
    /** When the figures were compiled, and whether they are getting old. */
    reviewed: (when: string): string => `Figures last reviewed ${when}.`,
    stale: 'They are over a year old — treat them as rough.',
  },
} as const;

/**
 * R2 — WHO IS DOING THE WORK. Four options, and the default is a builder
 * because that is what the stored figures are priced at.
 *
 * THE FACTORS ARE NOT HERE. They live with the operator's other numbers in
 * refurbFigures.ts, because they are his to set — see LABOUR_FACTORS there,
 * which also states the direction each one must move in.
 */
export interface LabourOption {
  id: string;
  label: string;
  /** One line under the selector when this one is chosen. */
  note: string;
}

export const LABOUR_OPTIONS: readonly LabourOption[] = [
  {
    id: 'mainContractor',
    label: 'A main contractor',
    note: 'They coordinate the trades and carry the risk, and charge for it.',
  },
  {
    id: 'builder',
    label: 'A builder',
    note: 'What these figures are priced at.',
  },
  {
    id: 'tradesDirect',
    label: 'Trades direct',
    note: 'Cheaper because you are the project manager.',
  },
  {
    id: 'diy',
    label: 'Mostly DIY',
    // The operator asked for this to be blunt. It is the one option whose
    // number flatters the deal by leaving the biggest cost out of it.
    note: 'Materials only. It assumes your time is free. This is how people get burned.',
  },
];

export const DEFAULT_LABOUR = 'builder';

/** R2 — the contingency line. Editable; the note is why 10% may not be enough. */
export const CONTINGENCY = {
  label: 'Contingency',
  unit: '%',
  default: '10',
  note: 'Older stock usually wants 15–20%.',
} as const;

/**
 * R2 — THE CAVEAT. Said once, where the number is. The operator's voice, and
 * deliberately not softened: the mid-point is the least useful number on the
 * page if somebody reads it as a quote.
 */
export const REFURB_CAVEAT = {
  heading: 'Before you trust these',
  lines: [
    'These are starting points for a typical property in that region.',
    'They are not a quote.',
    'Real cost depends on what you cannot see until the work starts.',
    'Damp and structural is the one that ruins budgets.',
    'Get three quotes.',
  ],
  /** Only said once the operator has told us whether his figures include VAT.
   * There is NO VAT toggle on purpose: it is the likeliest way to double-count. */
  vat: (includes: boolean): string =>
    includes
      ? 'These figures include VAT. Check whether your quote does.'
      : 'These figures exclude VAT. Check whether your quote includes it.',
} as const;

/**
 * R3 — THE PHOTO CAROUSEL'S OWN WORDS.
 *
 * The section's job changes: instead of a list of items to tick in the
 * abstract, it is the listing's photographs one at a time with the costs
 * underneath — which is how people actually assess a refurb. The list itself is
 * unchanged and is always one tap away.
 */
export const REFURB_PHOTOS = {
  heading: 'The listing’s photos',
  /** Said once, where the photos are. The whole honesty position, in one place. */
  caveat: 'Photos are wide-angle, staged, chosen by the agent and sometimes old. This is a list of things to check, not a survey.',
  /** The control that collapses the photos and leaves the plain list. */
  hide: 'Hide photos',
  show: 'Show photos',
  /** Where we are in the reel. */
  counter: (n: number, total: number): string => `${n} of ${total}`,
  prev: 'Previous photo',
  next: 'Next photo',
  none: 'This listing came with no photos. The list below still works.',
  failed: 'That photo would not load.',

  /** R3 — the room is TAPPED, never detected. Said plainly. */
  roomLabel: 'What room is this?',
  roomHint: 'Tap a room and we will show pointers for it.',
  roomNames: {
    kitchen: 'Kitchen',
    bathroom: 'Bathroom',
    bedroom: 'Bedroom',
    living: 'Living room',
    hall: 'Hall',
    loft: 'Loft',
    outside: 'Outside',
    garden: 'Garden',
  } as Record<string, string>,

  /** The pointer beside a photo. One, never two. */
  tip: {
    heading: 'What to look for',
    /** The cost item it implicates, as a one-tap tick. */
    tick: (item: string): string => `Add ${item}`,
    ticked: (item: string): string => `${item} ticked.`,
    /** What it would actually take to know. Always shown with the tip. */
    caveatLabel: 'To be sure',
    /** Named so nobody has to take our word for the rule behind it. */
    regulation: (name: string, checked: string): string => `${name} · checked ${checked}`,
    /**
     * WHAT KIND of thing is behind the tip. Said because "Part M" alone reads
     * as though it binds this house, and for an existing home it does not.
     */
    basis: {
      legal: 'The law — often only for new or altered work',
      policy: 'Confirmed policy, not yet fully in force',
      standard: 'A standard, checked by a report',
      practitioner: 'Trade experience, not a regulation',
    } as Record<string, string>,
    /** Confidence, said in the user's language rather than ours. */
    confidence: {
      conclusive: 'Usually clear from a photo',
      strong: 'Usually clear from a photo',
      indicative: 'Worth investigating',
      weak: 'A weak signal only',
    } as Record<string, string>,
    /** Every pointer for this room has been shown to this person already. */
    exhausted: 'You have seen every pointer we have for this room.',
    /** The library is not in yet — said honestly rather than left blank. */
    none: 'No pointers yet.',
  },
} as const;
