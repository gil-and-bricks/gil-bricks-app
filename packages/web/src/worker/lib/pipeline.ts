/**
 * Deal-pipeline data access (P1). Typed read/write helpers over D1, in the same
 * style as the rest of this Worker: env.DB.prepare(sql).bind(...).run()/first()/all(),
 * crypto.randomUUID() ids, ISO-8601 timestamps. NO scoring happens here — a score
 * is always computed by the caller with @gil-bricks/core and passed in; these
 * helpers only persist and read. Stage/fact keys are validated against config.
 */
import { scoreFromParams } from '../../lib/deals/scoreFromParams';
import { applyFacts, factMoves, type DealFact } from '../../lib/deals/facts';
import { features } from '../../config/features';
import { INITIAL_STAGE, isFactType, isStage, statusForStage, DEAD_STAGE, PARK_REASONS, PROGRESS_STAGES } from '../../config/pipeline';

/**
 * A deal can ONLY be born from an analysed listing (P2 boundary — enforced by
 * construction). `AnalyserDealPayload` is a BRANDED type: the only way to make
 * one is `parseAnalyserDeal`, which requires a real analyser payload (a valid
 * strategy and the analyser's url params). No manual "add a property" data can
 * satisfy it, so no reachable code path can create a deal without an analyser
 * payload. Keep it that way — see CLAUDE.md.
 */
declare const analyserBrand: unique symbol;
export interface AnalyserDealPayload {
  readonly [analyserBrand]: 'analyser';
  strategy: string;
  title: string;
  urlParams: string;
  keyFigure: string;
  /** The 0-10 Deal Score at save time (from @gil-bricks/core), or null if not scored. */
  score: number | null;
  /** The personal criteria the score was judged against (thresholds + assumptions). */
  criteriaJson: string;
  /** Which inputs were from the listing / EPC / estimated / typed (E11 provenance). */
  evidenceJson: string;
  /** The ONE strategy-appropriate figure the board card shows (P3) — the analyser's
   * own display string (BTL cashflow / BRRRR money-left-in / Flip profit / HMO ROI). */
  headlineFigure: string;
  /** The analyser's verdict line at save time (DealScore.headline) — the card's reason. */
  verdictLine: string;
  /** The listing was an auction (P4) — surfaces the legal-pack warning at Offer in.
   * Sticky once true: a later re-save never un-flags it. */
  isAuction: boolean;
  /** Honest arrival source: the deal came from the extension or the analyser page. */
  source: 'extension' | 'analyser';
  /**
   * The sold-price band the score was judged against (P5.1), as JSON:
   * '{"estimate":n,"high":n}', or the string 'null' when the analyser had no
   * valuation. Stored so a later re-score uses the SAME evidence — never a
   * silently different one. See migrations/0012.
   */
  soldEvidence: string;
  /**
   * HMO only: how many rooms failed the statutory minimum at save time, or null
   * when they were never measured. Lives in the analyser page, never in the URL,
   * so a browser re-score cannot know it unless we keep it (P6 review).
   */
  roomSizeFailures: number | null;
}

const isJson = (s: unknown): s is string => {
  if (typeof s !== 'string') return false;
  try { JSON.parse(s); return true; } catch { return false; }
};

/**
 * The SOLE constructor of an AnalyserDealPayload. Validates that the body is a
 * genuine analyser save (valid strategy, non-empty url params). Returns null for
 * anything that isn't — so the save endpoint cannot create a deal from a
 * hand-authored / manual-entry body.
 */
/**
 * The band, or the string 'null' when there was none. Anything malformed is
 * treated as 'no evidence' rather than trusted — a wrong band would move a score
 * for a reason nobody could see.
 */
export function parseSoldEvidence(raw: unknown): string {
  if (typeof raw !== 'string') return 'null';
  try {
    const v = JSON.parse(raw) as { estimate?: unknown; high?: unknown } | null;
    if (v === null) return 'null';
    const estimate = Number(v.estimate);
    const high = Number(v.high);
    if (!Number.isFinite(estimate) || !Number.isFinite(high) || estimate <= 0 || high <= 0) return 'null';
    return JSON.stringify({ estimate, high });
  } catch {
    return 'null';
  }
}

