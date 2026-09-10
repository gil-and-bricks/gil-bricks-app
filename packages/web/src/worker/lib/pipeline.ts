/**
 * Deal-pipeline data access (P1). Typed read/write helpers over D1, in the same
 * style as the rest of this Worker: env.DB.prepare(sql).bind(...).run()/first()/all(),
 * crypto.randomUUID() ids, ISO-8601 timestamps. NO scoring happens here — a score
 * is always computed by the caller with @gil-bricks/core and passed in; these
 * helpers only persist and read. Stage/fact keys are validated against config.
 */
import { scoreFromParams } from '../../lib/deals/scoreFromParams';
import { applyFacts, factMoves, type DealFact } from '../../lib/deals/facts';
import { dwellState } from '../../lib/deals/board';
import { features } from '../../config/features';
import { buildDeathSnapshot, parseSnapshot } from '../../lib/deals/graveyard';
import { BOARD_PAGE, DEAL_DATE_KEYS, INITIAL_STAGE, MAX_LIVE_DEALS, isFactType, isStage, statusForStage, DEAD_STAGE, PARK_REASONS, PROGRESS_STAGES, parkReason } from '../../config/pipeline';

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
 * The cap applies to LIVE deals only — dead and done deals are the valuable
 * memory, not clutter, and never count against it. The number itself is a knob
 * in src/config/pipeline.ts (P11 handover).
 */
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
/**
 * A date the person set on a deal (P8). Only the three configured columns can be
 * written, only a plain ISO day, and only ever by the person: the app never sets
 * one, and clearing it is as easy as setting it.
 */
