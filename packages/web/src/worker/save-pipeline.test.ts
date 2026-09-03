import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from './index';
import { SESSION_COOKIE } from './lib/cookies';
import { signSession } from './lib/jwt';
import { siteConfig } from '../site.config';
import { LIVE_CAP_MESSAGE } from '../config/pipeline';

const MIG = (n: string) => readFileSync(fileURLToPath(new URL(`../../migrations/${n}`, import.meta.url)), 'utf8');
const MIGRATIONS = ['0001_init.sql', '0002_outbox_action.sql', '0003_deals_idempotent_outbox_backoff.sql', '0004_deals_key_includes_strategy.sql', '0005_deal_pipeline.sql', '0006_deal_headline_figure.sql', '0007_deal_is_auction.sql'];

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
const save = async (headers: Record<string, string>, body: Record<string, unknown>) =>
  worker.fetch(new Request('https://s.test/api/deals', {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ strategy: 'btl', title: 'A · CF37 1HR · £150,000', url_params: 'postcode=CF37+1HR&price=150000', key_figure: 'ROI 12%', headline_figure: '£250/mo', score: 7.2, criteria_json: '{"minRoi":12}', evidence_json: '{"sources":{"price":"listing"}}', postcode_sector: 'CF37 1', source: 'analyser', ...body }),
  }), env());
const count = (t: string, where = '') => (sqlite.prepare(`SELECT COUNT(*) n FROM ${t} ${where}`).get() as { n: number }).n;

beforeEach(() => {
  siteConfig.features.dealPipeline = false; // explicit baseline; flag-ON describes opt in. Robust to the committed default.
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const m of MIGRATIONS) sqlite.exec(MIG(m));
  sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run('u1', 'u1@t', 'T', '2026-01-01T00:00:00Z');
});
afterEach(() => { siteConfig.features.dealPipeline = false; });

