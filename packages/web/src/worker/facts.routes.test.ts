import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from './index';
import { SESSION_COOKIE } from './lib/cookies';
import { signSession } from './lib/jwt';
import { features } from '../config/features';

/**
 * The fact routes (P5): who may add one, what is stored, that it can be taken
 * back, and that EVERY re-score leaves a verdict snapshot behind — P6 reads that
 * history and it has to be complete from the very first fact.
 */
const MIG = (n: string) => readFileSync(fileURLToPath(new URL(`../../migrations/${n}`, import.meta.url)), 'utf8');
const MIGRATIONS = [
  '0001_init.sql', '0002_outbox_action.sql', '0003_deals_idempotent_outbox_backoff.sql',
  '0004_deals_key_includes_strategy.sql', '0005_deal_pipeline.sql', '0006_deal_headline_figure.sql',
  '0007_deal_is_auction.sql', '0008_deal_verdict_line.sql', '0012_deal_sold_evidence.sql', '0013_deal_changes.sql', '0014_folded_facts_and_room_sizes.sql', '0015_deal_dates_and_staleness.sql', '0016_deal_deaths.sql',
];

function makeD1(sqlite: DatabaseSync): Env['DB'] {
  const prepare = (sql: string) => {
    let bound: unknown[] = [];
    const api: Record<string, unknown> = {
      bind(...v: unknown[]) { bound = v; return api; },
      async first<T>() { return (sqlite.prepare(sql).get(...(bound as never[])) ?? null) as T | null; },
      async all<T>() { return { results: sqlite.prepare(sql).all(...(bound as never[])) as T[] }; },
      async run() { const i = sqlite.prepare(sql).run(...(bound as never[])); return { success: true, meta: { changes: Number(i.changes) } }; },
    };
    return api;
  };
  return { prepare, async batch(sts: { run: () => Promise<unknown> }[]) { return Promise.all(sts.map((s) => s.run())); } } as unknown as Env['DB'];
}

let sqlite: DatabaseSync;
const env = (): Env => ({ ASSETS: { fetch: async () => new Response('a') }, DB: makeD1(sqlite), JWT_SECRET: 'test-secret', GOOGLE_CLIENT_SECRET: 'x', TURNSTILE_SECRET: 'x', KIT_API_KEY: 'k' }) as Env;
const authed = async (user = 'u1') => ({ Cookie: `${SESSION_COOKIE}=${await signSession({ sub: user, email: `${user}@t.test`, name: 'T', avatar: '' }, 'test-secret')}` });

const DEAL = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const count = (t: string, where = '') => (sqlite.prepare(`SELECT COUNT(*) n FROM ${t} ${where}`).get() as { n: number }).n;

const addFact = async (body: Record<string, unknown>, headers: Record<string, string>, deal = DEAL) =>
  worker.fetch(new Request(`https://s.test/api/deals/${deal}/facts`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), env());

const rescore = async (headers: Record<string, string>, body: Record<string, unknown>) =>
  worker.fetch(new Request(`https://s.test/api/deals/${DEAL}/score`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ score: 6.1, verdict_line: 'The quote eats the margin', headline_figure: 'ROI 8%', criteria_json: '{}', evidence_json: '{}', ...body }),
  }), env());

beforeEach(() => {
  features.dealPipeline = true;
  features.dealFacts = true;
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const m of MIGRATIONS) sqlite.exec(MIG(m));
  for (const u of ['u1', 'u2']) {
    sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run(u, `${u}@t`, u, '2026-01-01T00:00:00Z');
  }
  const ins = sqlite.prepare('INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, current_score, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  ins.run(DEAL, 'u1', 'brrrr', 'Terraced · CF11 9AB · £120,000', 'CF11 9', 'getting-real-numbers', 7.1, 'live', 'analyser', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z');
  ins.run(OTHER, 'u2', 'btl', 'Someone else’s', 'CF10 1', 'worth-a-look', 5, 'live', 'analyser', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z');
});
afterEach(() => { features.dealPipeline = true; features.dealFacts = true; });

