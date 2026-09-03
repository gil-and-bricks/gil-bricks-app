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
}

/**
 * The seven ordered stages of a living deal, worth-a-look → bought-it. The first
 * six are `live`; `bought-it` is the successful terminal (`done`).
 */
export const PROGRESS_STAGES: readonly Stage[] = [
  { key: 'worth-a-look', label: 'Worth a look', blurb: 'A deal you’ve sent over that looks worth checking.' },
  { key: 'going-to-view', label: 'Going to view', blurb: 'You’re booked in or planning to see it.' },
  { key: 'getting-real-numbers', label: 'Getting real numbers', blurb: 'Chasing the figures that firm up the estimate — rent, refurb, quotes.' },
  { key: 'offer-in', label: 'Offer in', blurb: 'You’ve made an offer and are waiting.' },
  { key: 'offer-accepted', label: 'Offer accepted', blurb: 'Offer agreed — into the legal and survey work.' },
  { key: 'nearly-there', label: 'Nearly there', blurb: 'Exchange in sight — final checks landing.' },
  { key: 'bought-it', label: 'Bought it', blurb: 'Completed. The deal is done.' },
] as const;

/** The dead terminal stage (status `dead`). Kept out of the ordered list. */
export const DEAD_STAGE: Stage = {
  key: 'parked-dead',
  label: 'Parked / dead',
  blurb: 'Not proceeding — kept as memory of why it didn’t work.',
};

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
  'You’ve got 100 live deals. Kill the ones that are dead — that frees a slot, and the reason gets remembered.';

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
}
export const FACT_TYPES: readonly FactType[] = [
  { key: 'builder-quote', label: 'Builder’s quote' },
  { key: 'survey-finding', label: 'Survey finding' },
  { key: 'down-valuation', label: 'Down-valuation' },
  { key: 'covenant', label: 'Covenant' },
  { key: 'short-lease', label: 'Short lease' },
  { key: 'service-charge', label: 'Service charge' },
  { key: 'ground-rent', label: 'Ground rent' },
  { key: 'auction-fees', label: 'Auction fees' },
] as const;
export const FACT_TYPE_KEYS: readonly string[] = FACT_TYPES.map((f) => f.key);
export function isFactType(key: string): boolean {
  return FACT_TYPE_KEYS.includes(key);
}
