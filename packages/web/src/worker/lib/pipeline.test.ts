import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, basename } from 'node:path';
import {
  countLiveDeals, canAddLiveDeal, MAX_LIVE_DEALS, listLiveDealsByStaleness,
  upsertPipelineDeal, parseAnalyserDeal, recordVerdict, recordFact, moveStage, markDead, deleteDeal,
  dealFacts, dealVerdicts, stageHistory, getOwnedDeal,
} from './pipeline';

const isDealStrategy = (s: string) => ['btl', 'flip', 'brrrr', 'hmo'].includes(s);
// Every SQL phrasing that CREATES a deals row: plain INSERT, INSERT OR REPLACE/IGNORE/…,
// and REPLACE INTO. The word boundary keeps it off the sibling `saved_deals` table.
const DEAL_INSERT_RE = /(INSERT(\s+OR\s+(REPLACE|IGNORE|ABORT|FAIL|ROLLBACK))?|REPLACE)\s+INTO\s+deals\b/i;
/** Build a deal the only supported way: a branded analyser payload → upsertPipelineDeal. */
async function mkDeal(
  d1: D1Database,
  o: { id?: string; userId?: string; strategy?: string; title?: string; postcodeSector?: string; score?: number | null; url_params?: string; criteriaJson?: string; evidenceJson?: string; source?: 'extension' | 'analyser' } = {},
) {
  const id = o.id ?? crypto.randomUUID();
  const payload = parseAnalyserDeal({
    strategy: o.strategy ?? 'btl', title: o.title ?? 't', url_params: o.url_params ?? `postcode=CF37+1HR&price=1&k=${id}`,
    score: o.score === undefined ? 7 : o.score, criteria_json: o.criteriaJson ?? '{}', evidence_json: o.evidenceJson ?? '{}', source: o.source ?? 'analyser',
  }, isDealStrategy)!;
  const result = await upsertPipelineDeal(d1, { id, userId: o.userId ?? 'u1', postcodeSector: o.postcodeSector ?? 'CF37 1' }, payload);
  return { id, result };
}

const MIG = (n: string) => readFileSync(fileURLToPath(new URL(`../../../migrations/${n}`, import.meta.url)), 'utf8');
const ALL_MIGRATIONS = ['0001_init.sql', '0002_outbox_action.sql', '0003_deals_idempotent_outbox_backoff.sql', '0004_deals_key_includes_strategy.sql', '0005_deal_pipeline.sql'];

/** Minimal D1 adapter over node:sqlite so tests run the REAL SQL these helpers issue. */
function makeD1(sqlite: DatabaseSync): D1Database {
  const prepare = (sql: string) => {
    let bound: unknown[] = [];
    const api: Record<string, unknown> = {
      bind(...vals: unknown[]) { bound = vals; return api; },
      async first<T>() { return (sqlite.prepare(sql).get(...(bound as never[])) ?? null) as T | null; },
      async all<T>() { return { results: sqlite.prepare(sql).all(...(bound as never[])) as T[] }; },
      async run() { const info = sqlite.prepare(sql).run(...(bound as never[])); return { success: true, meta: { changes: Number(info.changes) } }; },
    };
    return api as unknown as D1PreparedStatement;
  };
  return {
    prepare,
    async batch(stmts: D1PreparedStatement[]) { const out: D1Result[] = []; for (const s of stmts) out.push(await s.run()); return out; },
  } as unknown as D1Database;
}

function db(upTo = ALL_MIGRATIONS.length) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const m of ALL_MIGRATIONS.slice(0, upTo)) sqlite.exec(MIG(m));
  return { sqlite, d1: makeD1(sqlite) };
}
const seedUser = (sqlite: DatabaseSync, id = 'u1') =>
  sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run(id, `${id}@x`, id, '2026-01-01T00:00:00Z');