export function parseAnalyserDeal(body: unknown, isDealStrategy: (s: string) => boolean): AnalyserDealPayload | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const strategy = String(b.strategy ?? '');
  const title = String(b.title ?? '').slice(0, 120).trim();
  const urlParams = String(b.url_params ?? '').slice(0, 2000);
  if (!isDealStrategy(strategy) || title === '' || urlParams === '') return null;
  const rawScore = b.score;
  const score = typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : null;
  const source: 'extension' | 'analyser' = b.source === 'extension' ? 'extension' : 'analyser';
  return {
    strategy, title, urlParams,
    keyFigure: String(b.key_figure ?? '').slice(0, 80).trim(),
    score,
    criteriaJson: isJson(b.criteria_json) ? (b.criteria_json as string) : '{}',
    evidenceJson: isJson(b.evidence_json) ? (b.evidence_json as string) : '{}',
    headlineFigure: String(b.headline_figure ?? '').slice(0, 60).trim(),
    verdictLine: String(b.verdict_line ?? '').slice(0, 160).trim(),
    isAuction: b.is_auction === true,
    source,
    soldEvidence: parseSoldEvidence(b.sold_evidence),
    roomSizeFailures: typeof b.room_size_failures === 'number' && Number.isFinite(b.room_size_failures) && b.room_size_failures >= 0
      ? Math.round(b.room_size_failures) : null,
  } as AnalyserDealPayload;
}

/**
 * The 100-deal cap now applies to LIVE deals only — dead and done deals are the
 * valuable memory, not clutter, and never count against it.
 */
export const MAX_LIVE_DEALS = 100;
export function canAddLiveDeal(currentLiveCount: number): boolean {
  return currentLiveCount < MAX_LIVE_DEALS;
}

export interface DealRow {
  id: string;
  user_id: string;
  strategy: string;
  title: string;
  postcode_sector: string;
  stage: string;
  current_score: number | null;
  headline_figure: string | null;
  is_auction: number;
  verdict_line: string | null;
  status: string;
  dead_reason: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}
/**
 * Saving from the analyser makes the numbers ON SCREEN the deal's own — and that
 * page was opened with the deal's facts already applied, so those corrections are
 * now IN the saved numbers. Applying them again would count an added cost twice.
 *
 * They are MARKED folded, never deleted (P6 review): the deal still lists them,
 * with the note the person typed, and `applyFacts` stops applying them. A fact
 * that changes no input — a covenant, a short lease, a cost this strategy cannot
 * use — was never folded into anything, so it is left alone.
 *
 * Returns the statements to run, so the fold lands in the SAME batch as the
 * numbers it belongs to.
 */
export async function foldFactsIntoParams(
  db: D1Database, dealId: string, strategy: string, upTo?: string,
): Promise<D1PreparedStatement[]> {
  const rows = await db
    .prepare('SELECT id, fact_type, entered_at FROM deal_facts WHERE deal_id = ? AND folded_at IS NULL')
    .bind(dealId)
    .all<{ id: string; fact_type: string; entered_at: string }>();
  // Only the facts that were ON THE PAGE. A fact entered after it was opened —
  // in another tab — was never in these numbers and must keep applying.
  const folded = rows.results
    .filter((r) => factMoves(r.fact_type, strategy))
    .filter((r) => upTo === undefined || r.entered_at <= upTo)
    .map((r) => r.id);
  if (folded.length === 0) return [];
  const marks = folded.map(() => '?').join(',');
  return [
    db.prepare(`UPDATE deal_facts SET folded_at = ? WHERE deal_id = ? AND id IN (${marks})`)
      .bind(new Date().toISOString(), dealId, ...folded),
  ];
}

/**
 * A verdict CHANGE worth telling someone about (P6). Stored in the same batch as
 * the fact that caused it, so a card can never announce something the database
 * does not hold — and so the announcement survives the tab being closed.
 */
export interface ChangeRow {
  id: string;
  deal_id: string;
  fact_type: string;
  fact_value: number | null;
  previous_value: number | null;
  from_score: number;
  to_score: number;
  to_verdict_line: string;
  at: string;
  acknowledged_at: string | null;
}

/** What the browser sends when a re-score crossed a threshold. */
export interface FactChange {
  fromScore: number;
  toScore: number;
  previousValue: number | null;
  toVerdictLine: string;
}

