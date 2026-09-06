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
  /** The ONE thing to do, imperative — the card's next-step line. '' = terminal. */
  todo: string;
  /**
   * The same instruction as a short verb that takes a deal's name, for the today
   * line: "Chase the agent on 14 Maple Street". Ends with its own preposition so
   * the line reads as one sentence. '' = terminal (P8).
   */
  act: string;
}

/**
 * The seven ordered stages of a living deal, worth-a-look → bought-it. The first
 * six are `live`; `bought-it` is the successful terminal (`done`). Dwell days and
 * copy are all editable here without a migration.
 */
export const PROGRESS_STAGES: readonly Stage[] = [
  { key: 'worth-a-look', label: 'Worth a look', blurb: 'A deal you’ve sent over that looks worth checking.', dwellNormalDays: 3, dwellColdDays: 10, todo: 'Decide if it’s worth a viewing', act: 'Decide on' },
  { key: 'going-to-view', label: 'Going to view', blurb: 'You’re booked in or planning to see it.', dwellNormalDays: 7, dwellColdDays: 21, todo: 'Book the viewing, or bin it', act: 'Book the viewing for' },
  { key: 'getting-real-numbers', label: 'Getting real numbers', blurb: 'Chasing the figures that firm up the estimate — rent, refurb, quotes.', dwellNormalDays: 14, dwellColdDays: 35, todo: 'Get the numbers that firm it up', act: 'Get the numbers on' },
  { key: 'offer-in', label: 'Offer in', blurb: 'You’ve made an offer and are waiting.', dwellNormalDays: 4, dwellColdDays: 10, todo: 'Chase the agent on your offer', act: 'Chase the agent on' },
  { key: 'offer-accepted', label: 'Offer accepted', blurb: 'Offer agreed — into the legal and survey work.', dwellNormalDays: 21, dwellColdDays: 49, todo: 'Push the solicitor along', act: 'Push the solicitor on' },
  { key: 'nearly-there', label: 'Nearly there', blurb: 'Exchange in sight — final checks landing.', dwellNormalDays: 21, dwellColdDays: 49, todo: 'Chase exchange', act: 'Chase exchange on' },
  { key: 'bought-it', label: 'Bought it', blurb: 'Completed. The deal is done.', dwellNormalDays: 0, dwellColdDays: 0, todo: '', act: '' },
] as const;

/** The dead terminal stage (status `dead`). Kept out of the ordered list. */
export const DEAD_STAGE: Stage = {
  key: 'parked-dead',
  label: 'Parked / dead',
  blurb: 'Not proceeding — kept as memory of why it didn’t work.',
  dwellNormalDays: 0,
  dwellColdDays: 0,
  todo: '',
  act: '',
};

/**
 * WHY A DEAL DIED (P4 chip; P9 makes it mean something).
 *
 * Killing deals is the job — most deals should die, and the ones you kill are
 * the money you did not lose. One chip, thirty seconds, no essay. Keys are
 * stable (they are stored in `deal_deaths.reason_key`); everything else here is
 * yours to reword, and adding a reason is one line.
 */
export interface ParkReason {
  key: string;
  label: string;
  /** How the pattern line names it: "died on refurb cost". */
  diedOn: string;
  /**
   * What five or more of these in a row MIGHT mean — hedged on purpose, because
   * a pattern is a prompt to look again, never a diagnosis. A reason that
   * carries no lesson (you changed your mind, the seller pulled out) has none,
   * and the line then states the sample and stops.
   */
  pattern?: string;
}
export const PARK_REASONS: readonly ParkReason[] = [
  { key: 'numbers-fail', label: 'Numbers didn\u2019t work', diedOn: 'the numbers', pattern: 'Your sourcing may be bringing you the wrong deals.' },
  { key: 'down-valued', label: 'Down-valued', diedOn: 'the valuation', pattern: 'Your end values may be running high.' },
  { key: 'survey', label: 'Survey', diedOn: 'the survey', pattern: 'You may be offering before you know the building.' },
  { key: 'refurb-too-high', label: 'Refurb too high', diedOn: 'refurb cost', pattern: 'Your refurb guesses may be running light.' },
  { key: 'beaten', label: 'Lost to another buyer', diedOn: 'a rival buyer', pattern: 'You may be offering too late, or too low.' },
  { key: 'lease-legal', label: 'Lease or legal', diedOn: 'the lease or the legals', pattern: 'You may be finding the legal problems late.' },
  { key: 'changed-mind', label: 'Changed my mind', diedOn: 'a change of mind' },
  { key: 'seller-pulled-out', label: 'Seller pulled out', diedOn: 'the seller pulling out' },
  // About an eighth of collapsed UK sales die on a chain break. It is a real
  // cause and nothing you control, so it carries no lesson either.
  { key: 'chain-fell', label: 'Chain fell through', diedOn: 'a chain falling through' },
] as const;
export function parkReason(key: string): ParkReason | undefined {
  return PARK_REASONS.find((r) => r.key === key);
}
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
 * HOW MANY LIVE DEALS ONE PERSON CAN HOLD (P1; a knob since P11). Dead and bought
 * deals never count against it — they are the memory, not the load. Raise it and
 * the board, the counter and the at-cap refusal all move together.
 */