const seedSaved = (sqlite: DatabaseSync, id: string, user: string, strategy: string, params: string) =>
  sqlite.prepare('INSERT INTO saved_deals (id, user_id, strategy, title, url_params, key_figure, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, user, strategy, `Deal ${id}`, params, '£321/mo', '2026-02-0' + id.slice(-1) + 'T00:00:00Z');

describe('saved-deals → pipeline migration (0005)', () => {
  it('migrates every saved deal to a live worth-a-look deal + one verdict snapshot; counts match', () => {
    const { sqlite, d1 } = db(4); // schema up to 0004 (saved_deals exists, pipeline does not yet)
    seedUser(sqlite);
    seedSaved(sqlite, 'a1', 'u1', 'btl', 'postcode=CF37+1HR&price=150000');
    seedSaved(sqlite, 'a2', 'u1', 'flip', 'postcode=SA1+8AJ&price=110000');
    seedSaved(sqlite, 'a3', 'u1', 'hmo', 'postcode=CF10+1AA&price=250000');
    const before = sqlite.prepare('SELECT COUNT(*) n FROM saved_deals').get() as { n: number };

    sqlite.exec(MIG('0005_deal_pipeline.sql')); // run the migration ON the seeded data

    const after = sqlite.prepare('SELECT COUNT(*) n FROM deals').get() as { n: number };
    const verdicts = sqlite.prepare('SELECT COUNT(*) n FROM deal_verdicts').get() as { n: number };
    expect(before.n).toBe(3);
    expect(after.n).toBe(3); // before == after: nothing lost, nothing invented
    expect(verdicts.n).toBe(3); // one snapshot each

    const rows = sqlite.prepare('SELECT * FROM deals ORDER BY id').all() as Record<string, unknown>[];
    for (const r of rows) {
      expect(r.stage).toBe('worth-a-look');
      expect(r.status).toBe('live');
      expect(r.source).toBe('saved-deal-migration');
      expect(r.current_score).toBeNull(); // no score was ever stored — honest NULL
    }
    // ids are reused from saved_deals (that is what makes it idempotent)
    expect(rows.map((r) => r.id).sort()).toEqual(['a1', 'a2', 'a3']);
    // the analyser inputs are preserved in the verdict evidence (nothing lost)
    const v = sqlite.prepare("SELECT evidence_json FROM deal_verdicts WHERE deal_id = 'a1'").get() as { evidence_json: string };
    const ev = JSON.parse(v.evidence_json);
    expect(ev.source).toBe('saved-deal-migration');
    expect(ev.url_params).toBe('postcode=CF37+1HR&price=150000');
    void d1;
  });

  it('is idempotent — re-running the data migration adds nothing', () => {
    const { sqlite } = db(4);
    seedUser(sqlite);
    seedSaved(sqlite, 'a1', 'u1', 'btl', 'p=1');
    seedSaved(sqlite, 'a2', 'u1', 'btl', 'p=2');
    sqlite.exec(MIG('0005_deal_pipeline.sql'));
    sqlite.exec(MIG('0005_deal_pipeline.sql')); // second run — CREATE TABLE IF NOT EXISTS + WHERE NOT EXISTS
    expect((sqlite.prepare('SELECT COUNT(*) n FROM deals').get() as { n: number }).n).toBe(2);
    expect((sqlite.prepare('SELECT COUNT(*) n FROM deal_verdicts').get() as { n: number }).n).toBe(2);
  });

  it('applies cleanly to a FRESH database (no saved deals → zero migrated, tables exist)', () => {
    const { sqlite } = db(); // all migrations on an empty DB
    expect((sqlite.prepare('SELECT COUNT(*) n FROM deals').get() as { n: number }).n).toBe(0);
    for (const t of ['deals', 'deal_stage_history', 'deal_facts', 'deal_verdicts']) {
      expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t)).toBeTruthy();
    }
  });
});

