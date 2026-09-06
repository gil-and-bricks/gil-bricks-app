/**
 * Deal-pipeline configuration (P1). The pipeline is exactly one buy-side
 * workflow: the extension triages a listing → the user sends it to the analyser
 * → the analysed deal enters the pipeline → it progresses until the property is
 * bought, or dies. It ENDS at purchase (nothing about owning/letting/tax), has
 * NO manual entry (a deal can only come from an analyser payload), and nothing
 * investor-facing or teaching-related.
 *
 * STABLE KEYS live in the database; DISPLAY COPY lives here, so the wording can
 * change with no migration. Fact types are config-driven too. No new formulas —
 * scoring always reuses @gil-bricks/core.
 */

/** A stage in the deal's life. Keys are stable (stored in `deals.stage`). */
export interface Stage {
  /** Stable key stored in the DB — never reword this. */
  key: string;
  /** Display copy — reword freely, no migration needed. */
  label: string;
  /** One-line plain description for the UI (also editable). */
  blurb: string;
  /**
   * Stage-aware ageing + the "today" ranking (P4). `dwellNormalDays` is how long a
   * deal can sit HERE before it's worth a nudge — chasing an accepted offer is
   * urgent within days; waiting on searches is normal for weeks. Past it the card
   * ages to amber; past `dwellColdDays` it's gone cold. 0 = terminal, never ages.
   * Editable here — no migration, no code change.
   */
  dwellNormalDays: number;
  dwellColdDays: number;
  /** The ONE thing to do, imperative — used by the today line. '' = terminal. */
  todo: string;
}

/**
 * The seven ordered stages of a living deal, worth-a-look → bought-it. The first
 * six are `live`; `bought-it` is the successful terminal (`done`). Dwell days and
 * copy are all editable here without a migration.
 */
export const PROGRESS_STAGES: readonly Stage[] = [
  { key: 'worth-a-look', label: 'Worth a look', blurb: 'A deal you’ve sent over that looks worth checking.', dwellNormalDays: 3, dwellColdDays: 10, todo: 'Decide if it’s worth a viewing' },
  { key: 'going-to-view', label: 'Going to view', blurb: 'You’re booked in or planning to see it.', dwellNormalDays: 7, dwellColdDays: 21, todo: 'Book the viewing, or bin it' },
  { key: 'getting-real-numbers', label: 'Getting real numbers', blurb: 'Chasing the figures that firm up the estimate — rent, refurb, quotes.', dwellNormalDays: 14, dwellColdDays: 35, todo: 'Get the numbers that firm it up' },
  { key: 'offer-in', label: 'Offer in', blurb: 'You’ve made an offer and are waiting.', dwellNormalDays: 4, dwellColdDays: 10, todo: 'Chase the agent on your offer' },
  { key: 'offer-accepted', label: 'Offer accepted', blurb: 'Offer agreed — into the legal and survey work.', dwellNormalDays: 21, dwellColdDays: 49, todo: 'Push the solicitor along' },
  { key: 'nearly-there', label: 'Nearly there', blurb: 'Exchange in sight — final checks landing.', dwellNormalDays: 21, dwellColdDays: 49, todo: 'Chase exchange' },
  { key: 'bought-it', label: 'Bought it', blurb: 'Completed. The deal is done.', dwellNormalDays: 0, dwellColdDays: 0, todo: '' },
] as const;

/** The dead terminal stage (status `dead`). Kept out of the ordered list. */
export const DEAD_STAGE: Stage = {
  key: 'parked-dead',
  label: 'Parked / dead',
  blurb: 'Not proceeding — kept as memory of why it didn’t work.',
  dwellNormalDays: 0,
  dwellColdDays: 0,
  todo: '',
};

/**
 * Reasons to park/kill a deal — a single chip, never an essay (P4 quick action;
 * P9 builds the full graveyard). Stable keys; reword the labels freely.
 */