export const MAX_LIVE_DEALS = 100;

/**
 * WHEN THE DAILY JOB RUNS, as a Cloudflare cron expression (UTC). It computes the
 * stage-aware staleness stamp and NOTHING else — it never notifies anybody, and
 * this app still sends no email of any kind. Changing it here means changing it
 * in packages/web/wrangler.jsonc too; a test fails if the two disagree.
 */
export const DAILY_CRON = '0 6 * * *';

/**
 * HOW MUCH OF THE BOARD TRAVELS AT ONCE (P11). Live deals are already bounded by
 * MAX_LIVE_DEALS, but bought and killed deals are kept for ever, so the board
 * loads a WINDOW of those and asks for more on request. The counts beside them
 * are always the true totals, counted in the database — a window never changes
 * a number, only how much of the list is on screen.
 */
export const BOARD_PAGE = {
  /** Bought deals loaded with the board. */
  done: 20,
  /** Killed deals loaded with the board — the graveyard's first page. */
  dead: 20,
  /** How many more arrive each time you ask for more. */
  more: 20,
} as const;

/**
 * Shown when a user hits the LIVE-deal cap. Helpful, not a wall: dead deals free
 * a slot and their reason is kept as memory. Reworded here without a code change.
 */
export const LIVE_CAP_MESSAGE =
  'You’ve got 100 live deals. Kill one to free a slot.';

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
  /**
   * How the re-trade message OPENS when this fact is what moved the deal (P11).
   * It states what landed, in your own voice, with the fact's own number — and
   * never says how to feel about it. Only the facts in RETRADE.facts use it.
   */
  retrade?: (value: string) => string;
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
 * WHAT NEEDS YOU TODAY (P8) — the urgency ranking, in strict order.
 *
 * Retune it here: reorder `order` to change what shouts loudest, move
 * `deadlineWithinHours`, or change which evidence a stage expects. Nothing about
 * this lives in code. If nothing qualifies the board says so plainly — urgency
 * is never manufactured to fill the line.
 */
export const URGENCY = {
  /**
   * Strict precedence. First match wins; a tie inside one tier goes to the deal
   * with the most money at stake, because that is the one you cannot afford to
   * get wrong.
   *  - `deadline`         a date YOU set that is nearly here or past
   *  - `unread-change`    the answer moved and you have not read it (P6)
   *  - `stale`            sat longer than is normal FOR ITS STAGE
   *  - `missing-evidence` at a stage that should have it, still guessing (P7)
   */
  order: ['deadline', 'unread-change', 'stale', 'missing-evidence'] as const,
  /**
   * The ONLY tier that earns an interruption (P10). A dated deadline inside
   * `deadlineWithinHours` is the one thing you cannot fix tomorrow; everything
   * else is a number on a badge. Set it to '' and the extension never notifies
   * at all, without a code change.
   */
  critical: 'deadline' as string,
  /** How many dated deadlines a surface is told about at once. A nudge, not a
   * feed: the extension announces the first one it has not already announced. */
  criticalMax: 5,
  /**
   * A dated deadline this close is the most urgent thing on the board. 48 hours
   * because that is the last point at which you can still DO something about an
   * auction, an exchange or a chase you promised yourself.
   */
  deadlineWithinHours: 48,
  /**
   * Which evidence a stage should have by now, as P7 chip keys. Nothing is
   * expected while you are still deciding whether to view it; a refurb is
   * expected the moment the stage is ABOUT getting real numbers, and the rent
   * once money is committed. A deal missing one of these is the quietest kind of
   * urgent: nothing has gone wrong, but the number under the decision is a guess.
   */
  expectedEvidence: {
    'getting-real-numbers': ['refurb'],
    'offer-in': ['refurb'],
    'offer-accepted': ['refurb', 'rent'],
    'nearly-there': ['refurb', 'rent'],
  } as Record<string, readonly string[]>,
} as const;