describe('save writes a pipeline deal (flag ON)', () => {
  beforeEach(() => { siteConfig.features.dealPipeline = true; });

  it('writes a deal + opening stage entry + first verdict, and reports pipeline:true', async () => {
    const res = await save(await authed(), {});
    expect(res.status).toBe(200);
    const b = await res.json() as { ok: boolean; pipeline: boolean; updated: boolean; id: string };
    expect(b.pipeline).toBe(true);
    expect(b.updated).toBe(false);
    expect(count('deals')).toBe(1);
    expect(count('deal_verdicts')).toBe(1);
    expect(count('deal_stage_history')).toBe(1);
    const d = sqlite.prepare('SELECT * FROM deals').get() as Record<string, unknown>;
    expect(d.stage).toBe('worth-a-look');
    expect(d.status).toBe('live');
    expect(d.current_score).toBe(7.2);
    expect(d.postcode_sector).toBe('CF37 1');
    expect(d.source).toBe('analyser');
    expect(d.headline_figure).toBe('£250/mo'); // the board card's strategy-appropriate figure (P3)
    const v = sqlite.prepare('SELECT * FROM deal_verdicts').get() as Record<string, unknown>;
    expect(v.score).toBe(7.2);
    expect(JSON.parse(v.criteria_json as string).minRoi).toBe(12);
    expect(JSON.parse(v.evidence_json as string).sources.price).toBe('listing');
    // the legacy list still works (mirrored into saved_deals with the same id)
    expect(count('saved_deals')).toBe(1);
    expect((sqlite.prepare('SELECT id FROM saved_deals').get() as { id: string }).id).toBe(b.id);
  });

  it('records the arrival source honestly (extension vs analyser)', async () => {
    await save(await authed(), { source: 'extension' });
    expect((sqlite.prepare('SELECT source FROM deals').get() as { source: string }).source).toBe('extension');
  });

  it('re-saving the same property+strategy updates + adds a verdict, and NEVER resets a progressed stage', async () => {
    const h = await authed();
    const first = await (await save(h, {})).json() as { id: string };
    // the user progresses the deal
    sqlite.prepare("UPDATE deals SET stage = 'offer-in', updated_at = ? WHERE id = ?").run('2026-02-01T00:00:00Z', first.id);
    const res = await save(h, { title: 'A · updated', score: 5.1, headline_figure: '£300/mo' });
    const b = await res.json() as { updated: boolean };
    expect(b.updated).toBe(true);
    expect(count('deals')).toBe(1);          // still one deal
    expect(count('deal_verdicts')).toBe(2);  // history kept + new snapshot
    const d = sqlite.prepare('SELECT * FROM deals').get() as Record<string, unknown>;
    expect(d.stage).toBe('offer-in');        // NOT reset to worth-a-look
    expect(d.current_score).toBe(5.1);       // refreshed
    expect(d.headline_figure).toBe('£300/mo'); // board figure refreshed on re-score
  });

  it('the same property under a DIFFERENT strategy is a separate deal', async () => {
    const h = await authed();
    await save(h, { strategy: 'btl' });
    await save(h, { strategy: 'flip' }); // same url_params, different strategy
    expect(count('deals')).toBe(2);
    expect(count('deals', "WHERE strategy = 'btl'")).toBe(1);
    expect(count('deals', "WHERE strategy = 'flip'")).toBe(1);
  });

  it('the LIVE cap returns the helpful config message (dead/done do not count)', async () => {
    const now = '2026-01-01T00:00:00Z';
    for (let i = 0; i < 100; i++) {
      sqlite.prepare('INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, current_score, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run('live' + i, 'u1', 'btl', 't', '', 'worth-a-look', 7, 'live', 'analyser', now, now);
    }
    const res = await save(await authed(), { url_params: 'postcode=CF37+1HR&price=999' });
    expect(res.status).toBe(409);
    expect((await res.json() as { error: string }).error).toBe(LIVE_CAP_MESSAGE);
    expect(count('deals')).toBe(100);        // the new deal was NOT created
    // requirement #3: an at-cap save leaves NO stray rows behind (cap is checked
    // BEFORE any write). Guards against a refactor that mirrors saved_deals first.
    expect(count('saved_deals')).toBe(0);
    expect(count('deal_verdicts')).toBe(0);
  });

  it('deleting a deal removes its pipeline row too, so re-saving is a fresh single deal (no orphan, cap freed)', async () => {
    const h = await authed();
    const first = await (await save(h, {})).json() as { id: string };
    sqlite.prepare("UPDATE deals SET stage = 'offer-in' WHERE id = ?").run(first.id); // progress it
    const del = await worker.fetch(new Request(`https://s.test/api/deals/${first.id}`, { method: 'DELETE', headers: h }), env());
    expect(del.status).toBe(200);
    expect(count('deals')).toBe(0);          // pipeline deal gone (not orphaned)
    expect(count('deal_verdicts')).toBe(0);
    expect(count('deal_stage_history')).toBe(0);
    expect(count('saved_deals')).toBe(0);
    // re-save the SAME property+strategy -> exactly ONE fresh deal at the opening stage
    const again = await (await save(h, {})).json() as { updated: boolean };
    expect(again.updated).toBe(false);
    expect(count('deals')).toBe(1);
    expect((sqlite.prepare('SELECT stage FROM deals').get() as { stage: string }).stage).toBe('worth-a-look');
  });
});

describe('flag OFF — nothing changes (today’s behaviour)', () => {
  it('saves to saved_deals only, writes NO pipeline deal, and returns no pipeline flag', async () => {
    expect(siteConfig.features.dealPipeline).toBe(false);
    const res = await save(await authed(), {});
    expect(res.status).toBe(200);
    const b = await res.json() as { ok: boolean; pipeline?: boolean };
    expect(b.ok).toBe(true);
    expect(b.pipeline).toBeUndefined();
    expect(count('saved_deals')).toBe(1);
    expect(count('deals')).toBe(0);          // pipeline untouched
    expect(count('deal_verdicts')).toBe(0);
  });

  it('deleting a saved deal ALSO removes its (migrated) pipeline row — even flag off — so no orphan leaks the cap', async () => {
    expect(siteConfig.features.dealPipeline).toBe(false);
    const h = await authed();
    // a migrated deal: a saved_deals row + a matching live deals row with the same id
    // (what the 0005 backfill produces), present even while the pipeline UI is off.
    const now = '2026-01-01T00:00:00Z';
    const mid = crypto.randomUUID(); // the DELETE route requires a 36-char uuid
    sqlite.prepare('INSERT INTO saved_deals (id, user_id, strategy, title, url_params, key_figure, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(mid, 'u1', 'btl', 't', 'p=1', 'ROI 6%', now);
    sqlite.prepare('INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, current_score, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(mid, 'u1', 'btl', 't', '', 'worth-a-look', null, 'live', 'saved-deal-migration', now, now);
    const del = await worker.fetch(new Request(`https://s.test/api/deals/${mid}`, { method: 'DELETE', headers: h }), env());
    expect(del.status).toBe(200);
    expect(count('saved_deals')).toBe(0);
    expect(count('deals')).toBe(0); // the pipeline row is gone too — not orphaned
  });
});

const list = async (headers: Record<string, string>) =>
  worker.fetch(new Request('https://s.test/api/deals', { method: 'GET', headers }), env());

describe('the board list (GET /api/deals)', () => {
  it('flag ON returns pipeline board data — stage, score, figure, url_params + live count vs cap', async () => {
    siteConfig.features.dealPipeline = true;
    const h = await authed();
    await save(h, { strategy: 'btl', url_params: 'postcode=CF37+1HR&price=150000' });
    await save(h, { strategy: 'flip', url_params: 'postcode=CF37+1HR&price=150000', headline_figure: '£30,000 profit', score: 3.4 });
    // progress one and kill nothing; the live count = both
    const res = await list(h);
    expect(res.status).toBe(200);
    const b = await res.json() as { pipeline: boolean; deals: Record<string, unknown>[]; liveCount: number; cap: number };
    expect(b.pipeline).toBe(true);
    expect(b.cap).toBe(100);
    expect(b.liveCount).toBe(2);
    expect(b.deals).toHaveLength(2);
    const btl = b.deals.find((d) => d.strategy === 'btl')!;
    expect(btl.stage).toBe('worth-a-look');
    expect(btl.headline_figure).toBe('£250/mo');
    expect(btl.url_params).toBe('postcode=CF37+1HR&price=150000'); // joined from saved_deals, opens the analyser
    expect(typeof btl.current_score).toBe('number');
    const flip = b.deals.find((d) => d.strategy === 'flip')!;
    expect(flip.headline_figure).toBe('£30,000 profit');
  });

  it('a dead deal drops out of the live count but is still returned (board tucks it away)', async () => {
    siteConfig.features.dealPipeline = true;
    const h = await authed();
    const first = await (await save(h, {})).json() as { id: string };
    sqlite.prepare("UPDATE deals SET stage = 'parked-dead', status = 'dead' WHERE id = ?").run(first.id);
    const b = await (await list(h)).json() as { deals: Record<string, unknown>[]; liveCount: number };
    expect(b.deals).toHaveLength(1);
    expect(b.liveCount).toBe(0); // dead deals never count toward the cap
  });

  it('flag OFF returns exactly today’s flat shape (no pipeline field)', async () => {
    expect(siteConfig.features.dealPipeline).toBe(false);
    const h = await authed();
    await save(h, {});
    const b = await (await list(h)).json() as { deals: Record<string, unknown>[]; max?: number; pipeline?: boolean };
    expect(b.pipeline).toBeUndefined();
    expect(b.max).toBe(100);
    expect(b.deals).toHaveLength(1);
    expect(b.deals[0].key_figure).toBe('ROI 12%'); // the flat list's own field, untouched
  });
});

const post = (headers: Record<string, string>, path: string, body: unknown) =>
  worker.fetch(new Request(`https://s.test${path}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env());

describe('P4 — moving and parking from the board (flag ON)', () => {
  beforeEach(() => { siteConfig.features.dealPipeline = true; });

  it('moves a deal forward: writes stage_history and updates stage/status', async () => {
    const h = await authed();
    const { id } = await (await save(h, {})).json() as { id: string };
    const res = await post(h, `/api/deals/${id}/stage`, { stage: 'offer-in' });
    expect(res.status).toBe(200);
    expect((await res.json() as { stage: string; status: string })).toEqual({ ok: true, stage: 'offer-in', status: 'live' });
    expect((sqlite.prepare('SELECT stage FROM deals WHERE id=?').get(id) as { stage: string }).stage).toBe('offer-in');
    expect(count('deal_stage_history', `WHERE deal_id='${id}'`)).toBe(2); // opening + this move
  });

  it('allows SKIPPING stages (it is the user’s own money) and marks bought-it as done', async () => {
    const h = await authed();
    const { id } = await (await save(h, {})).json() as { id: string };
    const res = await post(h, `/api/deals/${id}/stage`, { stage: 'bought-it' }); // skip several
    expect(res.status).toBe(200);
    expect((await res.json() as { status: string }).status).toBe('done');
    expect((sqlite.prepare('SELECT status FROM deals WHERE id=?').get(id) as { status: string }).status).toBe('done');
  });

  it('rejects an unknown stage and refuses to move via /stage into parked-dead', async () => {
    const h = await authed();
    const { id } = await (await save(h, {})).json() as { id: string };
    expect((await post(h, `/api/deals/${id}/stage`, { stage: 'nonsense' })).status).toBe(400);
    expect((await post(h, `/api/deals/${id}/stage`, { stage: 'parked-dead' })).status).toBe(400);
  });

  it('parks/kills a deal with a reason: status dead, dead_reason stored, history written', async () => {
    const h = await authed();
    const { id } = await (await save(h, {})).json() as { id: string };
    const res = await post(h, `/api/deals/${id}/dead`, { reason: 'Chain fell through' });
    expect(res.status).toBe(200);
    const d = sqlite.prepare('SELECT status, stage, dead_reason FROM deals WHERE id=?').get(id) as Record<string, unknown>;
    expect(d.status).toBe('dead');
    expect(d.stage).toBe('parked-dead');
    expect(d.dead_reason).toBe('Chain fell through');
  });

  it('a move on someone else’s deal is a 404 (ownership enforced)', async () => {
    const h1 = await authed('u1');
    const { id } = await (await save(h1, {})).json() as { id: string };
    sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run('u2', 'u2@t', 'T', '2026-01-01T00:00:00Z');
    const h2 = await authed('u2');
    expect((await post(h2, `/api/deals/${id}/stage`, { stage: 'offer-in' })).status).toBe(404);
  });

  it('a migrated deal (no stage history) keeps its age across a re-score — stage_since is created_at, not bumped', async () => {
    const h = await authed();
    const old = '2026-07-01T00:00:00Z'; // ~2 months before the seeded "now"
    const id = '99999999-9999-4999-8999-999999999999';
    // a migrated-style deal: saved_deals + a deals row with the SAME url_params the
    // default save uses, an old created_at, and NO deal_stage_history.
    sqlite.prepare('INSERT INTO saved_deals (id, user_id, strategy, title, url_params, key_figure, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, 'u1', 'btl', 't', 'postcode=CF37+1HR&price=150000', 'ROI 6%', old);
    sqlite.prepare('INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, current_score, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, 'u1', 'btl', 't', '', 'worth-a-look', null, 'live', 'saved-deal-migration', old, old);
    expect(count('deal_stage_history', `WHERE deal_id='${id}'`)).toBe(0);
    // re-score it (the intended first action) — this bumps updated_at but adds no history
    await save(h, {});
    expect((sqlite.prepare('SELECT updated_at, created_at FROM deals WHERE id=?').get(id) as { updated_at: string; created_at: string }).created_at).toBe(old);
    const b = await (await list(h)).json() as { deals: { id: string; stage_since: string }[] };
    const d = b.deals.find((x) => x.id === id)!;
    expect(d.stage_since).toBe(old); // age anchored to created_at, NOT reset to now by the re-score
  });

  it('stores is_auction and keeps it STICKY across a re-save that omits it', async () => {
    const h = await authed();
    await save(h, { is_auction: true });
    expect((sqlite.prepare('SELECT is_auction FROM deals').get() as { is_auction: number }).is_auction).toBe(1);
    await save(h, { is_auction: false }); // re-open drops the marker; must not un-flag
    expect((sqlite.prepare('SELECT is_auction FROM deals').get() as { is_auction: number }).is_auction).toBe(1);
    // and the board list returns it as a real boolean + a stage_since
    const b = await (await list(h)).json() as { deals: Record<string, unknown>[] };
    expect(b.deals[0].is_auction).toBe(true);
    expect(typeof b.deals[0].stage_since).toBe('string');
  });
});

describe('P4 — move/park are inert with the flag OFF', () => {
  it('both endpoints 404 when the pipeline flag is off', async () => {
    expect(siteConfig.features.dealPipeline).toBe(false);
    const h = await authed();
    const id = '11111111-1111-4111-8111-111111111111';
    sqlite.prepare('INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, 'u1', 'btl', 't', '', 'worth-a-look', 'live', 'analyser', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    expect((await post(h, `/api/deals/${id}/stage`, { stage: 'offer-in' })).status).toBe(404);
    expect((await post(h, `/api/deals/${id}/dead`, { reason: 'x' })).status).toBe(404);
    expect((sqlite.prepare('SELECT stage FROM deals WHERE id=?').get(id) as { stage: string }).stage).toBe('worth-a-look'); // untouched
  });
});