describe('adding a fact', () => {
  it('stores the number and the note, and hands back the new id', async () => {
    const res = await addFact({ fact_type: 'builder-quote', value: 48000, note: 'Two quotes, took the lower' }, await authed());
    expect(res.status).toBe(200);
    const { id } = await res.json() as { id: string };
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const row = sqlite.prepare('SELECT * FROM deal_facts').get() as Record<string, string>;
    expect(row.fact_type).toBe('builder-quote');
    expect(JSON.parse(row.value_json)).toEqual({ value: 48000, note: 'Two quotes, took the lower' });
    // the deal is touched, so the board's staleness ordering stays honest
    expect((sqlite.prepare('SELECT updated_at u FROM deals WHERE id = ?').get(DEAL) as { u: string }).u).not.toBe('2026-09-01T00:00:00Z');
  });

  it('hands back the SERVER’s timestamp, so a fold window can never miss the fact', async () => {
    const res = await addFact({ fact_type: 'builder-quote', value: 48000 }, await authed());
    const { entered_at: at } = await res.json() as { entered_at: string };
    const stored = (sqlite.prepare('SELECT entered_at e FROM deal_facts').get() as { e: string }).e;
    expect(at).toBe(stored);
  });

  it('a flag carries no number at all — nothing is invented for it', async () => {
    const res = await addFact({ fact_type: 'covenant', value: null, note: '' }, await authed());
    expect(res.status).toBe(200);
    const row = sqlite.prepare('SELECT * FROM deal_facts').get() as Record<string, string>;
    expect(JSON.parse(row.value_json)).toEqual({ value: null, note: null });
  });

  it('rounds the number and caps the note; refuses a silly figure', async () => {
    await addFact({ fact_type: 'builder-quote', value: 48000.7, note: 'x'.repeat(400) }, await authed());
    const v = JSON.parse((sqlite.prepare('SELECT value_json v FROM deal_facts').get() as { v: string }).v) as { value: number; note: string };
    expect(v.value).toBe(48001);
    expect(v.note.length).toBe(200);
    expect((await addFact({ fact_type: 'builder-quote', value: -1 }, await authed())).status).toBe(400);
  });

  it('refuses a fact type that is not in the config', async () => {
    expect((await addFact({ fact_type: 'made-up', value: 1 }, await authed())).status).toBe(400);
    expect(count('deal_facts')).toBe(0);
  });

  it('a signed-out visitor cannot add one, and nobody can add one to someone else’s deal', async () => {
    expect((await addFact({ fact_type: 'builder-quote', value: 1 }, {})).status).toBe(401);
    expect((await addFact({ fact_type: 'builder-quote', value: 1 }, await authed(), OTHER)).status).toBe(404);
    expect(count('deal_facts')).toBe(0);
  });

  it('the flag turns the whole thing off: the routes stop existing', async () => {
    features.dealFacts = false;
    expect((await addFact({ fact_type: 'builder-quote', value: 1 }, await authed())).status).toBe(404);
    const del = await worker.fetch(new Request(`https://s.test/api/deals/${DEAL}/facts/${OTHER}`, { method: 'DELETE', headers: await authed() }), env());
    expect(del.status).toBe(404);
    expect(count('deal_facts')).toBe(0);
  });
});

describe('taking a fact back', () => {
  const del = async (factId: string, headers: Record<string, string>) =>
    worker.fetch(new Request(`https://s.test/api/deals/${DEAL}/facts/${factId}`, { method: 'DELETE', headers }), env());

  it('the person who entered it can delete it', async () => {
    const { id } = await (await addFact({ fact_type: 'builder-quote', value: 48000 }, await authed())).json() as { id: string };
    expect(count('deal_facts')).toBe(1);
    expect((await del(id, await authed())).status).toBe(200);
    expect(count('deal_facts')).toBe(0);
  });

  it('nobody else can, and an unknown fact is a 404 not a silent success', async () => {
    const { id } = await (await addFact({ fact_type: 'builder-quote', value: 48000 }, await authed())).json() as { id: string };
    expect((await del(id, await authed('u2'))).status).toBe(404);
    expect((await del(OTHER, await authed())).status).toBe(404);
    expect(count('deal_facts')).toBe(1);
  });
});

