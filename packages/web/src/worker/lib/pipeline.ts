/**
 * Deal-pipeline data access (P1). Typed read/write helpers over D1, in the same
 * style as the rest of this Worker: env.DB.prepare(sql).bind(...).run()/first()/all(),
 * crypto.randomUUID() ids, ISO-8601 timestamps. NO scoring happens here — a score
 * is always computed by the caller with @gil-bricks/core and passed in; these
 * helpers only persist and read. Stage/fact keys are validated against config.
 */
import { INITIAL_STAGE, isFactType, isStage, statusForStage, DEAD_STAGE } from '../../config/pipeline';

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
  status: string;
  dead_reason: string | null;
  source: string;
  created_at: string;
  updated_at: string;
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

export interface NewDeal {
  userId: string;
  strategy: string;
  title: string;
  postcodeSector: string;
  /** Score computed by the caller with @gil-bricks/core (null if not yet scored). */
  score: number | null;
  criteriaJson: string;
  evidenceJson: string;
  /** Where it came from — the pipeline only originates from an analyser payload. */
  source: string;
}

/**
 * Create a deal from an analyser payload (the ONLY way a deal is born — no manual
 * entry). Writes the deal, its opening stage-history entry and its first verdict
 * snapshot atomically. Returns the new deal id.
 */
export async function createDealFromAnalyser(db: D1Database, d: NewDeal): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, current_score, status, dead_reason, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)')
      .bind(id, d.userId, d.strategy, d.title, d.postcodeSector, INITIAL_STAGE, d.score, 'live', d.source, now, now),
    db.prepare('INSERT INTO deal_stage_history (id, deal_id, from_stage, to_stage, at) VALUES (?, ?, NULL, ?, ?)')
      .bind(crypto.randomUUID(), id, INITIAL_STAGE, now),
    db.prepare('INSERT INTO deal_verdicts (id, deal_id, score, criteria_json, evidence_json, at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), id, d.score, d.criteriaJson, d.evidenceJson, now),
  ]);
  return id;
}

/** Record a fact that has arrived, and touch the deal so it sorts as fresh. */
export async function recordFact(db: D1Database, dealId: string, factType: string, valueJson: string): Promise<void> {
  if (!isFactType(factType)) throw new Error(`unknown fact type: ${factType}`);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT INTO deal_facts (id, deal_id, fact_type, value_json, entered_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), dealId, factType, valueJson, now),
    db.prepare('UPDATE deals SET updated_at = ? WHERE id = ?').bind(now, dealId),
  ]);
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