export interface ParkReason {
  key: string;
  label: string;
}
export const PARK_REASONS: readonly ParkReason[] = [
  { key: 'too-dear', label: 'Too dear' },
  { key: 'numbers-fail', label: 'Numbers don’t work' },
  { key: 'chain-fell', label: 'Chain fell through' },
  { key: 'beaten', label: 'Beaten to it' },
  { key: 'changed-mind', label: 'Changed my mind' },
  { key: 'other', label: 'Other' },
] as const;
export const PARK_REASON_KEYS: readonly string[] = PARK_REASONS.map((r) => r.key);

/** Every valid stage key (the seven + parked-dead). */
export const ALL_STAGES: readonly Stage[] = [...PROGRESS_STAGES, DEAD_STAGE];
export const STAGE_KEYS: readonly string[] = ALL_STAGES.map((s) => s.key);

/** A deal is live (still moving), done (bought) or dead (parked). */
export type DealStatus = 'live' | 'dead' | 'done';
export const DEAL_STATUSES: readonly DealStatus[] = ['live', 'dead', 'done'];

/** The status a stage implies: bought-it ⇒ done, parked-dead ⇒ dead, else live. */
export function statusForStage(stageKey: string): DealStatus {
  if (stageKey === 'bought-it') return 'done';
  if (stageKey === DEAD_STAGE.key) return 'dead';
  return 'live';
}

export function isStage(key: string): boolean {
  return STAGE_KEYS.includes(key);
}
export function isDealStatus(key: string): key is DealStatus {
  return (DEAL_STATUSES as readonly string[]).includes(key);
}

/** The stage a brand-new deal from the analyser starts at. */
export const INITIAL_STAGE = 'worth-a-look';

/**
 * Shown when a user hits the LIVE-deal cap. Helpful, not a wall: dead deals free
 * a slot and their reason is kept as memory. Reworded here without a code change.
 */
export const LIVE_CAP_MESSAGE =
  'You’ve got 100 live deals. Kill a dead one to free a slot.';

/**
 * Fact types the pipeline re-scores against — the facts that arrive after a deal
 * is first sent over (the builder's quote lands, the survey finds damp, the
 * lender down-values, a covenant appears, auction fees emerge from the legal
 * pack). Config-driven: add or reword here, no migration. Keys are stored in
 * `deal_facts.fact_type`.
 */
export interface FactType {
  key: string;
  label: string;
  /**
   * NUMBER facts move the maths. FLAG facts cannot: a covenant is not a number,
   * so it marks the deal and says what to check, and never invents a cost (P5).
   */
  kind: 'number' | 'flag';
  /** What the number is, in the operator's words — the field's own label. */
  numberLabel?: string;
  /** One line under the field: where the number comes from. */
  hint?: string;
  /**
   * Which ANALYSER INPUT this fact becomes, per strategy, and how. 'replace'
   * overwrites the assumption; 'add' stacks on top of it. A strategy missing
   * from this map cannot be re-scored by this fact — the deal is flagged
   * instead, with `noEffect` saying so. `shownAs` is the analyser's OWN label
   * for that input, so an added cost can say where it will turn up.
   */
  applies?: Record<string, { param: string; mode: 'replace' | 'add'; shownAs?: string }>;
  /** Said on the deal when the fact carries no maths for THIS strategy. */
  noEffect?: string;
  /** Said on the deal for a flag fact: why it matters and what to check. */
  flagNote?: string;
}

/**
 * THE FACTS A DEAL CAN LEARN (P5). Each says in plain English what it changes
 * and how. Adding one is an entry here plus nothing else: the sheet, the
 * re-score and the deal's fact list all read this list.
 *
 * The param names are the analyser's own URL keys, so a fact becomes exactly
 * the same input a person could have typed — there is no second pathway into
 * the maths, and no formula lives here.
 */
/**
 * Said when a fact cannot re-score THIS deal. A comparables deal has no strategy
 * maths at all; a scored deal can still meet a fact its strategy has no input
 * for. Neither invents a cost — they say plainly what happened (P5).
 */
export const FACT_NO_MATHS = 'This deal has no strategy maths, so nothing re-scores. The fact is kept here.';
export const FACT_NO_EFFECT = 'This does not change this deal’s maths. It is kept here so you do not lose it.';