describe('the fact and the score it caused are ONE write', () => {
  const SCORE = {
    score: 6.8, verdict_line: 'The quote eats the margin', headline_figure: '£16,341 left in',
    criteria_json: JSON.stringify({ params: 'price=105000&refurbCost=48000' }),
    evidence_json: JSON.stringify({ facts: [{ type: 'builder-quote', value: 48000 }] }),
  };

  it('adding a fact stores the fact, the new score and its snapshot together', async () => {
    const res = await addFact({ fact_type: 'builder-quote', value: 48000, ...SCORE }, await authed());
    expect(res.status).toBe(200);
    expect(count('deal_facts')).toBe(1);
    expect(count('deal_verdicts')).toBe(1);
    const d = sqlite.prepare('SELECT * FROM deals WHERE id = ?').get(DEAL) as Record<string, unknown>;
    expect(d.current_score).toBe(6.8);
    expect(d.verdict_line).toBe('The quote eats the margin');
    expect(d.headline_figure).toBe('£16,341 left in');
    const v = sqlite.prepare('SELECT * FROM deal_verdicts').get() as Record<string, string | number>;
    expect(v.score).toBe(6.8);
    expect(JSON.parse(v.criteria_json as string).params).toContain('refurbCost=48000');
    expect(JSON.parse(v.evidence_json as string).facts[0].value).toBe(48000);
  });

  it('a fact that moves nothing changes no score and writes no snapshot', async () => {
    await addFact({ fact_type: 'covenant', value: null }, await authed());
    expect(count('deal_facts')).toBe(1);
    expect(count('deal_verdicts')).toBe(0);
    expect((sqlite.prepare('SELECT current_score s FROM deals WHERE id = ?').get(DEAL) as { s: number }).s).toBe(7.1);
  });

  it('removing a fact puts the score back in the same write', async () => {
    const { id } = await (await addFact({ fact_type: 'builder-quote', value: 48000, ...SCORE }, await authed())).json() as { id: string };
    const del = await worker.fetch(new Request(`https://s.test/api/deals/${DEAL}/facts/${id}`, {
      method: 'DELETE', headers: { ...await authed(), 'content-type': 'application/json' },
      body: JSON.stringify({ score: 9.4, verdict_line: 'All your cash back out', headline_figure: 'All money out', criteria_json: '{}', evidence_json: '{"facts":[]}' }),
    }), env());
    expect(del.status).toBe(200);
    expect(count('deal_facts')).toBe(0);
    expect((sqlite.prepare('SELECT current_score s FROM deals WHERE id = ?').get(DEAL) as { s: number }).s).toBe(9.4);
    expect(count('deal_verdicts')).toBe(2); // the fact, and the deal put back
  });

  it('a snapshot that is not valid JSON is stored as empty, never as broken JSON', async () => {
    await addFact({ fact_type: 'builder-quote', value: 48000, score: 6.8, criteria_json: '{"params":"' + 'x'.repeat(4100), evidence_json: 'not json' }, await authed());
    const v = sqlite.prepare('SELECT * FROM deal_verdicts').get() as Record<string, string>;
    expect(() => JSON.parse(v.criteria_json)).not.toThrow();
    expect(() => JSON.parse(v.evidence_json)).not.toThrow();
    expect(v.criteria_json).toBe('{}');
  });

  it('a score outside 0-10 is refused, and the fact is not stored either', async () => {
    expect((await addFact({ fact_type: 'builder-quote', value: 48000, score: 42 }, await authed())).status).toBe(400);
    expect(count('deal_facts')).toBe(0);
    expect(count('deal_verdicts')).toBe(0);
  });
});