/**
 * The dates a person can set on a deal (P8). Each says WHERE it can be set, so a
 * date that makes no sense at this stage is never offered. Keys are stable (they
 * are columns); labels and prompts are yours to reword.
 */
export interface DealDateSpec {
  key: 'viewing_date' | 'chase_date' | 'auction_date' | 'exchange_date';
  label: string;
  /** The button before a date is set. */
  add: string;
  /** How the today line names it: "the auction is tomorrow". */
  noun: string;
  /** How the CALENDAR names it, at the front of the event's title (P10). */
  event: string;
  /** Only offered on an auction deal. */
  auctionOnly?: boolean;
  /** Only offered at these stages; absent means any live stage. */
  stages?: readonly string[];
}
export const DEAL_DATES: readonly DealDateSpec[] = [
  {
    // First in a deal's life, and the one with somebody waiting at the other end
    // of it, so it is offered while you are still deciding to go (P10).
    key: 'viewing_date', label: 'Viewing', add: 'Set the viewing date', noun: 'the viewing',
    event: 'Viewing', stages: ['worth-a-look', 'going-to-view'],
  },
  { key: 'chase_date', label: 'Chase on', add: 'Set a chase date', noun: 'your chase date', event: 'Chase' },
  { key: 'auction_date', label: 'Auction', add: 'Set the auction date', noun: 'the auction', event: 'Auction', auctionOnly: true },
  {
    key: 'exchange_date', label: 'Exchange', add: 'Set the exchange date', noun: 'exchange',
    event: 'Exchange', stages: ['offer-accepted', 'nearly-there'],
  },
];
export const DEAL_DATE_KEYS: readonly string[] = DEAL_DATES.map((d) => d.key);

/**
 * Does this date make sense on this deal RIGHT NOW? One rule, two callers: the
 * card offers a date only where it applies, and the today line ranks one only
 * where it applies. A date set earlier and stranded by a stage move stays
 * visible and clearable — it simply stops shouting about an exchange that is no
 * longer happening (P8 review).
 */
export function dateAppliesAt(spec: DealDateSpec, stage: string, isAuction: boolean): boolean {
  if (spec.auctionOnly && !isAuction) return false;
  return spec.stages ? spec.stages.includes(stage) : true;
}