export const FACT_TYPES: readonly FactType[] = [
  {
    key: 'builder-quote',
    label: 'Builder’s quote',
    kind: 'number',
    numberLabel: 'The quote (£)',
    hint: 'The real number replaces your refurb guess.',
    applies: {
      btl: { param: 'refurbCost', mode: 'replace' },
      brrrr: { param: 'refurbCost', mode: 'replace' },
      flip: { param: 'refurbCost', mode: 'replace' },
      hmo: { param: 'refurbCost', mode: 'replace' },
    },
  },
  {
    key: 'survey-finding',
    label: 'Survey finding',
    kind: 'number',
    numberLabel: 'Extra work it found (£)',
    hint: 'Added to the refurb budget.',
    applies: {
      btl: { param: 'refurbCost', mode: 'add' },
      brrrr: { param: 'refurbCost', mode: 'add' },
      flip: { param: 'refurbCost', mode: 'add' },
      hmo: { param: 'refurbCost', mode: 'add' },
    },
  },
  {
    key: 'down-valuation',
    label: 'Down-valuation',
    kind: 'number',
    numberLabel: 'The valuer’s figure (£)',
    hint: 'Replaces the end value you assumed.',
    applies: {
      brrrr: { param: 'arv', mode: 'replace' },
      flip: { param: 'gdv', mode: 'replace' },
    },
    noEffect: 'There is no end value in this strategy, so this cannot re-score it. It still matters to your lender.',
  },
  {
    key: 'auction-fees',
    label: 'Auction fees',
    kind: 'number',
    numberLabel: 'The fees (£)',
    hint: 'Added to your buying costs.',
    applies: {
      btl: { param: 'legals', mode: 'add', shownAs: 'Legal & survey costs' },
      brrrr: { param: 'legals', mode: 'add', shownAs: 'Legal & survey costs' },
      flip: { param: 'legals', mode: 'add', shownAs: 'Purchase legals & survey' },
      hmo: { param: 'legals', mode: 'add', shownAs: 'Legal & survey costs' },
    },
  },
  {
    key: 'service-charge',
    label: 'Service charge',
    kind: 'number',
    numberLabel: 'Cost a year (£)',
    hint: 'Added to the yearly running costs.',
    applies: {
      btl: { param: 'insurance', mode: 'add', shownAs: 'Landlord insurance' },
      brrrr: { param: 'insurance', mode: 'add', shownAs: 'Landlord insurance' },
      hmo: { param: 'compliancePerYear', mode: 'add', shownAs: 'Compliance costs' },
    },
    noEffect: 'A flip is sold, not let, so a yearly charge does not change the deal maths. Budget for it while you hold it.',
  },
  {
    key: 'ground-rent',
    label: 'Ground rent',
    kind: 'number',
    numberLabel: 'Cost a year (£)',
    hint: 'Added to the yearly running costs.',
    applies: {
      btl: { param: 'insurance', mode: 'add', shownAs: 'Landlord insurance' },
      brrrr: { param: 'insurance', mode: 'add', shownAs: 'Landlord insurance' },
      hmo: { param: 'compliancePerYear', mode: 'add', shownAs: 'Compliance costs' },
    },
    noEffect: 'A flip is sold, not let, so a yearly charge does not change the deal maths. Budget for it while you hold it.',
  },
  {
    key: 'short-lease',
    label: 'Short lease',
    kind: 'flag',
    flagNote: 'A short lease can stop a lender lending and costs money to extend. Get the exact years left and a premium estimate before you offer.',
  },
  {
    key: 'covenant',
    label: 'Covenant',
    kind: 'flag',
    flagNote: 'A covenant can restrict letting, building or selling. Ask your solicitor what it says before you spend anything.',
  },
];
export const FACT_TYPE_KEYS: readonly string[] = FACT_TYPES.map((f) => f.key);
export function isFactType(key: string): boolean {
  return FACT_TYPE_KEYS.includes(key);
}