describe('every re-score writes a verdict snapshot', () => {
  it('the score, what it was judged against, and the evidence at that moment', async () => {
    const res = await rescore(await authed(), {
      criteria_json: JSON.stringify({ params: 'price=120000&refurbCost=48000' }),
      evidence_json: JSON.stringify({ facts: [{ type: 'builder-quote', value: 48000, at: '2026-09-04T09:00:00.000Z' }] }),
    });
    expect(res.status).toBe(200);
    expect(count('deal_verdicts')).toBe(1);
    const v = sqlite.prepare('SELECT * FROM deal_verdicts').get() as Record<string, string | number>;
    expect(v.score).toBe(6.1);
    expect(JSON.parse(v.criteria_json as string).params).toContain('refurbCost=48000');
    expect(JSON.parse(v.evidence_json as string).facts[0].value).toBe(48000);
    expect((sqlite.prepare('SELECT current_score s, verdict_line l FROM deals WHERE id = ?').get(DEAL) as { s: number; l: string }).s).toBe(6.1);
  });

  it('a snapshot per re-score, never one overwritten — the history is the point', async () => {
    await rescore(await authed(), { score: 6.1 });
    await rescore(await authed(), { score: 5.4 });
    await rescore(await authed(), { score: 7.1 }); // the fact removed again
    expect(count('deal_verdicts')).toBe(3);
    const scores = (sqlite.prepare('SELECT score FROM deal_verdicts ORDER BY at, rowid').all() as { score: number }[]).map((r) => r.score);
    expect(scores).toEqual([6.1, 5.4, 7.1]);
  });

  it('someone else’s deal cannot be re-scored, and nothing is snapshotted for it', async () => {
    const res = await worker.fetch(new Request(`https://s.test/api/deals/${OTHER}/score`, {
      method: 'POST', headers: { ...await authed(), 'content-type': 'application/json' }, body: JSON.stringify({ score: 1 }),
    }), env());
    expect(res.status).toBe(404);
    expect(count('deal_verdicts')).toBe(0);
  });
});

