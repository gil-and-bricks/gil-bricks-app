/**
 * Deal-pipeline data access (P1). Typed read/write helpers over D1, in the same
 * style as the rest of this Worker: env.DB.prepare(sql).bind(...).run()/first()/all(),
 * crypto.randomUUID() ids, ISO-8601 timestamps. NO scoring happens here — a score
 * is always computed by the caller with @gil-bricks/core and passed in; these
 * helpers only persist and read. Stage/fact keys are validated against config.
 */
import { INITIAL_STAGE, isFactType, isStage, statusForStage, DEAD_STAGE } from '../../config/pipeline';

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
      db.prepare('UPDATE deals SET current_score = ?, title = ?, headline_figure = ?, verdict_line = ?, is_auction = MAX(is_auction, ?), updated_at = ? WHERE id = ? AND user_id = ?')
        .bind(payload.score, payload.title, payload.headlineFigure, payload.verdictLine, payload.isAuction ? 1 : 0, now, ctx.id, ctx.userId),
      db.prepare('INSERT INTO deal_verdicts (id, deal_id, score, criteria_json, evidence_json, at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), ctx.id, payload.score, payload.criteriaJson, payload.evidenceJson, now),
    ]);
    return 'updated';
  }
  if (!canAddLiveDeal(await countLiveDeals(db, ctx.userId))) return 'at-cap';
  await db.batch([
    db.prepare('INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, current_score, headline_figure, verdict_line, is_auction, status, dead_reason, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)')
      .bind(ctx.id, ctx.userId, payload.strategy, payload.title, ctx.postcodeSector, INITIAL_STAGE, payload.score, payload.headlineFigure, payload.verdictLine, payload.isAuction ? 1 : 0, 'live', payload.source, now, now),
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
  score: number; figure: string; verdict: string; auction?: boolean; dead?: string;
  ageDays: number; params: string;
}
const DEV_SEED_SPECS: readonly SeedSpec[] = [
  { strategy: 'btl', title: 'Terraced · CF24 4AA · £185,000', sector: 'CF24 4', stage: 'worth-a-look', status: 'live', score: 8.7, figure: '£312/mo', verdict: 'Cashflows £312/mo after tax and clears the lender stress test — the numbers stack up.', ageDays: 1, params: 'postcode=CF24+4AA&price=185000&type=T&rent=1150' },
  { strategy: 'hmo', title: 'Semi · SA1 6HW · £85,000', sector: 'SA1 6', stage: 'worth-a-look', status: 'live', score: 4.9, figure: 'ROI 6.5%', verdict: 'Just 6.5% back on the cash you’d put in — short of the 12.0% you set as your minimum.', ageDays: 12, params: 'postcode=SA1+6HW&price=85000&type=S&roomRent=350&refurbCost=40000' },
  { strategy: 'flip', title: 'Detached · NP20 1AA · £240,000', sector: 'NP20 1', stage: 'going-to-view', status: 'live', score: 6.8, figure: '£28,000 profit', verdict: '£28,000 profit before tax — a fair cushion, but one overrun eats into it.', ageDays: 9, params: 'postcode=NP20+1AA&price=240000&type=D&gdv=300000&refurbCost=35000' },
  { strategy: 'brrrr', title: 'Terraced · CF11 9AB · £150,000', sector: 'CF11 9', stage: 'getting-real-numbers', status: 'live', score: 8.2, figure: 'All money out + £4,500', verdict: 'Refinance pulls all your cash back out with £4,500 to spare — a clean BRRRR.', ageDays: 5, params: 'postcode=CF11+9AB&price=150000&type=T&rent=1000&arv=210000&refurbCost=30000' },
  { strategy: 'btl', title: 'Flat · CF10 1AA · £135,000', sector: 'CF10 1', stage: 'offer-in', status: 'live', score: 6.4, figure: '£210/mo', verdict: '£210/mo after tax — it works, but it’s thin for a flat with a service charge.', auction: true, ageDays: 6, params: 'postcode=CF10+1AA&price=135000&type=F&rent=850' },
  { strategy: 'hmo', title: 'Terraced · SA2 0AA · £220,000', sector: 'SA2 0', stage: 'offer-in', status: 'live', score: 5.2, figure: 'ROI 9.0%', verdict: 'Just 9.0% back on the cash you’d put in — under the 12.0% that makes an HMO worth the work.', ageDays: 12, params: 'postcode=SA2+0AA&price=220000&type=T&roomRent=420&refurbCost=45000' },
  { strategy: 'flip', title: 'Semi · LL18 1AA · £160,000', sector: 'LL18 1', stage: 'offer-accepted', status: 'live', score: 8.9, figure: '£41,000 profit', verdict: '£41,000 profit before tax on a tidy refurb — a strong margin for the risk.', ageDays: 10, params: 'postcode=LL18+1AA&price=160000&type=S&gdv=235000&refurbCost=30000' },
  { strategy: 'brrrr', title: 'Terraced · NP19 0AA · £128,000', sector: 'NP19 0', stage: 'nearly-there', status: 'live', score: 7.1, figure: '£3,000 left in', verdict: '£3,000 stays in after refinancing — close to all-out, and the rent covers it.', ageDays: 3, params: 'postcode=NP19+0AA&price=128000&type=T&rent=875&arv=175000&refurbCost=22000' },
  { strategy: 'btl', title: 'Terraced · CF37 1HR · £120,000', sector: 'CF37 1', stage: 'bought-it', status: 'done', score: 8.4, figure: '£350/mo', verdict: 'Completed — £350/mo after tax, comfortably above your minimum.', ageDays: 30, params: 'postcode=CF37+1HR&price=120000&type=T&rent=950' },
  { strategy: 'hmo', title: 'Semi · SA3 1AA · £200,000', sector: 'SA3 1', stage: 'parked-dead', status: 'dead', score: 3.8, figure: 'ROI 5.0%', verdict: 'Only 5.0% back on the cash — the numbers never worked at this price.', dead: 'Numbers don’t work', ageDays: 20, params: 'postcode=SA3+1AA&price=200000&type=S&roomRent=300&refurbCost=50000' },
];

export async function seedDemoDeals(db: D1Database, userId: string): Promise<number> {
  await clearDemoDeals(db, userId);
  const day = 86_400_000;
  const stmts: D1PreparedStatement[] = [];
  for (const s of DEV_SEED_SPECS) {
    const id = crypto.randomUUID();
    const at = new Date(Date.now() - s.ageDays * day).toISOString();
    stmts.push(
      db.prepare('INSERT INTO saved_deals (id, user_id, strategy, title, url_params, key_figure, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, userId, s.strategy, s.title, s.params, s.figure, at),
      db.prepare('INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, current_score, headline_figure, verdict_line, is_auction, status, dead_reason, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, userId, s.strategy, s.title, s.sector, s.stage, s.score, s.figure, s.verdict, s.auction ? 1 : 0, s.status, s.dead ?? null, 'dev-seed', at, at),
    );
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