export async function setDealDate(
  db: D1Database, userId: string, dealId: string, column: string, value: string | null,
): Promise<boolean> {
  if (!DEAL_DATE_KEYS.includes(column)) throw new Error(`unknown deal date: ${column}`);
  const owned = await getOwnedDeal(db, userId, dealId);
  if (!owned) return false;
  const now = new Date().toISOString();
  // The column name is checked against the config list above, never interpolated
  // from the request.
  await db.prepare(`UPDATE deals SET ${column} = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
    .bind(value, now, dealId, userId)
    .run();
  return true;
}

/**
 * THE DAILY STAMP (P8). Once a day a Cloudflare cron writes each live deal's
 * stage-aware staleness, so a surface that cannot compute it can still read it.
 * It COMPUTES ONLY — it never notifies anybody, and this app still sends no
 * email of any kind. The value comes from the same pure `dwellState` the board
 * runs, so the stamp and the screen can never mean different things.
 */
export async function stampStaleness(db: D1Database, now = Date.now()): Promise<number> {
  const rows = await db
    .prepare("SELECT d.id, d.stage, d.status, COALESCE((SELECT MAX(h.at) FROM deal_stage_history h WHERE h.deal_id = d.id), d.created_at) AS stage_since FROM deals d WHERE d.status = 'live'")
    .all<{ id: string; stage: string; status: string; stage_since: string }>();
  const at = new Date(now).toISOString();
  // Grouped by state, so the number of statements depends on the number of
  // STATES (three) and not on the number of deals — one UPDATE per deal would
  // have run into Cloudflare's per-invocation limits long before this product's
  // own 100-deals-per-user cap (P8 review). Chunked to stay inside SQLite's
  // bound-variable limit.
  const byState = new Map<string, string[]>();
  for (const r of rows.results) {
    const state = dwellState(r, now);
    const ids = byState.get(state) ?? [];
    ids.push(r.id);
    byState.set(state, ids);
  }
  const stmts: D1PreparedStatement[] = [];
  for (const [state, ids] of byState) {
    for (let i = 0; i < ids.length; i += 400) {
      const chunk = ids.slice(i, i + 400);
      stmts.push(db.prepare(`UPDATE deals SET stale_state = ?, stale_at = ? WHERE id IN (${chunk.map(() => '?').join(',')})`)
        .bind(state, at, ...chunk));
    }
  }
  // A deal that has been parked or bought keeps no stale mark: the stamp and the
  // board must never say different things about the same deal.
  stmts.push(db.prepare("UPDATE deals SET stale_state = NULL, stale_at = NULL WHERE status != 'live' AND stale_state IS NOT NULL"));
  for (let i = 0; i < stmts.length; i += 20) await db.batch(stmts.slice(i, i + 20));
  return rows.results.length;
}

export interface ChangeRow {
  id: string;
  deal_id: string;
  fact_type: string;
  fact_value: number | null;
  previous_value: number | null;
  from_score: number;
  to_score: number;
  to_verdict_line: string;
  /** D4 — the cash needed up front, before and after. Null on older rows. */
  from_cash: number | null;
  to_cash: number | null;
  at: string;
  acknowledged_at: string | null;
}

/** What the browser sends when a re-score crossed a threshold. */
export interface FactChange {
  fromScore: number;
  toScore: number;
  previousValue: number | null;
  toVerdictLine: string;
  /** D4 — what you must find up front, before and after this fact. */
  fromCash: number | null;
  toCash: number | null;
}

/** Every unacknowledged-or-recent change on a user's deals, newest first. */
export async function listChanges(db: D1Database, userId: string): Promise<ChangeRow[]> {
  const rows = await db
    .prepare(
      `SELECT c.id, c.deal_id, c.fact_type, c.fact_value, c.previous_value, c.from_score,
              c.to_score, c.to_verdict_line, c.from_cash, c.to_cash, c.at, c.acknowledged_at
         FROM deal_changes c JOIN deals d ON d.id = c.deal_id
        WHERE d.user_id = ? AND c.acknowledged_at IS NULL
        ORDER BY c.at DESC`,
    )
    .bind(userId)
    .all<ChangeRow>();
  return rows.results;
}

/**
 * P11 — the chain-risk card has been read. One timestamp on the deal; it is only
 * ever set, never cleared, because "I have read this" does not become untrue.
 */
export async function ackChainRisk(db: D1Database, userId: string, dealId: string): Promise<boolean> {
  const owned = await getOwnedDeal(db, userId, dealId);
  if (!owned) return false;
  await db.prepare('UPDATE deals SET chain_ack_at = ? WHERE id = ? AND user_id = ? AND chain_ack_at IS NULL')
    .bind(new Date().toISOString(), dealId, userId)
    .run();
  return true;
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

/** One row per deal, exactly as the BOARD reads it. */
export interface BoardRow {
  id: string; strategy: string; title: string; stage: string; current_score: number | null;
  status: string; dead_reason: string | null; headline_figure: string | null; verdict_line: string | null;
  is_auction: number; updated_at: string; sold_evidence: string | null; room_size_failures: number | null;
  viewing_date: string | null; chase_date: string | null; auction_date: string | null; exchange_date: string | null;
  stale_state: string | null; stale_at: string | null; chain_ack_at: string | null;
  url_params: string; key_figure: string; stage_since: string;
  /** What this row was ordered by on a page — the cursor to ask for the next
   * one. Only present on a paged (terminal) row. */
  /** P12 — how many scores this deal has held (deal_verdicts with a score). */
  score_points?: number;
  page_at?: string;
}

/** The columns every board surface reads, in one place. */
const BOARD_COLUMNS = `d.id, d.strategy, d.title, d.stage, d.current_score, d.status, d.dead_reason,
              d.headline_figure, d.verdict_line, d.is_auction, d.updated_at, d.sold_evidence, d.room_size_failures,
              d.viewing_date, d.chase_date, d.auction_date, d.exchange_date, d.stale_state, d.stale_at, d.chain_ack_at,
              s.url_params, s.key_figure,
              COALESCE((SELECT MAX(h.at) FROM deal_stage_history h WHERE h.deal_id = d.id), d.created_at) AS stage_since,
              -- P12: how many scores this deal has actually held. The card offers
              -- the history control only when there is a history to show; with one
              -- point it opened on a single dot and the number already on the card.
              (SELECT COUNT(*) FROM deal_verdicts v WHERE v.deal_id = d.id AND v.score IS NOT NULL) AS score_points`;

/**
 * THE board query (P10). The badge answers the same question the board does, so
 * it reads the same rows through the same SQL — one truth, never a second
 * implementation of "which deals does this person have".
 *
 * Joined to saved_deals only for url_params (the analyser link); every deal has
 * a mirror row (P2 dual-write). stage_since falls back to created_at for deals
 * that predate stage history, so a re-score never resets a deal's age.
 *
 * Every deal, unbounded — used by the ATTENTION count, which must rank the whole
 * board. The board SCREEN reads `boardWindow` instead (P11).
 */
export async function boardRows(db: D1Database, userId: string): Promise<BoardRow[]> {
  const rows = await db
    .prepare(
      `SELECT ${BOARD_COLUMNS}
         FROM deals d JOIN saved_deals s ON s.id = d.id
        WHERE d.user_id = ?
        ORDER BY d.updated_at DESC`,
    )
    .bind(userId)
    .all<BoardRow>();
  return rows.results;
}

/** How many deals this person has, by status — counted, never inferred from a
 * page of rows. The board's counter is these numbers and nothing else (P11). */
export async function dealCounts(db: D1Database, userId: string): Promise<{ live: number; done: number; dead: number }> {
  const rows = await db
    .prepare('SELECT status, COUNT(*) AS n FROM deals WHERE user_id = ? GROUP BY status')
    .bind(userId)
    .all<{ status: string; n: number }>();
  const of = (status: string): number => rows.results.find((r) => r.status === status)?.n ?? 0;
  return { live: of('live'), done: of('done'), dead: of('dead') };
}

/**
 * One page of terminal deals — bought or killed — newest first. Terminal deals
 * are kept for ever (they are the memory), so they are the only part of the
 * board that can grow without limit; the live board cannot, because
 * MAX_LIVE_DEALS bounds it.
 *
 * The cursor is (updated_at, id) rather than an offset: rows do not shuffle
 * under a reader, and a deal that changes while you are paging cannot make
 * another one appear twice or vanish.
 */
export async function terminalPage(
  db: D1Database, userId: string, status: 'dead' | 'done', limit: number,
  cursor?: { updatedAt: string; id: string },
): Promise<{ rows: BoardRow[]; more: boolean }> {
  const take = Math.max(1, Math.min(200, Math.floor(limit))) + 1; // +1 answers "is there more?"
  // A KILLED deal is ordered by when it DIED, not when it was last touched:
  // adding a fact to an old dead deal must not drag it to the top of the
  // graveyard, or the pattern's "your last twenty" would be the wrong twenty
  // (P11 review). A bought deal has no such moment, so it keeps updated_at.
  const orderAt = status === 'dead'
    ? "COALESCE((SELECT MAX(x.at) FROM deal_deaths x WHERE x.deal_id = d.id AND x.revived_at IS NULL), d.updated_at)"
    : 'd.updated_at';
  const where = cursor ? `AND (${orderAt} < ? OR (${orderAt} = ? AND d.id < ?))` : '';
  const binds: unknown[] = cursor ? [userId, status, cursor.updatedAt, cursor.updatedAt, cursor.id, take] : [userId, status, take];
  const rows = await db
    .prepare(
      `SELECT ${BOARD_COLUMNS}, ${orderAt} AS page_at
         FROM deals d JOIN saved_deals s ON s.id = d.id
        WHERE d.user_id = ? AND d.status = ? ${where}
        ORDER BY page_at DESC, d.id DESC
        LIMIT ?`,
    )
    .bind(...binds)
    .all<BoardRow>();
  const more = rows.results.length === take;
  return { rows: more ? rows.results.slice(0, take - 1) : rows.results, more };
}

/**
 * What the board SCREEN loads (P11): every live deal — there can never be more
 * than MAX_LIVE_DEALS of them — plus a window of the bought and the killed, plus
 * the true totals. The window changes how much of the list is on screen; it
 * never changes a number.
 */
export async function boardWindow(
  db: D1Database, userId: string, page: { done: number; dead: number } = BOARD_PAGE,
): Promise<{ rows: BoardRow[]; counts: { live: number; done: number; dead: number }; more: { done: boolean; dead: boolean } }> {
  const live = await db
    .prepare(`SELECT ${BOARD_COLUMNS} FROM deals d JOIN saved_deals s ON s.id = d.id WHERE d.user_id = ? AND d.status = 'live' ORDER BY d.updated_at DESC`)
    .bind(userId)
    .all<BoardRow>();
  const done = await terminalPage(db, userId, 'done', page.done);
  const dead = await terminalPage(db, userId, 'dead', page.dead);
  return {
    rows: [...live.results, ...done.rows, ...dead.rows],
    counts: await dealCounts(db, userId),
    more: { done: done.more, dead: dead.more },
  };
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
): Promise<{ id: string; enteredAt: string }> {
  if (!isFactType(factType)) throw new Error(`unknown fact type: ${factType}`);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare('INSERT INTO deal_facts (id, deal_id, fact_type, value_json, entered_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, dealId, factType, valueJson, now),
    db.prepare('UPDATE deals SET updated_at = ? WHERE id = ?').bind(now, dealId),
    ...(verdict ? verdictStatements(db, dealId, verdict, now) : []),
    ...(change
      ? [db.prepare('INSERT INTO deal_changes (id, deal_id, fact_type, fact_value, previous_value, from_score, to_score, to_verdict_line, from_cash, to_cash, at, acknowledged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)')
        .bind(change.id, dealId, factType, change.value, change.change.previousValue, change.change.fromScore, change.change.toScore, change.change.toVerdictLine, change.change.fromCash, change.change.toCash, now)]
      : []),
  ]);
  // The SERVER's timestamp goes back to the browser: the board stamps its
  // optimistic copy with it, so a fold window built from that copy can never
  // exclude the very fact it was drawn around (P7 review).
  return { id, enteredAt: now };
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

/** The facts on the deals a page actually holds (P11 review) — a board that
 * loads a window of the dead should not ship every fact they ever carried. */
export async function listFactsFor(db: D1Database, userId: string, dealIds: readonly string[]): Promise<FactRow[]> {
  if (dealIds.length === 0) return [];
  const marks = dealIds.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT f.id, f.deal_id, f.fact_type, f.value_json, f.entered_at, f.folded_at
         FROM deal_facts f JOIN deals d ON d.id = f.deal_id
        WHERE d.user_id = ? AND f.deal_id IN (${marks}) ORDER BY f.entered_at`,
    )
    .bind(userId, ...dealIds)
    .all<FactRow>();
  return rows.results;
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

/**
 * Every fact on a deal, in the shape the maths reads. One parser, so the board
 * and a death snapshot can never disagree about what a deal had learned.
 */
export function toDealFact(row: FactRow): DealFact {
  let value: number | null = null;
  let note: string | null = null;
  try {
    const parsed = JSON.parse(row.value_json) as { value?: unknown; note?: unknown };
    value = typeof parsed.value === 'number' ? parsed.value : null;
    note = typeof parsed.note === 'string' ? parsed.note : null;
  } catch {
    /* a malformed row is a fact with no number rather than a lost one */
  }
  return {
    id: row.id, deal_id: row.deal_id, fact_type: row.fact_type, value, note,
    entered_at: row.entered_at, folded_at: row.folded_at ?? null,
  };
}

/** One recorded death. `snapshot_json` is written once and never updated. */
export interface DeathRow {
  id: string;
  deal_id: string;
  reason_key: string;
  note: string;
  snapshot_json: string;
  at: string;
  revived_at: string | null;
}

/**
 * KILL A DEAL (P9). One reason chip, an optional line, and a FROZEN snapshot of
 * the card as it died: what it scored, the engine's own verdict line, its
 * evidence chips, the facts it carried and the stage it reached.
 *
 * The snapshot is built HERE, on the server, so every death is captured the same
 * way whatever asked for it — the park chip, the change line's one-tap kill, or
 * anything built later. It is written once and never updated: a rules change
 * moves what a deal would score today, never what this one scored on the day you
 * killed it.
 *
 * `deals.dead_reason` keeps the LABEL, exactly as it always has, so nothing that
 * read it before reads differently now; the stable KEY lives in deal_deaths.
 */
export async function markDead(
  db: D1Database, dealId: string, fromStage: string, reasonKey: string, note = '',
): Promise<DeathRow> {
  const reason = parkReason(reasonKey);
  if (!reason) throw new Error(`unknown park reason: ${reasonKey}`);
  const now = new Date().toISOString();
  // The url params live on the saved_deals mirror; a deal always has one (P2).
  const row = await db
    .prepare('SELECT d.strategy, d.title, d.current_score, d.verdict_line, d.headline_figure, d.sold_evidence, d.room_size_failures, s.url_params FROM deals d LEFT JOIN saved_deals s ON s.id = d.id WHERE d.id = ?')
    .bind(dealId)
    .first<{
      strategy: string; title: string; current_score: number | null; verdict_line: string | null;
      headline_figure: string | null; sold_evidence: string | null; room_size_failures: number | null;
      url_params: string | null;
    }>();
  const factRows = await dealFacts(db, dealId);
  const snapshot = buildDeathSnapshot(
    {
      title: row?.title ?? '', strategy: row?.strategy ?? '', stage: fromStage,
      current_score: row?.current_score ?? null, verdict_line: row?.verdict_line ?? null,
      headline_figure: row?.headline_figure ?? null, url_params: row?.url_params ?? '',
      sold_evidence: row?.sold_evidence, room_size_failures: row?.room_size_failures,
    },
    factRows.map(toDealFact),
  );
  const death: DeathRow = {
    id: crypto.randomUUID(),
    deal_id: dealId,
    reason_key: reason.key,
    note: note.slice(0, 200).trim(),
    snapshot_json: JSON.stringify(snapshot),
    at: now,
    revived_at: null,
  };
  await db.batch([
    db.prepare('INSERT INTO deal_stage_history (id, deal_id, from_stage, to_stage, at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), dealId, fromStage, DEAD_STAGE.key, now),
    db.prepare("UPDATE deals SET stage = ?, status = 'dead', dead_reason = ?, updated_at = ? WHERE id = ?")
      .bind(DEAD_STAGE.key, reason.label, now, dealId),
    db.prepare('INSERT INTO deal_deaths (id, deal_id, reason_key, note, snapshot_json, at, revived_at) VALUES (?, ?, ?, ?, ?, ?, NULL)')
      .bind(death.id, dealId, death.reason_key, death.note, death.snapshot_json, now),
  ]);
  // Handed straight back to the caller: the headstone the board shows is the
  // snapshot the write made, never a second guess at it in the browser.
  return death;
}

/** The death a deal is currently under, or null. Ownership is the caller's job. */
export async function openDeath(db: D1Database, dealId: string): Promise<DeathRow | null> {
  return db
    .prepare('SELECT id, deal_id, reason_key, note, snapshot_json, at, revived_at FROM deal_deaths WHERE deal_id = ? AND revived_at IS NULL ORDER BY at DESC LIMIT 1')
    .bind(dealId)
    .first<DeathRow>();
}

/** The deaths on the deals a page actually holds (P11) — never every death the
 * person has ever had. Empty in, empty out. */
export async function listDeathsFor(db: D1Database, userId: string, dealIds: readonly string[]): Promise<DeathRow[]> {
  if (dealIds.length === 0) return [];
  const marks = dealIds.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT x.id, x.deal_id, x.reason_key, x.note, x.snapshot_json, x.at, x.revived_at
         FROM deal_deaths x JOIN deals d ON d.id = x.deal_id
        WHERE d.user_id = ? AND x.revived_at IS NULL AND x.deal_id IN (${marks})
        ORDER BY x.at DESC`,
    )
    .bind(userId, ...dealIds)
    .all<DeathRow>();
  return rows.results;
}

/** The deaths on a user's deals that have NOT been undone, newest first. */
export async function listDeaths(db: D1Database, userId: string): Promise<DeathRow[]> {
  const rows = await db
    .prepare(
      `SELECT x.id, x.deal_id, x.reason_key, x.note, x.snapshot_json, x.at, x.revived_at
         FROM deal_deaths x JOIN deals d ON d.id = x.deal_id
        WHERE d.user_id = ? AND x.revived_at IS NULL
        ORDER BY x.at DESC`,
    )
    .bind(userId)
    .all<DeathRow>();
  return rows.results;
}

/**
 * A DEAD DEAL CAN COME BACK (P9). Sellers return, chains re-form, a price drops.
 * It goes back to the stage it died at — the snapshot's own stage, or the stage
 * history if the death predates the snapshot — and the death is KEPT, marked
 * revived, never deleted. It counts against the LIVE cap again, so a full board
 * refuses rather than quietly going over.
 *
 * The re-score against today's rules travels with the call, computed by the
 * caller with @gil-bricks/core exactly as a fact re-score is.
 */
export async function reviveDeal(
  db: D1Database, userId: string, dealId: string, verdict?: FactVerdict,
): Promise<{ ok: boolean; atCap?: boolean; stage?: string }> {
  const owned = await getOwnedDeal(db, userId, dealId);
  if (!owned || owned.status !== 'dead') return { ok: false };
  if (!canAddLiveDeal(await countLiveDeals(db, userId))) return { ok: false, atCap: true };
  const death = await db
    .prepare('SELECT id, snapshot_json FROM deal_deaths WHERE deal_id = ? AND revived_at IS NULL ORDER BY at DESC LIMIT 1')
    .bind(dealId)
    .first<{ id: string; snapshot_json: string }>();
  const back = await db
    .prepare("SELECT from_stage FROM deal_stage_history WHERE deal_id = ? AND to_stage = ? AND from_stage IS NOT NULL ORDER BY at DESC LIMIT 1")
    .bind(dealId, DEAD_STAGE.key)
    .first<{ from_stage: string }>();
  const candidates = [back?.from_stage, parseSnapshot(death?.snapshot_json)?.stage, INITIAL_STAGE];
  // Only a LIVE stage can be come back to: a stage that no longer exists, or one
  // that is itself terminal, would leave the deal in a place it cannot move from.
  const stage = candidates.find((k) => typeof k === 'string' && isStage(k) && statusForStage(k) === 'live') ?? INITIAL_STAGE;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT INTO deal_stage_history (id, deal_id, from_stage, to_stage, at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), dealId, DEAD_STAGE.key, stage, now),
    db.prepare("UPDATE deals SET stage = ?, status = 'live', updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(stage, now, dealId, userId),
    ...(death ? [db.prepare('UPDATE deal_deaths SET revived_at = ? WHERE id = ?').bind(now, death.id)] : []),
    ...(verdict ? verdictStatements(db, dealId, verdict, now) : []),
  ]);
  return { ok: true, stage };
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
  /** A dead deal: the PARK_REASONS key it died on, and the line the person typed. */
  deadKey?: string;
  deadNote?: string;
  /** A dead deal's stage when it died — the graveyard shows what it reached. */
  reached?: string;
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
  { strategy: 'btl', title: 'Terraced · CF24 4AA · £150,000', sector: 'CF24 4', stage: 'worth-a-look', status: 'live', ageDays: 1, params: 'postcode=CF24+4AA&paon=12&price=150000&type=T&rent=1400' },
  { strategy: 'hmo', title: 'Semi · SA1 6HW · £85,000', sector: 'SA1 6', stage: 'worth-a-look', status: 'live', ageDays: 12, params: 'postcode=SA1+6HW&paon=31&price=85000&type=S&roomRent=500&refurbCost=40000&rooms=5' },
  { strategy: 'flip', title: 'Detached · NP20 1AA · £240,000', sector: 'NP20 1', stage: 'going-to-view', status: 'live', ageDays: 9, params: 'postcode=NP20+1AA&paon=4&price=240000&type=D&gdv=340000&refurbCost=35000' },
  { strategy: 'brrrr', title: 'Terraced · CF11 9AB · £105,000', sector: 'CF11 9', stage: 'getting-real-numbers', status: 'live', ageDays: 5, params: 'postcode=CF11+9AB&paon=58&price=105000&type=T&rent=1250&arv=200000&refurbCost=30000' },
  { strategy: 'btl', title: 'Flat · CF10 1AA · £135,000', sector: 'CF10 1', stage: 'offer-in', status: 'live', auction: true, ageDays: 6, params: 'postcode=CF10+1AA&paon=7&price=135000&type=F&rent=1100',
    facts: [
      { type: 'auction-fees', value: 3200, note: 'Buyer premium plus the pack', daysAgo: 5 },
      { type: 'service-charge', value: 1400, note: 'Yearly, from the management pack', daysAgo: 4 },
    ] },
  { strategy: 'hmo', title: 'Terraced · SA2 0AA · £220,000', sector: 'SA2 0', stage: 'offer-in', status: 'live', ageDays: 12, params: 'postcode=SA2+0AA&paon=19&price=220000&type=T&roomRent=650&refurbCost=45000&rooms=6',
    facts: [{ type: 'survey-finding', value: 4500, note: 'Damp in the rear bedroom', daysAgo: 3 }] },
  { strategy: 'flip', title: 'Semi · LL18 1AA · £160,000', sector: 'LL18 1', stage: 'offer-accepted', status: 'live', ageDays: 10, params: 'postcode=LL18+1AA&paon=2&price=160000&type=S&gdv=250000&refurbCost=30000',
    facts: [
      { type: 'builder-quote', value: 38000, note: 'Two quotes, took the lower', daysAgo: 6 },
      { type: 'covenant', value: null, note: 'No trade from the property', daysAgo: 2 },
    ] },
  { strategy: 'brrrr', title: 'Terraced · CF37 1HR · £95,000', sector: 'CF37 1', stage: 'nearly-there', status: 'live', ageDays: 3, params: 'postcode=CF37+1HR&paon=44&price=95000&type=T&rent=1000&arv=185000&refurbCost=18000',
    facts: [{ type: 'down-valuation', value: 175000, daysAgo: 1 }] },
  { strategy: 'btl', title: 'Terraced · CF37 1HR · £120,000', sector: 'CF37 1', stage: 'bought-it', status: 'done', ageDays: 30, params: 'postcode=CF37+1HR&paon=86&price=120000&type=T&rent=950' },
  // ---- the graveyard (P9): deals that died, which is the job working ----
  { strategy: 'hmo', title: 'Semi · SA3 1AA · £200,000', sector: 'SA3 1', stage: 'parked-dead', status: 'dead', deadKey: 'numbers-fail', reached: 'getting-real-numbers', ageDays: 20, params: 'postcode=SA3+1AA&paon=23&price=200000&type=S&roomRent=300&refurbCost=50000',
    facts: [{ type: 'builder-quote', value: 78000, note: 'Full rewire and a new roof', daysAgo: 12 }] },
  { strategy: 'btl', title: 'Terraced · CF14 3AA · £165,000', sector: 'CF14 3', stage: 'parked-dead', status: 'dead', deadKey: 'refurb-too-high', deadNote: 'Quote came back at twice my guess', reached: 'going-to-view', ageDays: 16, params: 'postcode=CF14+3AA&paon=9&price=165000&type=T&rent=1200&refurbCost=20000',
    facts: [{ type: 'builder-quote', value: 52000, daysAgo: 14 }] },
  { strategy: 'flip', title: 'Semi · NP44 1AA · £185,000', sector: 'NP44 1', stage: 'parked-dead', status: 'dead', deadKey: 'refurb-too-high', reached: 'offer-in', ageDays: 11, params: 'postcode=NP44+1AA&paon=17&price=185000&type=S&gdv=250000&refurbCost=25000',
    facts: [{ type: 'builder-quote', value: 61000, note: 'Roof and rewire', daysAgo: 9 }] },
  { strategy: 'brrrr', title: 'Terraced · SA6 8AA · £98,000', sector: 'SA6 8', stage: 'parked-dead', status: 'dead', deadKey: 'refurb-too-high', reached: 'getting-real-numbers', ageDays: 8, params: 'postcode=SA6+8AA&paon=64&price=98000&type=T&rent=950&arv=160000&refurbCost=22000' },
  { strategy: 'btl', title: 'Flat · CF10 5AA · £115,000', sector: 'CF10 5', stage: 'parked-dead', status: 'dead', deadKey: 'beaten', deadNote: 'Cash buyer, same afternoon', reached: 'offer-in', ageDays: 6, params: 'postcode=CF10+5AA&paon=3&price=115000&type=F&rent=900' },
  { strategy: 'flip', title: 'Detached · LL30 1AA · £275,000', sector: 'LL30 1', stage: 'parked-dead', status: 'dead', deadKey: 'down-valued', reached: 'offer-accepted', ageDays: 4, params: 'postcode=LL30+1AA&paon=11&price=275000&type=D&gdv=360000&refurbCost=40000',
    facts: [{ type: 'down-valuation', value: 325000, daysAgo: 3 }] },
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
    // A dead deal died SOMEWHERE — at `reached` — it did not walk the whole board
    // first. The graveyard shows the stage it got to, so the seed cannot lie.
    const reachedAt = order.indexOf(s.reached ?? INITIAL_STAGE);
    const stages = upto >= 0 ? order.slice(0, upto + 1) : [...order.slice(0, reachedAt + 1), s.stage];
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
        .bind(id, userId, s.strategy, s.title, s.sector, s.stage, score, figure, verdict, s.auction ? 1 : 0, s.status, s.deadKey ? parkReasonLabel(s.deadKey) : null, 'dev-seed', 'null', created, updated),
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
    // P9 — a seeded death is a REAL death: the same frozen snapshot markDead
    // writes, so the graveyard shows the card as it died rather than a stub.
    if (s.deadKey) {
      const frozen = buildDeathSnapshot(
        {
          title: s.title, strategy: s.strategy, stage: s.reached ?? INITIAL_STAGE,
          current_score: score, verdict_line: verdict, headline_figure: figure,
          url_params: s.params, sold_evidence: 'null', room_size_failures: null,
        },
        facts,
      );
      stmts.push(
        db.prepare('INSERT INTO deal_deaths (id, deal_id, reason_key, note, snapshot_json, at, revived_at) VALUES (?, ?, ?, ?, ?, ?, NULL)')
          .bind(crypto.randomUUID(), id, s.deadKey, s.deadNote ?? '', JSON.stringify(frozen), updated),
      );
    }
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