/** Every unacknowledged-or-recent change on a user's deals, newest first. */
export async function listChanges(db: D1Database, userId: string): Promise<ChangeRow[]> {
  const rows = await db
    .prepare(
      `SELECT c.id, c.deal_id, c.fact_type, c.fact_value, c.previous_value, c.from_score,
              c.to_score, c.to_verdict_line, c.at, c.acknowledged_at
         FROM deal_changes c JOIN deals d ON d.id = c.deal_id
        WHERE d.user_id = ? AND c.acknowledged_at IS NULL
        ORDER BY c.at DESC`,
    )
    .bind(userId)
    .all<ChangeRow>();
  return rows.results;
}

/** Mark one change seen. Ownership is enforced through the deal. */
export async function ackChange(db: D1Database, userId: string, dealId: string, changeId: string): Promise<boolean> {
  const owned = await getOwnedDeal(db, userId, dealId);
  if (!owned) return false;
  const res = await db
    .prepare('UPDATE deal_changes SET acknowledged_at = ? WHERE id = ? AND deal_id = ? AND acknowledged_at IS NULL')
    .bind(new Date().toISOString(), changeId, dealId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/** The score at each evidence step, oldest first — the sparkline's own data. */
export async function scoreHistory(db: D1Database, userId: string, dealId: string): Promise<{ score: number; at: string }[]> {
  const owned = await getOwnedDeal(db, userId, dealId);
  if (!owned) return [];
  const rows = await db
    .prepare('SELECT score, at FROM deal_verdicts WHERE deal_id = ? AND score IS NOT NULL ORDER BY at, rowid')
    .bind(dealId)
    .all<{ score: number; at: string }>();
  return rows.results;
}

export interface FactRow { id: string; deal_id: string; fact_type: string; value_json: string; entered_at: string }
export interface VerdictRow { id: string; deal_id: string; score: number | null; criteria_json: string; evidence_json: string; at: string }
export interface StageHistoryRow { id: string; deal_id: string; from_stage: string | null; to_stage: string; at: string }

/** How many LIVE deals this user has (the only ones that count toward the cap). */
export async function countLiveDeals(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM deals WHERE user_id = ? AND status = 'live'")
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** A user's LIVE deals, oldest-touched first (staleness) — uses the covering index. */
export async function listLiveDealsByStaleness(db: D1Database, userId: string): Promise<DealRow[]> {
  const rows = await db.prepare("SELECT * FROM deals WHERE user_id = ? AND status = 'live' ORDER BY updated_at ASC")
    .bind(userId)
    .all<DealRow>();
  return rows.results;
}

/** All deals for a user (any status) — dead/done are kept memory. */
export async function listAllDeals(db: D1Database, userId: string): Promise<DealRow[]> {
  const rows = await db.prepare('SELECT * FROM deals WHERE user_id = ? ORDER BY updated_at DESC')
    .bind(userId)
    .all<DealRow>();
  return rows.results;
}

/** One deal owned by this user, or null. Ownership is enforced in the WHERE. */
export async function getOwnedDeal(db: D1Database, userId: string, dealId: string): Promise<DealRow | null> {
  return db.prepare('SELECT * FROM deals WHERE id = ? AND user_id = ?').bind(dealId, userId).first<DealRow>();
}

/** A deal's facts, in the order they arrived. */
export async function dealFacts(db: D1Database, dealId: string): Promise<FactRow[]> {
  const rows = await db.prepare('SELECT * FROM deal_facts WHERE deal_id = ? ORDER BY entered_at ASC')
    .bind(dealId).all<FactRow>();
  return rows.results;
}

/** A deal's verdict snapshots, in time order (its scoring history). */
export async function dealVerdicts(db: D1Database, dealId: string): Promise<VerdictRow[]> {
  const rows = await db.prepare('SELECT * FROM deal_verdicts WHERE deal_id = ? ORDER BY at ASC')
    .bind(dealId).all<VerdictRow>();
  return rows.results;
}

/** A deal's stage moves, in time order. */
export async function stageHistory(db: D1Database, dealId: string): Promise<StageHistoryRow[]> {
  const rows = await db.prepare('SELECT * FROM deal_stage_history WHERE deal_id = ? ORDER BY at ASC')
    .bind(dealId).all<StageHistoryRow>();
  return rows.results;
}

/** Record a fact that has arrived, and touch the deal so it sorts as fresh. */
/**
 * The re-score that travels WITH a fact (P5). The fact and the score it produces
 * are written in ONE batch, so the card can never show a score the database does
 * not have, and a fact can never exist without the snapshot it caused.
 */
export interface FactVerdict {
  score: number;
  verdictLine: string;
  headlineFigure: string;
  criteriaJson: string;
  evidenceJson: string;
}

/** The statements that apply a re-score: the deal's own row, then its history. */
function verdictStatements(db: D1Database, dealId: string, v: FactVerdict, at: string): D1PreparedStatement[] {
  return [
    db.prepare('UPDATE deals SET current_score = ?, verdict_line = ?, headline_figure = ?, updated_at = ? WHERE id = ?')
      .bind(v.score, v.verdictLine, v.headlineFigure, at, dealId),
    db.prepare('INSERT INTO deal_verdicts (id, deal_id, score, criteria_json, evidence_json, at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), dealId, v.score, v.criteriaJson, v.evidenceJson, at),
  ];
}

export async function recordFact(
  db: D1Database, dealId: string, factType: string, valueJson: string, verdict?: FactVerdict,
  change?: { id: string; value: number | null; change: FactChange },
): Promise<string> {
  if (!isFactType(factType)) throw new Error(`unknown fact type: ${factType}`);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare('INSERT INTO deal_facts (id, deal_id, fact_type, value_json, entered_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, dealId, factType, valueJson, now),
    db.prepare('UPDATE deals SET updated_at = ? WHERE id = ?').bind(now, dealId),
    ...(verdict ? verdictStatements(db, dealId, verdict, now) : []),
    ...(change
      ? [db.prepare('INSERT INTO deal_changes (id, deal_id, fact_type, fact_value, previous_value, from_score, to_score, to_verdict_line, at, acknowledged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)')
        .bind(change.id, dealId, factType, change.value, change.change.previousValue, change.change.fromScore, change.change.toScore, change.change.toVerdictLine, now)]
      : []),
  ]);
  return id;
}

export interface FactRow {
  id: string;
  deal_id: string;
  fact_type: string;
  value_json: string;
  entered_at: string;
  /** Set when the fact was folded into the deal's own numbers (P6). */
  folded_at: string | null;
}

/** Every fact on a user's deals, oldest first — the board applies them itself. */
export async function listFacts(db: D1Database, userId: string): Promise<FactRow[]> {
  const rows = await db
    .prepare(
      `SELECT f.id, f.deal_id, f.fact_type, f.value_json, f.entered_at, f.folded_at
         FROM deal_facts f JOIN deals d ON d.id = f.deal_id
        WHERE d.user_id = ? ORDER BY f.entered_at`,
    )
    .bind(userId)
    .all<FactRow>();
  return rows.results;
}

/** Delete one fact the person entered wrongly. Ownership is checked by join. */
export async function deleteFact(
  db: D1Database, userId: string, dealId: string, factId: string, verdict?: FactVerdict,
): Promise<boolean> {
  const owned = await getOwnedDeal(db, userId, dealId);
  if (!owned) return false;
  const res = await db.prepare('DELETE FROM deal_facts WHERE id = ? AND deal_id = ?').bind(factId, dealId).run();
  if ((res.meta?.changes ?? 0) === 0) return false;
  const now = new Date().toISOString();
  // The score goes back in the SAME batch the fact leaves in.
  await db.batch([
    db.prepare('UPDATE deals SET updated_at = ? WHERE id = ?').bind(now, dealId),
    ...(verdict ? verdictStatements(db, dealId, verdict, now) : []),
  ]);
  return true;
}

/**
 * Record a re-scored verdict (the spine of the feature): snapshot the new score,
 * the criteria it was judged against and the evidence, and update the deal's
 * current_score. The caller computes the score with @gil-bricks/core.
 */
export async function recordVerdict(
  db: D1Database,
  dealId: string,
  v: { score: number | null; criteriaJson: string; evidenceJson: string },
): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT INTO deal_verdicts (id, deal_id, score, criteria_json, evidence_json, at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), dealId, v.score, v.criteriaJson, v.evidenceJson, now),
    db.prepare('UPDATE deals SET current_score = ?, updated_at = ? WHERE id = ?').bind(v.score, now, dealId),
  ]);
}

