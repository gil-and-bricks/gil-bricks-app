import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  countLiveDeals, canAddLiveDeal, MAX_LIVE_DEALS, listLiveDealsByStaleness,
  createDealFromAnalyser, recordVerdict, recordFact, moveStage, markDead, deleteDeal,
  dealFacts, dealVerdicts, stageHistory, getOwnedDeal,
} from './pipeline';

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
    const mk = () => createDealFromAnalyser(d1, { userId: 'u1', strategy: 'btl', title: 't', postcodeSector: 'CF37 1', score: 7, criteriaJson: '{}', evidenceJson: '{}', source: 'analyser' });
    const live1 = await mk(); await mk(); const toDie = await mk(); const toWin = await mk();
    await markDead(d1, toDie, 'worth-a-look', 'chain collapsed');
    await moveStage(d1, toWin, 'nearly-there', 'bought-it'); // ⇒ status done
    expect(await countLiveDeals(d1, 'u1')).toBe(2); // only the two still live
    // dead + done are kept as memory, not deleted
    expect((sqlite.prepare('SELECT COUNT(*) n FROM deals').get() as { n: number }).n).toBe(4);
    void live1;
  });

  it('createDealFromAnalyser writes the deal, an opening stage entry and a first verdict', async () => {
    const { sqlite, d1 } = db();
    seedUser(sqlite);
    const id = await createDealFromAnalyser(d1, { userId: 'u1', strategy: 'flip', title: 'A flip', postcodeSector: 'SA1 8', score: 6.4, criteriaJson: '{"minRoi":12}', evidenceJson: '{"price":110000}', source: 'analyser' });
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
    const id = await createDealFromAnalyser(d1, { userId: 'u1', strategy: 'btl', title: 't', postcodeSector: 'CF37 1', score: 7, criteriaJson: '{}', evidenceJson: '{}', source: 'analyser' });
    await recordVerdict(d1, id, { score: 4.2, criteriaJson: '{}', evidenceJson: '{"downValuation":-20000}' });
    expect((await getOwnedDeal(d1, 'u1', id))?.current_score).toBe(4.2);
    expect(await dealVerdicts(d1, id)).toHaveLength(2); // full history kept
  });

  it('recordFact validates the fact type and appends in time order', async () => {
    const { sqlite, d1 } = db();
    seedUser(sqlite);
    const id = await createDealFromAnalyser(d1, { userId: 'u1', strategy: 'btl', title: 't', postcodeSector: 'CF37 1', score: null, criteriaJson: '{}', evidenceJson: '{}', source: 'analyser' });
    await recordFact(d1, id, 'builder-quote', '{"amount":18000}');
    await recordFact(d1, id, 'survey-finding', '{"note":"damp"}');
    expect((await dealFacts(d1, id)).map((f) => f.fact_type)).toEqual(['builder-quote', 'survey-finding']);
    await expect(recordFact(d1, id, 'not-a-fact', '{}')).rejects.toThrow(/unknown fact type/);
  });

  it('markDead parks the deal with a reason; deleteDeal removes it and all children', async () => {
    const { sqlite, d1 } = db();
    seedUser(sqlite);
    const id = await createDealFromAnalyser(d1, { userId: 'u1', strategy: 'btl', title: 't', postcodeSector: 'CF37 1', score: 7, criteriaJson: '{}', evidenceJson: '{}', source: 'analyser' });
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
    const a = await createDealFromAnalyser(d1, { userId: 'u1', strategy: 'btl', title: 'A', postcodeSector: 'X', score: 7, criteriaJson: '{}', evidenceJson: '{}', source: 'analyser' });
    const b = await createDealFromAnalyser(d1, { userId: 'u1', strategy: 'btl', title: 'B', postcodeSector: 'X', score: 7, criteriaJson: '{}', evidenceJson: '{}', source: 'analyser' });
    // set distinct updated_at so ordering is deterministic (creation can share a ms)
    sqlite.prepare('UPDATE deals SET updated_at = ? WHERE id = ?').run('2026-03-01T00:00:00Z', a);
    sqlite.prepare('UPDATE deals SET updated_at = ? WHERE id = ?').run('2026-01-01T00:00:00Z', b);
    expect((await listLiveDealsByStaleness(d1, 'u1')).map((d) => d.title)).toEqual(['B', 'A']); // oldest first
  });

  it('deleting a user cascades to their deals and every child row (FK)', async () => {
    const { sqlite, d1 } = db();
    seedUser(sqlite);
    const id = await createDealFromAnalyser(d1, { userId: 'u1', strategy: 'btl', title: 't', postcodeSector: 'CF37 1', score: 7, criteriaJson: '{}', evidenceJson: '{}', source: 'analyser' });
    await recordFact(d1, id, 'ground-rent', '{"annual":250}');
    sqlite.prepare('DELETE FROM users WHERE id = ?').run('u1');
    for (const t of ['deals', 'deal_facts', 'deal_verdicts', 'deal_stage_history']) {
      expect((sqlite.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n).toBe(0);
    }
  });
});