/**
 * The board's own words (lib/deals/board.ts writes the lines; the board SCREEN,
 * components/deals/DealBoard.tsx, reads `screen` and `card`. N1 moved the lines
 * here and N5 the screen's own buttons and states, so no user-facing string
 * lives in code — Reversibility charter). Reword freely.
 */
export const BOARD_COPY = {
  /** Dwell phrases appended to the stage's `todo`. */
  dwell: {
    today: 'today',
    day: 'day',
    days: 'days',
    satHere: 'sat here',
    noUpdate: 'no update',
    goneCold: 'gone cold',
  },
  /** The input a strategy needs before it can be scored (the human name). */
  missing: {
    price: 'a price',
    rent: 'a rent',
    roomRent: 'a room rent',
    tooManyRooms: 'a smaller HMO (6 rooms or fewer)',
  },
  /** An unscored live deal never shows a bare dash. */
  addToScore: (missing: string) => `Add ${missing} to score this`,
  tapToScore: 'Tap to score this',
  /** The honest "nothing to do" lines. */
  nothingToday: 'Nothing needs you today.',
  tickingAlong: (n: number) => `Nothing needs you today. ${n} deal${n === 1 ? '' : 's'} ticking along.`,
  /** The quiet counter: "3 of 100 live · 1 bought · 2 parked". */
  counter: {
    live: (live: number, cap: number) => `${live} of ${cap} live`,
    bought: (n: number) => `${n} bought`,
    parked: (n: number) => `${n} parked`,
    separator: ' · ',
  },
  /** The whole-board states: signed out, broken, or nothing sent over yet. The
   *  sentence under each heading is COPY.account (src/config/copy.ts). */
  screen: {
    signInHeading: 'Sign in to see your pipeline',
    signInButton: 'Log in',
    loadFailed: 'Couldn’t load your pipeline just now — refresh the page to retry.',
    emptyHeading: 'No deals yet',
  },
  /** One deal card: its score badge, its stage picker, its park chips, and the
   *  one line it says back after a move or a park. */
  card: {
    /** Read aloud for the score badge — the figure is already on screen. */
    scoreLabel: (score: string) => `Deal score ${score} out of 10`,
    /** The comparables badge; every other strategy carries its own short name. */
    compsBadge: 'Comps',
    moveLabel: (title: string) => `Move ${title} to a stage`,
    park: 'Park',
    parkReasonsLabel: (title: string) => `Why are you parking ${title}?`,
    keepIt: 'Keep it',
    skippedStage: 'Skipped a stage — your call.',
    /** P5 — the fact flow, from the card. Short: this is used in a hallway. */
    factsOpen: 'What happened?',
    factsHeading: (title: string) => `What happened with ${title}?`,
    factSave: 'Save',
    factSaving: 'Saving…',
    factCancel: 'Cancel',
    factNoteLabel: 'Note (optional)',
    factAdded: (label: string) => `${label} added — re-scored.`,
    factFlagged: (label: string) => `${label} added — it flags the deal.`,
    factFailed: 'That did not save. Try again.',
    factNeedsNumber: 'Type the number first.',
    factLandsIn: (line: string) => `It shows in “${line}” in the analyser.`,
    factRemoved: 'Fact removed — score put back.',
    factDropped: 'Fact removed.',
    /** Shown on a deal saved before we kept the sold prices behind its score. It is
     * true whether or not the deal has been re-scored, and it names the one-tap fix. */
    factNoEvidence: 'The sold prices behind this score were not kept. Open and save this deal to store them.',
    factsListHeading: 'What this deal has learned',
    factRemove: 'Remove',
    factRemoveLabel: (label: string) => `Remove ${label}`,
    factOn: (date: string) => `added ${date}`,
    /** Said back after a successful move or park — the card jumps columns, so
     *  without this nothing confirmed anything happened (D1). */
    moved: (stage: string): string => `Moved to ${stage}.`,
    parked: (reason: string): string => `Parked — ${reason}.`,
    moveFailed: 'That didn’t move — put back. Try again.',
    parkFailed: 'That didn’t save — put back. Try again.',
  },
} as const;