/**
 * Move a deal to a new stage: append stage-history and update the deal's stage +
 * status (bought-it ⇒ done, parked-dead ⇒ dead, else live). Stage is validated.
 */
export async function moveStage(db: D1Database, dealId: string, fromStage: string, toStage: string): Promise<void> {
  if (!isStage(toStage)) throw new Error(`unknown stage: ${toStage}`);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT INTO deal_stage_history (id, deal_id, from_stage, to_stage, at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), dealId, fromStage, toStage, now),
    db.prepare('UPDATE deals SET stage = ?, status = ?, updated_at = ? WHERE id = ?')
      .bind(toStage, statusForStage(toStage), now, dealId),
  ]);
}

/** Park a deal as dead, keeping the reason as memory. */
export async function markDead(db: D1Database, dealId: string, fromStage: string, reason: string): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT INTO deal_stage_history (id, deal_id, from_stage, to_stage, at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), dealId, fromStage, DEAD_STAGE.key, now),
    db.prepare("UPDATE deals SET stage = ?, status = 'dead', dead_reason = ?, updated_at = ? WHERE id = ?")
      .bind(DEAD_STAGE.key, reason, now, dealId),
  ]);
}

/**
 * Delete a deal and all its rows for an owner. Children are removed explicitly in
 * one batch (belt-and-braces alongside the ON DELETE CASCADE), so deleting a deal
 * never orphans facts, verdicts or history. Ownership is enforced in the WHERE.
 */