describe('pipeline helpers (P1)', () => {
  it('the 100 cap counts LIVE deals only', () => {
    expect(MAX_LIVE_DEALS).toBe(100);
    expect(canAddLiveDeal(99)).toBe(true);
    expect(canAddLiveDeal(100)).toBe(false);
  });

  it('countLiveDeals excludes dead and done deals', async () => {
    const { sqlite, d1 } = db();
    seedUser(sqlite);
    const mk = async () => (await mkDeal(d1)).id;
    const live1 = await mk(); await mk(); const toDie = await mk(); const toWin = await mk();
    await markDead(d1, toDie, 'worth-a-look', 'chain collapsed');
    await moveStage(d1, toWin, 'nearly-there', 'bought-it'); // ⇒ status done
    expect(await countLiveDeals(d1, 'u1')).toBe(2); // only the two still live
    // dead + done are kept as memory, not deleted
    expect((sqlite.prepare('SELECT COUNT(*) n FROM deals').get() as { n: number }).n).toBe(4);
    void live1;
  });

  it('a new deal writes the deal, an opening stage entry and a first verdict', async () => {
    const { sqlite, d1 } = db();
    seedUser(sqlite);
    const { id: id } = await mkDeal(d1, { strategy: 'flip', title: 'A flip', postcodeSector: 'SA1 8', score: 6.4, criteriaJson: '{"minRoi":12}', evidenceJson: '{"price":110000}' });
    const deal = await getOwnedDeal(d1, 'u1', id);
    expect(deal?.stage).toBe('worth-a-look');
    expect(deal?.status).toBe('live');
    expect(deal?.current_score).toBe(6.4);
    expect((await stageHistory(d1, id)).map((h) => [h.from_stage, h.to_stage])).toEqual([[null, 'worth-a-look']]);
    expect(await dealVerdicts(d1, id)).toHaveLength(1);
  });

  it('recordVerdict snapshots a new score and updates current_score (re-scoring)', async () => {
    const { sqlite, d1 } = db();
    seedUser(sqlite);
    const { id: id } = await mkDeal(d1, { strategy: 'btl', title: 't', postcodeSector: 'CF37 1', score: 7, criteriaJson: '{}', evidenceJson: '{}' });
    await recordVerdict(d1, id, { score: 4.2, criteriaJson: '{}', evidenceJson: '{"downValuation":-20000}' });
    expect((await getOwnedDeal(d1, 'u1', id))?.current_score).toBe(4.2);
    expect(await dealVerdicts(d1, id)).toHaveLength(2); // full history kept
  });

  it('recordFact validates the fact type and appends in time order', async () => {
    const { sqlite, d1 } = db();
    seedUser(sqlite);
    const { id: id } = await mkDeal(d1, { strategy: 'btl', title: 't', postcodeSector: 'CF37 1', score: null, criteriaJson: '{}', evidenceJson: '{}' });
    await recordFact(d1, id, 'builder-quote', '{"amount":18000}');
    await recordFact(d1, id, 'survey-finding', '{"note":"damp"}');
    expect((await dealFacts(d1, id)).map((f) => f.fact_type)).toEqual(['builder-quote', 'survey-finding']);
    await expect(recordFact(d1, id, 'not-a-fact', '{}')).rejects.toThrow(/unknown fact type/);
  });

  it('markDead parks the deal with a reason; deleteDeal removes it and all children', async () => {
    const { sqlite, d1 } = db();
    seedUser(sqlite);
    const { id: id } = await mkDeal(d1, { strategy: 'btl', title: 't', postcodeSector: 'CF37 1', score: 7, criteriaJson: '{}', evidenceJson: '{}' });
    await recordFact(d1, id, 'covenant', '{"detail":"no HMO"}');
    await markDead(d1, id, 'offer-in', 'covenant blocks the plan');
    const dead = await getOwnedDeal(d1, 'u1', id);
    expect(dead?.status).toBe('dead');
    expect(dead?.stage).toBe('parked-dead');
    expect(dead?.dead_reason).toBe('covenant blocks the plan');

    expect(await deleteDeal(d1, 'u1', id)).toBe(true);
    expect(await getOwnedDeal(d1, 'u1', id)).toBeNull();
    for (const t of ['deal_facts', 'deal_verdicts', 'deal_stage_history']) {
      expect((sqlite.prepare(`SELECT COUNT(*) n FROM ${t} WHERE deal_id = ?`).get(id) as { n: number }).n).toBe(0);
    }
    // a stranger cannot delete it
    expect(await deleteDeal(d1, 'someone-else', 'whatever')).toBe(false);
  });

  it('lists live deals oldest-touched first (staleness)', async () => {
    const { sqlite, d1 } = db();
    seedUser(sqlite);
    const { id: a } = await mkDeal(d1, { strategy: 'btl', title: 'A', postcodeSector: 'X', score: 7, criteriaJson: '{}', evidenceJson: '{}' });
    const { id: b } = await mkDeal(d1, { strategy: 'btl', title: 'B', postcodeSector: 'X', score: 7, criteriaJson: '{}', evidenceJson: '{}' });
    // set distinct updated_at so ordering is deterministic (creation can share a ms)
    sqlite.prepare('UPDATE deals SET updated_at = ? WHERE id = ?').run('2026-03-01T00:00:00Z', a);
    sqlite.prepare('UPDATE deals SET updated_at = ? WHERE id = ?').run('2026-01-01T00:00:00Z', b);
    expect((await listLiveDealsByStaleness(d1, 'u1')).map((d) => d.title)).toEqual(['B', 'A']); // oldest first
  });

  it('deleting a user cascades to their deals and every child row (FK)', async () => {
    const { sqlite, d1 } = db();
    seedUser(sqlite);
    const { id: id } = await mkDeal(d1, { strategy: 'btl', title: 't', postcodeSector: 'CF37 1', score: 7, criteriaJson: '{}', evidenceJson: '{}' });
    await recordFact(d1, id, 'ground-rent', '{"annual":250}');
    sqlite.prepare('DELETE FROM users WHERE id = ?').run('u1');
    for (const t of ['deals', 'deal_facts', 'deal_verdicts', 'deal_stage_history']) {
      expect((sqlite.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n).toBe(0);
    }
  });
});

describe('P2 — save originates only from an analyser payload', () => {
  it('parseAnalyserDeal accepts a real analyser body and rejects everything else', () => {
    const ok = parseAnalyserDeal({ strategy: 'btl', title: 'A deal', url_params: 'postcode=CF37+1HR&price=1', score: 7.2, criteria_json: '{"a":1}', evidence_json: '{"b":2}', source: 'extension' }, isDealStrategy);
    expect(ok).not.toBeNull();
    expect(ok!.strategy).toBe('btl');
    expect(ok!.score).toBe(7.2);
    expect(ok!.source).toBe('extension');
    expect(ok!.criteriaJson).toBe('{"a":1}');
    // no analyser payload ⇒ no deal
    expect(parseAnalyserDeal({ strategy: 'btl', title: 'x', url_params: '' }, isDealStrategy)).toBeNull(); // no inputs
    expect(parseAnalyserDeal({ strategy: 'not-a-strategy', title: 'x', url_params: 'p=1' }, isDealStrategy)).toBeNull();
    expect(parseAnalyserDeal({ title: 'x', url_params: 'p=1' }, isDealStrategy)).toBeNull(); // no strategy
    expect(parseAnalyserDeal(null, isDealStrategy)).toBeNull();
    expect(parseAnalyserDeal('nope', isDealStrategy)).toBeNull();
    // coercions: a non-numeric score ⇒ null; a bogus source ⇒ 'analyser'; bad JSON ⇒ '{}'
    const c = parseAnalyserDeal({ strategy: 'btl', title: 'x', url_params: 'p=1', score: 'high', criteria_json: 'not json', source: 'manual' }, isDealStrategy)!;
    expect(c.score).toBeNull();
    expect(c.source).toBe('analyser');
    expect(c.criteriaJson).toBe('{}');
  });

  it('re-saving keeps stage/history; a new snapshot is added; the score is refreshed', async () => {
    const { sqlite, d1 } = db(); seedUser(sqlite);
    const id = crypto.randomUUID();
    const payload = (score: number, title: string) => parseAnalyserDeal({ strategy: 'btl', title, url_params: 'postcode=CF37+1HR&price=1', score, criteria_json: '{}', evidence_json: '{}', source: 'analyser' }, isDealStrategy)!;
    expect(await upsertPipelineDeal(d1, { id, userId: 'u1', postcodeSector: 'CF37 1' }, payload(7, 'first'))).toBe('created');
    await moveStage(d1, id, 'worth-a-look', 'offer-in'); // the user progressed it
    // re-save the same property+strategy (same id)
    expect(await upsertPipelineDeal(d1, { id, userId: 'u1', postcodeSector: 'CF37 1' }, payload(5.5, 'second'))).toBe('updated');
    const deal = await getOwnedDeal(d1, 'u1', id);
    expect(deal?.stage).toBe('offer-in');      // NOT reset to worth-a-look
    expect(deal?.status).toBe('live');
    expect(deal?.current_score).toBe(5.5);     // refreshed
    expect(deal?.title).toBe('second');
    expect(await dealVerdicts(d1, id)).toHaveLength(2); // first + re-save snapshot, history kept
    expect((await stageHistory(d1, id)).map((h) => h.to_stage)).toEqual(['worth-a-look', 'offer-in']); // unchanged by re-save
  });

  it('the LIVE cap blocks a NEW deal (dead/done never count)', async () => {
    const { sqlite, d1 } = db(); seedUser(sqlite);
    const now = '2026-01-01T00:00:00Z';
    // 100 live + 5 dead + 5 done, inserted directly as if already migrated
    for (let i = 0; i < 110; i++) {
      const status = i < 100 ? 'live' : i < 105 ? 'dead' : 'done';
      sqlite.prepare('INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, current_score, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run('d' + i, 'u1', 'btl', 't', '', 'worth-a-look', 7, status, 'analyser', now, now);
    }
    expect(await countLiveDeals(d1, 'u1')).toBe(100);
    const p = parseAnalyserDeal({ strategy: 'btl', title: 'one more', url_params: 'p=new', score: 7, criteria_json: '{}', evidence_json: '{}', source: 'analyser' }, isDealStrategy)!;
    expect(await upsertPipelineDeal(d1, { id: crypto.randomUUID(), userId: 'u1', postcodeSector: '' }, p)).toBe('at-cap');
  });

  it('NO MANUAL ENTRY: the ONLY code that inserts a deal lives in pipeline.ts', () => {
    // Fails loudly if any future sprint adds an INSERT INTO deals anywhere else.
    const SRC = fileURLToPath(new URL('../../', import.meta.url)); // packages/web/src
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });
    const offenders = walk(SRC)
      // every JS/TS source flavour, tests excluded — a raw insert could hide in a .mts/.cts/.js too
      .filter((p) => /\.(m|c)?(t|j)sx?$/.test(p) && !/\.test\.[a-z]+$/.test(p))
      .filter((p) => DEAL_INSERT_RE.test(readFileSync(p, 'utf8')))
      .map((p) => basename(p));
    expect(offenders).toEqual(['pipeline.ts']);
  });

  it('the guardrail regex catches every deal-creating SQL phrasing, not just plain INSERT INTO', () => {
    // Proves the guardrail is NOT vacuous: INSERT OR REPLACE / OR IGNORE and REPLACE INTO
    // are all standard SQLite ways to create a deals row and MUST trip the guard.
    for (const sql of [
      'INSERT INTO deals (id) VALUES (?)',
      'INSERT OR REPLACE INTO deals (id) VALUES (?)',
      'INSERT OR IGNORE INTO deals (id) VALUES (?)',
      'INSERT OR ABORT INTO deals (id) VALUES (?)',
      'REPLACE INTO deals (id) VALUES (?)',
      'insert   into   deals(id)',
    ]) expect(DEAL_INSERT_RE.test(sql)).toBe(true);
    // and it must NOT false-positive on the sibling saved_deals table
    for (const sql of [
      'INSERT INTO saved_deals (id) VALUES (?)',
      'REPLACE INTO saved_deals (id) VALUES (?)',
      'SELECT * FROM deals',
    ]) expect(DEAL_INSERT_RE.test(sql)).toBe(false);
  });
});