describe('a verdict change (P6) is stored with the fact that caused it', () => {
  const SCORE = { score: 6.8, verdict_line: 'The quote eats the margin', headline_figure: '£16,341 left in', criteria_json: '{}', evidence_json: '{}' };
  const CHANGE = { from_score: 9.4, to_score: 6.8, previous_value: 30000, to_verdict_line: '£16,341 would stay stuck after refinancing.' };
  const changes = () => sqlite.prepare('SELECT * FROM deal_changes').all() as Record<string, unknown>[];

  beforeEach(() => { features.verdictChanges = true; });
  afterEach(() => { features.verdictChanges = true; });

  it('stores the facts of the change, never a finished sentence', async () => {
    const res = await addFact({ fact_type: 'builder-quote', value: 48000, ...SCORE, change: CHANGE }, await authed());
    const { changeId } = await res.json() as { changeId: string };
    expect(changeId).toMatch(/^[0-9a-f-]{36}$/);
    const c = changes()[0];
    expect(c.fact_type).toBe('builder-quote');
    expect(c.fact_value).toBe(48000);
    expect(c.previous_value).toBe(30000);
    expect(c.from_score).toBe(9.4);
    expect(c.to_score).toBe(6.8);
    expect(c.to_verdict_line).toBe('£16,341 would stay stuck after refinancing.');
    expect(c.acknowledged_at).toBeNull();
  });

  it('a fact sent without a change stores none — the browser decides what is news', async () => {
    await addFact({ fact_type: 'builder-quote', value: 48000, ...SCORE }, await authed());
    expect(changes().length).toBe(0);
  });

  it('refuses a change with impossible scores, and stores no fact either', async () => {
    const res = await addFact({ fact_type: 'builder-quote', value: 48000, ...SCORE, change: { ...CHANGE, to_score: 42 } }, await authed());
    expect(res.status).toBe(400);
    expect(count('deal_facts')).toBe(0);
    expect(changes().length).toBe(0);
  });

  it('the board is handed only what nobody has seen, and acknowledging removes it', async () => {
    const { changeId } = await (await addFact({ fact_type: 'builder-quote', value: 48000, ...SCORE, change: CHANGE }, await authed())).json() as { changeId: string };
    const list = async () => (await (await worker.fetch(new Request('https://s.test/api/deals', { headers: await authed() }), env())).json() as { changes: unknown[] }).changes;
    expect((await list()).length).toBe(1);
    const ack = await worker.fetch(new Request(`https://s.test/api/deals/${DEAL}/changes/${changeId}/ack`, { method: 'POST', headers: await authed() }), env());
    expect(ack.status).toBe(200);
    expect((await list()).length, 'it survives a reload only until it is seen').toBe(0);
    expect(changes()[0].acknowledged_at, 'and the row is kept for P8').toBeTruthy();
  });

  it('nobody can acknowledge someone else’s change', async () => {
    const { changeId } = await (await addFact({ fact_type: 'builder-quote', value: 48000, ...SCORE, change: CHANGE }, await authed())).json() as { changeId: string };
    const res = await worker.fetch(new Request(`https://s.test/api/deals/${DEAL}/changes/${changeId}/ack`, { method: 'POST', headers: await authed('u2') }), env());
    expect(res.status).toBe(404);
    expect(changes()[0].acknowledged_at).toBeNull();
  });

  it('the score history is the snapshots, oldest first, and only for your own deal', async () => {
    await addFact({ fact_type: 'builder-quote', value: 48000, ...SCORE, change: CHANGE }, await authed());
    const res = await worker.fetch(new Request(`https://s.test/api/deals/${DEAL}/history`, { headers: await authed() }), env());
    const { points } = await res.json() as { points: { score: number }[] };
    expect(points.map((p) => p.score)).toEqual([6.8]);
    const theirs = await worker.fetch(new Request(`https://s.test/api/deals/${OTHER}/history`, { headers: await authed() }), env());
    expect((await theirs.json() as { points: unknown[] }).points).toEqual([]);
  });

  it('with the flag off nothing is announced and both routes are gone', async () => {
    features.verdictChanges = false;
    await addFact({ fact_type: 'builder-quote', value: 48000, ...SCORE, change: CHANGE }, await authed());
    expect(count('deal_facts'), 'the fact still lands and still re-scores').toBe(1);
    expect(changes().length).toBe(0);
    const ack = await worker.fetch(new Request(`https://s.test/api/deals/${DEAL}/changes/11111111-1111-4111-8111-111111111112/ack`, { method: 'POST', headers: await authed() }), env());
    expect(ack.status).toBe(404);
    const hist = await worker.fetch(new Request(`https://s.test/api/deals/${DEAL}/history`, { headers: await authed() }), env());
    expect(hist.status).toBe(404);
  });
});

describe('the board is handed the facts to apply itself', () => {
  it('GET /api/deals returns this user’s facts, parsed, and never anyone else’s', async () => {
    await addFact({ fact_type: 'builder-quote', value: 48000, note: 'Two quotes' }, await authed());
    sqlite.prepare('INSERT INTO deal_facts (id, deal_id, fact_type, value_json, entered_at) VALUES (?, ?, ?, ?, ?)')
      .run('33333333-3333-4333-8333-333333333333', OTHER, 'survey-finding', '{"value":900}', '2026-09-02T00:00:00Z');
    const res = await worker.fetch(new Request('https://s.test/api/deals', { headers: await authed() }), env());
    const body = await res.json() as { facts: { deal_id: string; fact_type: string; value: number; note: string | null }[] };
    expect(body.facts.length).toBe(1);
    expect(body.facts[0]).toMatchObject({ deal_id: DEAL, fact_type: 'builder-quote', value: 48000, note: 'Two quotes' });
  });

  it('with the flag off the board is handed no facts at all', async () => {
    await addFact({ fact_type: 'builder-quote', value: 48000 }, await authed());
    features.dealFacts = false;
    const res = await worker.fetch(new Request('https://s.test/api/deals', { headers: await authed() }), env());
    expect((await res.json() as { facts: unknown[] }).facts).toEqual([]);
  });
});