export async function deleteDeal(db: D1Database, userId: string, dealId: string): Promise<boolean> {
  const owned = await getOwnedDeal(db, userId, dealId);
  if (!owned) return false;
  await db.batch([
    db.prepare('DELETE FROM deal_facts WHERE deal_id = ?').bind(dealId),
    db.prepare('DELETE FROM deal_verdicts WHERE deal_id = ?').bind(dealId),
    db.prepare('DELETE FROM deal_stage_history WHERE deal_id = ?').bind(dealId),
    db.prepare('DELETE FROM deals WHERE id = ? AND user_id = ?').bind(dealId, userId),
  ]);
  return true;
}

/**
 * Idempotent save from an analyser payload — the ONLY origination path (P2).
 * The deal id is the stable saved_deals id for (user, strategy, url_params), so:
 *  - same property + same strategy ⇒ same deal: KEEP its stage/status/history,
 *    refresh current_score + title, and append a NEW verdict snapshot;
 *  - same property + a DIFFERENT strategy ⇒ a different id ⇒ a separate deal;
 *  - a brand-new deal ⇒ enforce the LIVE-deal cap, then create the deal, its
 *    opening stage-history entry and its first verdict snapshot.
 * Re-saving NEVER resets a progressed deal back to worth-a-look. `payload` is the
 * branded analyser type, so this cannot be called with manual-entry data.
 */
/**
 * Backfill a deal's SCORE only (P4.2) — used when an already-saved deal had no
 * stored score (a migrated deal) and the analyser has now computed one on open.
 * Targets the deal BY ID (never re-derives its url_params, so it can never create a
 * duplicate), touches only the verdict fields, and leaves stage/status/history and
 * updated_at (hence ordering + ageing) alone. Returns false if not owned.
 */
export async function setDealScore(
  db: D1Database,
  userId: string,
  dealId: string,
  score: number,
  verdictLine: string,
  headlineFigure: string,
): Promise<boolean> {
  const owned = await getOwnedDeal(db, userId, dealId);
  if (!owned) return false;
  await db.prepare('UPDATE deals SET current_score = ?, verdict_line = ?, headline_figure = ? WHERE id = ? AND user_id = ?')
    .bind(score, verdictLine, headlineFigure, dealId, userId)
    .run();
  return true;
}