/** The words for the today line and the date controls (P8). */
export const TODAY_COPY = {
  /** Tier (a): a date you set is nearly here. */
  deadline: (act: string, title: string, noun: string, when: string): string => `${act} ${title} — ${noun} is ${when}.`,
  /** Tier (b): the answer moved and you have not read it. */
  unreadChange: (title: string, score: string): string => `Read what changed on ${title} — the answer moved to ${score}.`,
  /** Tier (c): sat longer than is normal for its stage. */
  stale: (act: string, title: string, days: string): string => `${act} ${title} — ${days} at this stage.`,
  /** Tier (d): the number under the decision is still a guess. */
  missing: (action: string, title: string, stage: string): string => `${action} for ${title} — you are at ${stage} on a guess.`,
  /** When a date has passed. */
  when: { today: 'today', tomorrow: 'tomorrow', overdue: 'past' },
  /** Days, for the staleness line. */
  days: (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`,
  /** The date controls on the card. */
  dateSet: (label: string, date: string): string => `${label} ${date}`,
  dateClear: 'Clear',
  dateClearLabel: (noun: string, title: string): string => `Clear ${noun} on ${title}`,
  /** Appended to the control's own visible words, so what a screen reader
   * announces CONTAINS what a sighted person reads (WCAG label in name). */
  dateFor: (title: string): string => ` for ${title}`,
  dateSaved: 'Date set.',
  dateFailed: 'That date did not save. Try again.',
  /**
   * Said under the today line, once. The board can only tell you this when you
   * open it — we never email, and nothing here runs on your phone (P8, rule 6).
   */
  onlyHere: 'This is here when you open the board — nothing is sent to you.',
} as const;

/**
 * WHEN A CHANGE IS NEWS (P6). A tenth of a point is noise; crossing from green
 * to amber is news. Two rules, both editable here and nowhere else:
 *  - crossing a verdict band (green ≥8 / amber ≥6 / walk away below 6) always
 *    announces, because the ANSWER changed, not just the number;
 *  - inside one band, a move of at least `minPoints` announces. A band is two
 *    points wide, so a full point is half a band — enough that the deal is
 *    materially different, while anything smaller sits inside the slack of
 *    assumptions nobody set to the decimal.
 * A change that clears neither rule updates the score quietly.
 */
export const CHANGE_RULES = {
  onBandChange: true,
  minPoints: 1,
} as const;

/**
 * THE CHANGE LINE (P6). Exempt from the two-sentence copy rule by rule 7:
 * naming the binding number IS the plain-English win, and this line is a Deal
 * Score line. Every part is its own string, so any word can be changed here.
 *
 * It reads: "This was 9.4. The builder's quote £48,000 — you'd put £30,000 —
 * moves it down to 6.8." followed by the engine's OWN verdict line, which
 * carries the consequence and the fix.
 */
export const CHANGE_COPY = {
  heading: 'The answer changed',
  /** What the deal scored before this fact landed. */
  was: (score: string): string => `This was ${score}.`,
  /** The fact replaced a number the person had assumed. */
  movesReplaced: (fact: string, value: string, previous: string, direction: string, score: string): string =>
    `The ${fact} ${value} — you’d put ${previous} — moves it ${direction} to ${score}.`,
  /** The fact added a cost, so there is no earlier figure to name. */
  movesAdded: (fact: string, value: string, direction: string, score: string): string =>
    `The ${fact} ${value} moves it ${direction} to ${score}.`,
  /** Which way it went. Good news reads as good news. */
  direction: { down: 'down', up: 'up' },
  /** Said when the deal has fallen below where the score says walk away. */
  /** Which park reason a killed deal is offered with. A KEY, so the label can be
   * reworded above without touching this. */
  killReasonKey: 'numbers-fail',
  killOffer: 'That is below where you walk away.',
  killPark: 'Park it',
  /** Never park anything without a tap: this is the confirmation, not the act. */
  killParkLabel: (title: string): string => `Park ${title}`,
  dismiss: 'Got it',
  dismissLabel: (title: string): string => `Dismiss the change on ${title}`,
  /** The score history, opened from the deal — never sitting open on the card. */
  historyOpen: 'Score history',
  historyClose: 'Hide score history',
  historyLabel: (title: string): string => `Score history for ${title}`,
  historyPoint: (score: string, date: string): string => `${score} on ${date}`,
  /** The score it holds today — no date, because it is the one you are looking at. */
  historyNow: (score: string): string => `${score} now`,
  historyEmpty: 'No history yet.',
} as const;

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
    retrade: (value: string): string => `The survey has come back with ${value} of work I hadn’t allowed for.`,
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
    retrade: (value: string): string => `The valuation has come back at ${value}, below what I based my offer on.`,
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
    /**
     * P7: the rent stops being a guess the moment someone agrees one. Without
     * this the Rent evidence chip could never be filled, and a chip that can
     * never be filled should not exist (see CHIPS_BY_STRATEGY in the core).
     */
    key: 'rent-agreed',
    label: 'Rent agreed',
    kind: 'number',
    numberLabel: 'The agreed rent (£ a month)',
    hint: 'The real number replaces your estimate.',
    applies: {
      btl: { param: 'rent', mode: 'replace', shownAs: 'Monthly rent' },
      brrrr: { param: 'rent', mode: 'replace', shownAs: 'Rent after works' },
      hmo: { param: 'roomRent', mode: 'replace', shownAs: 'Average rent per room' },
    },
    noEffect: 'A flip is sold, not let, so a rent does not change the deal maths.',
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
    /** A fact already inside the deal's own numbers: kept as the record, not removable. */
    factFolded: 'in the numbers',
    /** The board holds a WINDOW of the lists kept for ever (bought, killed);
     *  this asks for the next one. The counts beside them are always the true
     *  totals, counted in the database (P11). */
    more: 'Show more',
    moreLoading: 'Loading…',
    moreFailed: 'Couldn’t load more. Try again.',
    /** Said back after a successful move or park — the card jumps columns, so
     *  without this nothing confirmed anything happened (D1). */
    moved: (stage: string): string => `Moved to ${stage}.`,
    parked: (reason: string): string => `Parked — ${reason}.`,
    moveFailed: 'That didn’t move — put back. Try again.',
    parkFailed: 'That didn’t save — put back. Try again.',
  },
} as const;


/**
 * THE GRAVEYARD (P9) — deals you killed.
 *
 * A dead deal is not a failure, it is filtering that worked, and the graveyard
 * is where that is said out loud. Two numbers decide when it stops being a
 * museum and offers an answer, and both live here:
 *  - `patternMin`  how many dead deals must share ONE reason before a pattern
 *                  is worth saying. Five, because four is a run of bad luck and
 *                  three is a coincidence. Below it the graveyard says so.
 *  - `patternWindow` the sample the line is drawn from: your last N deaths, so
 *                  a pattern you fixed a year ago stops shouting.
 * The line ALWAYS states its sample. A pattern without one is a guess.
 */
export const GRAVEYARD = {
  patternMin: 5,
  patternWindow: 20,
} as const;

/**
 * The graveyard's own words. Never "failed", never "lost": a killed deal is a
 * filter that worked, and the copy says that plainly without being cute.
 * "Changed my mind" is a legitimate reason and is never judged here.
 */
export const GRAVEYARD_COPY = {
  /** The toggle on the board. It never sits open. */
  open: 'Deals you killed',
  lead: 'This is the money you didn’t lose.',
  empty: 'Nothing here yet. Most deals should die — that is the filter working.',
  /** The headstone: what it scored when it died, and when that was. */
  killed: (date: string): string => `Killed ${date}`,
  reached: (stage: string): string => `Reached ${stage}`,
  scoreLabel: (score: string): string => `Deal score ${score} when it died`,
  /** A death recorded before the card was kept — said, never papered over. */
  noSnapshot: 'The card it died on was not kept.',
  factsHeading: 'What it had learned',
  /** The sample, always. Then what it might mean, where the reason has a lesson. */
  pattern: (count: number, total: number, diedOn: string): string =>
    `${count} of your last ${total} dead deals died on ${diedOn}.`,
  /** Said instead. "Your last N" is true whether or not there are more behind
   * them, which "N so far" would not be once the window fills up. */
  noPattern: (total: number): string =>
    total === 1 ? 'One dead deal is not a pattern yet.' : `Your last ${total} dead deals show no pattern yet.`,
  /** Sellers come back and chains re-form, so nothing here is final. */
  revive: 'Bring it back',
  /** Appended to the button's own visible words, so what a screen reader
   * announces CONTAINS what a sighted person reads (WCAG label in name). */
  reviveFor: (title: string): string => ` — ${title}`,
  revived: (stage: string): string => `Back on the board at ${stage}.`,
  reviveFailed: 'That didn’t come back. Try again.',
  /** The capture: one chip, and a note only if you want one. */
  noteLabel: 'Note (optional)',
} as const;

/**
 * THE CALENDAR EXPORT (P10). A long-horizon date belongs in the calendar you
 * already check, not in a tool you might not open. We hand over a .ics file and
 * their calendar takes it from there — which is exactly what the copy says: the
 * event is ours, the reminder is theirs.
 *
 * Every word is here. The file itself is built in src/lib/deals/ics.ts, which
 * writes RFC 5545 and no prose.
 */
export const CALENDAR = {
  add: 'Add to calendar',
  /** Appended for a screen reader, so the announced name contains the visible
   * words (WCAG label in name). */
  addFor: (title: string): string => ` — ${title}`,
  /** The honest limit, said once, beside the button. */
  note: 'Your calendar app decides whether it reminds you.',
  /** The browser never tells us whether the file landed, so this says where to
   * look rather than claiming a save happened (P10 review). */
  saved: 'Look in your downloads for the file.',
  failed: 'That file did not build. Try again.',
  /** The event title: "Viewing — Terraced · CF37 1HR · £120,000". */
  summary: (event: string, title: string): string => `${event} — ${title}`,
  /** Inside the event: how to get back to the deal. */
  openDeal: (url: string): string => `Open the deal: ${url}`,
  /**
   * The auction line. It says whose figures they are, because they are yours —
   * this is your own analysis, not a quote from anybody.
   */
  cash: (money: string): string => `Cash needed on your figures: ${money}.`,
  feesIn: 'Auction fees are in this number.',
  feesOut: 'Auction fees are not in this number yet.',
  /** Who wrote the file (RFC 5545 PRODID). Takes the product's name rather than
   * spelling it, so renaming the product never touches this (golden rule 4). */
  prodId: (siteName: string): string => `-//${siteName}//Deal dates//EN`,
} as const;

/**
 * How long before the event the file asks for a reminder, as an RFC 5545
 * duration. These are ALL-DAY events, so the trigger counts back from midnight:
 * 15 hours lands at 9am the day before — the same place Google's own "1 day
 * before" default lands, and not a midnight alert (P10 review). Whether it fires
 * at all is the calendar app's decision, never ours — see CALENDAR.note.
 */
export const CALENDAR_ALARM = '-PT15H';

/**
 * The fact that tells an auction event its fees are already inside the cash
 * figure. A stable KEY, so relabelling the fact type never changes what the
 * calendar says (P10).
 */
export const AUCTION_FEES_FACT = 'auction-fees';

/**
 * ACCEPTED IS NOT SAFE (P11) — the chain-risk card.
 *
 * Our own stage names imply that an accepted offer is the home straight. It is
 * the opposite: it is where deals die. This says so once, on the deal, when it
 * reaches that stage — and then goes away.
 *
 * THE RULE FOR THIS COPY: approximate figures, described as approximate, about
 * the MARKET and never about this deal. No scaremongering, no false precision,
 * and no percentage we cannot stand behind. Reword freely; keep it honest.
 */
/**
 * WHERE THE AUCTION LEGAL-PACK WARNING SHOWS (P4; a knob since P11). An auction
 * deal carries an unmissable warning at exactly one stage — the moment before
 * you are committed. A stage KEY, so renaming the stage's label is safe.
 */
export const AUCTION_WARNING_STAGE = 'offer-in';

export const CHAIN_RISK = {
  /** Where it appears — a stable stage KEY, so renaming the stage's label is safe. */
  stage: 'offer-accepted',
  heading: 'Accepted is not safe',
  lead: 'About four in ten agreed sales never complete. You are not safe until exchange.',
  window: 'Of the sales that collapse, nearly two in five go in the first four weeks.',
  causesLead: 'What kills deals here:',
  /** In rough order of how often they do it. */
  causes: ['A survey finding', 'A down-valuation', 'Lending falling through', 'A chain breaking'],
  /** Where the figures come from, and how firm they are. Put a source here when
   * you have one you are happy to stand behind. */
  source: 'Widely reported industry estimates for England and Wales. Not our own data, and not a forecast for this deal.',
  dismiss: 'Got it',
  /** Appended for a screen reader, so the announced name contains the visible
   * words (WCAG label in name). */
  dismissFor: (title: string): string => ` — ${title}`,
} as const;

/**
 * THE RE-TRADE RADAR (P11).
 *
 * A survey finding or a down-valuation is the moment a price stops being the
 * price. The radar answers the only question that matters — what is this worth
 * to me NOW — with the reverse solve from @gil-bricks/core, and hands you words
 * you can paste into an email. It copies; it never sends. Nothing in this
 * product sends anything to anybody.
 *
 * It appears ONLY when the fact really moved the deal and a lower price really
 * would fix it. A negotiation is never manufactured.
 */
export const RETRADE = {
  /** Which facts open it — stable FACT_TYPES keys. Add one and it opens for that. */
  facts: ['down-valuation', 'survey-finding'] as readonly string[],
  /**
   * What a new offer aims at: the band the deal held BEFORE the fact landed, so
   * you are asking to be put back where you were. When it was already below the
   * bar, it aims at this instead — the lowest band the score still calls a deal.
   */
  floorTarget: 'marginal' as 'good' | 'marginal',
  heading: 'What it is worth now',
  max: (money: string): string => `Your new maximum is ${money}.`,
  /** When no price fixes it. The honest answer, and never a message to send. */
  none: 'No price makes this work now.',
  copy: 'Copy the message',
  copied: 'Copied.',
  copyFailed: 'That didn’t copy. Select the words and copy them.',
  /** Said beside the button, because it is the whole point: this is your email,
   * not ours. */
  sendNothing: 'Nothing is sent. This only copies.',
  /**
   * THE MESSAGE, for pasting to an agent. Exempt from the two-sentence copy rule
   * by rule 7 — it is a lever line, it names the binding numbers, and it is an
   * email rather than a block of page furniture. Reword it in your own voice;
   * the three figures are filled in for you.
   */
  message: (opener: string, price: string, max: string): string =>
    `${opener} At ${price} the numbers no longer work for me. I can still proceed at ${max}.`,
} as const;
