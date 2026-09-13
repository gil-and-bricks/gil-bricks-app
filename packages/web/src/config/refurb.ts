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

/** One big-ticket item. Nothing here is a door handle. */
export interface RefurbItem {
  /** Stable key: the URL param is `rf` + this, capitalised. Never re-used. */
  key: string;
  /** The row's label. Short — it sits beside a tick on a 390px screen. */
  label: string;
  /** Said under the label ONLY where the label alone could be misread. */
  hint?: string;
}

/**
 * THE BIG-TICKET ITEMS, in the order a job actually runs: strip it out, fix
 * the fabric, then the trades, then the surfaces, then outside. That order is
 * deliberate — someone reading down the list is walking through the job.
 */
export const REFURB_ITEMS: readonly RefurbItem[] = [
  { key: 'ripOut', label: 'Rip-out and skips' },
  { key: 'damp', label: 'Damp or structural' },
  { key: 'roof', label: 'Roof' },
  { key: 'windows', label: 'Windows' },
  { key: 'rewire', label: 'Full rewire' },
  { key: 'plumbing', label: 'Plumbing' },
  { key: 'heating', label: 'Boiler and heating' },
  { key: 'plastering', label: 'Plastering' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'bathroom', label: 'Bathroom' },
  { key: 'flooring', label: 'Flooring' },
  { key: 'decoration', label: 'Decoration' },
  { key: 'externals', label: 'Garden and externals' },
  { key: 'other', label: 'Anything else', hint: 'Fees, surveys, anything the list misses.' },
];

/** The URL param a row writes to. One rule, so nothing keeps a second list. */
export function paramFor(key: string): string {
  return `rf${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

export const REFURB = {
  /** The strategy field this section owns. StrategyInputs stops drawing it, so
   * the figure appears once on the page — here, with its working. */
  fieldKey: 'refurbCost',
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
  },
} as const;