export async function upsertPipelineDeal(
  db: D1Database,
  ctx: { id: string; userId: string; postcodeSector: string },
  payload: AnalyserDealPayload,
): Promise<'created' | 'updated' | 'at-cap'> {
  const now = new Date().toISOString();
  const existing = await getOwnedDeal(db, ctx.userId, ctx.id);
  if (existing) {
    // Re-save: keep stage, status, dead_reason and all history untouched.
    await db.batch([
      // is_auction is STICKY: MAX keeps a once-true flag true across re-saves (a
      // re-opened deal's url no longer carries the auction marker, so the payload
      // would otherwise reset it to 0).
      // A save with NOTHING COMPUTED (no comparables, incomplete inputs) updates
      // the title and nothing else. It must never blank a score, a verdict line
      // or the evidence a real analysis left behind (P6 review).
      payload.score === null
        ? db.prepare('UPDATE deals SET title = ?, is_auction = MAX(is_auction, ?), updated_at = ? WHERE id = ? AND user_id = ?')
          .bind(payload.title, payload.isAuction ? 1 : 0, now, ctx.id, ctx.userId)
        : db.prepare('UPDATE deals SET current_score = ?, title = ?, headline_figure = ?, verdict_line = ?, is_auction = MAX(is_auction, ?), sold_evidence = ?, room_size_failures = ?, updated_at = ? WHERE id = ? AND user_id = ?')
          .bind(payload.score, payload.title, payload.headlineFigure, payload.verdictLine, payload.isAuction ? 1 : 0, payload.soldEvidence, payload.roomSizeFailures, now, ctx.id, ctx.userId),
      db.prepare('INSERT INTO deal_verdicts (id, deal_id, score, criteria_json, evidence_json, at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), ctx.id, payload.score, payload.criteriaJson, payload.evidenceJson, now),
    ]);
    return 'updated';
  }
  if (!canAddLiveDeal(await countLiveDeals(db, ctx.userId))) return 'at-cap';
  await db.batch([
    db.prepare('INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, current_score, headline_figure, verdict_line, is_auction, status, dead_reason, source, sold_evidence, room_size_failures, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)')
      .bind(ctx.id, ctx.userId, payload.strategy, payload.title, ctx.postcodeSector, INITIAL_STAGE, payload.score, payload.headlineFigure, payload.verdictLine, payload.isAuction ? 1 : 0, 'live', payload.source, payload.soldEvidence, payload.roomSizeFailures, now, now),
    db.prepare('INSERT INTO deal_stage_history (id, deal_id, from_stage, to_stage, at) VALUES (?, ?, NULL, ?, ?)')
      .bind(crypto.randomUUID(), ctx.id, INITIAL_STAGE, now),
    db.prepare('INSERT INTO deal_verdicts (id, deal_id, score, criteria_json, evidence_json, at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), ctx.id, payload.score, payload.criteriaJson, payload.evidenceJson, now),
  ]);
  return 'created';
}

/**
 * DEV/TEST SEED ONLY — never a production origination path (the dev seed route that
 * calls this is inert in production; see worker/dev.ts). Co-located here so the
 * "only pipeline.ts inserts a deal" guardrail stays true. Wipes any existing seed
 * set for the user first (idempotent), then inserts a realistic spread across every
 * stage, strategy, verdict colour and age, incl. one auction at Offer in. Returns
 * the number of deals created.
 */
interface SeedSpec {
  strategy: string; title: string; sector: string; stage: string; status: string;
  ageDays: number; params: string;
  /** Auction listings carry their own warning on the board. */
  auction?: boolean;
  /** Park reason, for the one dead deal. */
  dead?: string;
  /**
   * Facts that arrived after the deal was born (P5). The seed applies them the
   * way the board does, so a seeded card shows the fact-corrected score — test
   * data that lies costs hours later.
   */
  facts?: readonly { type: string; value: number | null; note?: string; daysAgo: number }[];
}
// Seed copy that the UI owns comes FROM config — never re-typed here.
const parkReasonLabel = (key: string): string => {
  const r = PARK_REASONS.find((p) => p.key === key);
  if (!r) throw new Error(`Unknown park reason "${key}" in the dev seed`);
  return r.label;
};
const DEV_SEED_SPECS: readonly SeedSpec[] = [
  { strategy: 'btl', title: 'Terraced · CF24 4AA · £150,000', sector: 'CF24 4', stage: 'worth-a-look', status: 'live', ageDays: 1, params: 'postcode=CF24+4AA&price=150000&type=T&rent=1400' },
  { strategy: 'hmo', title: 'Semi · SA1 6HW · £85,000', sector: 'SA1 6', stage: 'worth-a-look', status: 'live', ageDays: 12, params: 'postcode=SA1+6HW&price=85000&type=S&roomRent=500&refurbCost=40000&rooms=5' },
  { strategy: 'flip', title: 'Detached · NP20 1AA · £240,000', sector: 'NP20 1', stage: 'going-to-view', status: 'live', ageDays: 9, params: 'postcode=NP20+1AA&price=240000&type=D&gdv=340000&refurbCost=35000' },
  { strategy: 'brrrr', title: 'Terraced · CF11 9AB · £105,000', sector: 'CF11 9', stage: 'getting-real-numbers', status: 'live', ageDays: 5, params: 'postcode=CF11+9AB&price=105000&type=T&rent=1250&arv=200000&refurbCost=30000' },
  { strategy: 'btl', title: 'Flat · CF10 1AA · £135,000', sector: 'CF10 1', stage: 'offer-in', status: 'live', auction: true, ageDays: 6, params: 'postcode=CF10+1AA&price=135000&type=F&rent=1100',
    facts: [
      { type: 'auction-fees', value: 3200, note: 'Buyer premium plus the pack', daysAgo: 5 },
      { type: 'service-charge', value: 1400, note: 'Yearly, from the management pack', daysAgo: 4 },
    ] },
  { strategy: 'hmo', title: 'Terraced · SA2 0AA · £220,000', sector: 'SA2 0', stage: 'offer-in', status: 'live', ageDays: 12, params: 'postcode=SA2+0AA&price=220000&type=T&roomRent=650&refurbCost=45000&rooms=6',
    facts: [{ type: 'survey-finding', value: 4500, note: 'Damp in the rear bedroom', daysAgo: 3 }] },
  { strategy: 'flip', title: 'Semi · LL18 1AA · £160,000', sector: 'LL18 1', stage: 'offer-accepted', status: 'live', ageDays: 10, params: 'postcode=LL18+1AA&price=160000&type=S&gdv=250000&refurbCost=30000',
    facts: [
      { type: 'builder-quote', value: 38000, note: 'Two quotes, took the lower', daysAgo: 6 },
      { type: 'covenant', value: null, note: 'No trade from the property', daysAgo: 2 },
    ] },
  { strategy: 'brrrr', title: 'Terraced · CF37 1HR · £95,000', sector: 'CF37 1', stage: 'nearly-there', status: 'live', ageDays: 3, params: 'postcode=CF37+1HR&price=95000&type=T&rent=1000&arv=185000&refurbCost=18000',
    facts: [{ type: 'down-valuation', value: 175000, daysAgo: 1 }] },
  { strategy: 'btl', title: 'Terraced · CF37 1HR · £120,000', sector: 'CF37 1', stage: 'bought-it', status: 'done', ageDays: 30, params: 'postcode=CF37+1HR&price=120000&type=T&rent=950' },
  { strategy: 'hmo', title: 'Semi · SA3 1AA · £200,000', sector: 'SA3 1', stage: 'parked-dead', status: 'dead', dead: parkReasonLabel('numbers-fail'), ageDays: 20, params: 'postcode=SA3+1AA&price=200000&type=S&roomRent=300&refurbCost=50000',
    facts: [{ type: 'builder-quote', value: 78000, note: 'Full rewire and a new roof', daysAgo: 12 }] },
];

export async function seedDemoDeals(db: D1Database, userId: string): Promise<number> {
  await clearDemoDeals(db, userId);
  const day = 86_400_000;
  const stmts: D1PreparedStatement[] = [];
  for (const s of DEV_SEED_SPECS) {
    const id = crypto.randomUUID();
    const created = new Date(Date.now() - s.ageDays * day).toISOString();
    // Facts the deal has already collected, oldest first (P5). With the flag off
    // they are not seeded at all, so a seeded card never shows a score that comes
    // from something the board cannot show you.
    const facts: DealFact[] = [...(features.dealFacts ? s.facts ?? [] : [])]
      .sort((a, b) => b.daysAgo - a.daysAgo)
      .map((fx) => ({
        // a real UUID: the delete route only accepts one, and a seeded fact
        // must be as removable as a typed one.
        id: crypto.randomUUID(), deal_id: id, fact_type: fx.type,
        value: fx.value, note: fx.note ?? null,
        entered_at: new Date(Date.now() - fx.daysAgo * day).toISOString(),
      }));
    // The SEED IS SCORED BY THE ENGINE (D2): a card must say what the analyser
    // it links to says, or the operator spends hours chasing a phantom bug.
    // With the facts applied (P5), because the fact is the truth from then on.
    const { score, figure, verdict } = scoreFromParams(s.strategy, applyFacts(s.strategy, s.params, facts));
    // A deal that has advanced has a history and a later updated_at — a real one
    // could not look otherwise, so the seed does not either.
    const order = PROGRESS_STAGES.map((st) => st.key);
    const upto = order.indexOf(s.stage);
    const stages = upto >= 0 ? order.slice(0, upto + 1) : [...order, s.stage];
    const step = s.ageDays > 0 ? (s.ageDays * day) / (stages.length + 1) : 0;
    const movedAt = (i: number): string => new Date(Date.parse(created) + step * (i + 1)).toISOString();
    // A fact always touches the deal, so a seeded deal cannot be older than its
    // own newest fact — recordFact makes that impossible for a real one.
    const lastMove = stages.length > 1 ? movedAt(stages.length - 2) : created;
    const newestFact = facts.length > 0 ? facts[facts.length - 1].entered_at : created;
    const updated = Date.parse(newestFact) > Date.parse(lastMove) ? newestFact : lastMove;
    stmts.push(
      db.prepare('INSERT INTO saved_deals (id, user_id, strategy, title, url_params, key_figure, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, userId, s.strategy, s.title, s.params, figure, created),
      // 'null' not SQL NULL: the seed has no comparables and SAYS so, so a seeded
      // card never carries the "we don't know what this was scored against" line.
      db.prepare('INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, current_score, headline_figure, verdict_line, is_auction, status, dead_reason, source, sold_evidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, userId, s.strategy, s.title, s.sector, s.stage, score, figure, verdict, s.auction ? 1 : 0, s.status, s.dead ?? null, 'dev-seed', 'null', created, updated),
    );
    stages.forEach((to, i) => {
      stmts.push(
        db.prepare('INSERT INTO deal_stage_history (id, deal_id, from_stage, to_stage, at) VALUES (?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), id, i === 0 ? null : stages[i - 1], to, i === 0 ? created : movedAt(i - 1)),
      );
    });
    // A verdict snapshot when the deal was born, then one per fact — the same
    // history a real deal would have, so P6 has something true to read.
    const snapshot = (at: string, upTo: number): D1PreparedStatement => {
      const applied = applyFacts(s.strategy, s.params, facts.slice(0, upTo));
      return db.prepare('INSERT INTO deal_verdicts (id, deal_id, score, criteria_json, evidence_json, at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(
          crypto.randomUUID(), id, scoreFromParams(s.strategy, applied).score,
          JSON.stringify({ params: applied }),
          JSON.stringify({ facts: facts.slice(0, upTo).map((fx) => ({ type: fx.fact_type, value: fx.value, at: fx.entered_at })) }),
          at,
        );
    };
    stmts.push(snapshot(created, 0));
    facts.forEach((fx, i) => {
      stmts.push(
        db.prepare('INSERT INTO deal_facts (id, deal_id, fact_type, value_json, entered_at) VALUES (?, ?, ?, ?, ?)')
          .bind(fx.id, id, fx.fact_type, JSON.stringify({ value: fx.value, note: fx.note ?? '' }), fx.entered_at),
        snapshot(fx.entered_at, i + 1),
      );
    });
  }
  await db.batch(stmts);
  return DEV_SEED_SPECS.length;
}

/** Remove every dev-seeded deal (source='dev-seed') for the user, and its saved_deals
 * mirror + children. Returns how many deals were removed. */
export async function clearDemoDeals(db: D1Database, userId: string): Promise<number> {
  const rows = await db.prepare("SELECT id FROM deals WHERE user_id = ? AND source = 'dev-seed'").bind(userId).all<{ id: string }>();
  const ids = rows.results.map((r) => r.id);
  for (const id of ids) await deleteDeal(db, userId, id); // removes deals + children
  if (ids.length > 0) {
    const marks = ids.map(() => '?').join(',');
    await db.prepare(`DELETE FROM saved_deals WHERE user_id = ? AND id IN (${marks})`).bind(userId, ...ids).run();
  }
  return ids.length;
}
