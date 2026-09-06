import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from './index';
import { SESSION_COOKIE } from './lib/cookies';
import { signSession } from './lib/jwt';
import { features } from '../config/features';
import { stampStaleness } from './lib/pipeline';
import { DAILY_CRON } from '../config/pipeline';

/**
 * DATES AND THE DAILY STAMP (P8). The dates are the only way the top tier of the
 * today line can ever be real, and the cron is the thing that must never grow
 * into a notifier: it computes, it stores, it tells nobody.
 */
const MIG = (n: string) => readFileSync(fileURLToPath(new URL(`../../migrations/${n}`, import.meta.url)), 'utf8');
const MIGRATIONS = [
  '0001_init.sql', '0002_outbox_action.sql', '0003_deals_idempotent_outbox_backoff.sql',
  '0004_deals_key_includes_strategy.sql', '0005_deal_pipeline.sql', '0006_deal_headline_figure.sql',
  '0007_deal_is_auction.sql', '0008_deal_verdict_line.sql', '0012_deal_sold_evidence.sql',
  '0011_outbox_fields.sql', '0013_deal_changes.sql', '0014_folded_facts_and_room_sizes.sql',
  '0015_deal_dates_and_staleness.sql', '0016_deal_deaths.sql', '0017_deal_viewing_date.sql', '0018_chain_risk_ack.sql',
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
const setDate = async (body: Record<string, unknown>, headers: Record<string, string>, deal = DEAL) =>
  worker.fetch(new Request(`https://s.test/api/deals/${deal}/date`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), env());
const col = (name: string, id = DEAL) => (sqlite.prepare(`SELECT ${name} v FROM deals WHERE id = ?`).get(id) as { v: string | null }).v;

const DAY = 86_400_000;
beforeEach(() => {
  features.dealPipeline = true;
  features.dealDates = true;
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const m of MIGRATIONS) sqlite.exec(MIG(m));
  for (const u of ['u1', 'u2']) {
    sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run(u, `${u}@t`, u, '2026-01-01T00:00:00Z');
  }
  const ins = sqlite.prepare('INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  ins.run(DEAL, 'u1', 'btl', 'A deal', 'CF37 1', 'offer-in', 'live', 'analyser', new Date(Date.now() - 9 * DAY).toISOString(), '2026-01-01T00:00:00Z');
  ins.run(OTHER, 'u2', 'btl', 'Someone else’s', 'CF10 1', 'offer-in', 'live', 'analyser', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
  // the board list reads the saved-deal mirror for the params
  const mirror = sqlite.prepare('INSERT INTO saved_deals (id, user_id, strategy, title, url_params, key_figure, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  mirror.run(DEAL, 'u1', 'btl', 'A deal', 'postcode=CF37+1HR&paon=12&price=150000', 'ROI 8%', '2026-01-01T00:00:00Z');
  mirror.run(OTHER, 'u2', 'btl', 'Someone else’s', 'postcode=CF10+1AA&paon=1&price=99000', 'ROI 6%', '2026-01-01T00:00:00Z');
});
afterEach(() => { features.dealDates = true; });

describe('setting a date', () => {
  it('stores a plain day, and clears it with the same call', async () => {
    expect((await setDate({ date_key: 'chase_date', value: '2026-10-01' }, await authed())).status).toBe(200);
    expect(col('chase_date')).toBe('2026-10-01');
    expect((await setDate({ date_key: 'chase_date', value: '' }, await authed())).status).toBe(200);
    expect(col('chase_date')).toBeNull();
  });

  it('refuses anything that is not a plain day, and any column not in the config', async () => {
    for (const value of ['2026-10-01T09:00:00Z', 'tomorrow', '01/10/2026', '2026-13-45']) {
      expect((await setDate({ date_key: 'chase_date', value }, await authed())).status, value).toBe(400);
    }
    expect((await setDate({ date_key: 'current_score', value: '2026-10-01' }, await authed())).status).toBe(400);
    expect(col('chase_date')).toBeNull();
  });

  it('is yours only, and 401 when signed out', async () => {
    expect((await setDate({ date_key: 'chase_date', value: '2026-10-01' }, await authed(), OTHER)).status).toBe(404);
    expect((await setDate({ date_key: 'chase_date', value: '2026-10-01' }, {})).status).toBe(401);
    expect(col('chase_date', OTHER)).toBeNull();
  });

  it('the flag turns the whole thing off', async () => {
    features.dealDates = false;
    expect((await setDate({ date_key: 'chase_date', value: '2026-10-01' }, await authed())).status).toBe(404);
  });

  it('the board is handed the dates it needs to rank', async () => {
    await setDate({ date_key: 'chase_date', value: '2026-10-01' }, await authed());
    const b = await (await worker.fetch(new Request('https://s.test/api/deals', { headers: await authed() }), env())).json() as { deals: Record<string, unknown>[] };
    expect(b.deals[0].chase_date).toBe('2026-10-01');
    expect(b.deals[0]).toHaveProperty('auction_date');
    expect(b.deals[0]).toHaveProperty('exchange_date');
  });
});

describe('the daily stamp', () => {
  it('writes each live deal’s stage-aware staleness, and nothing else', async () => {
    const n = await stampStaleness(env().DB, Date.now());
    expect(n).toBe(2);
    // 9 days at offer-in (normal 4, cold 10) is amber, not cold
    expect(col('stale_state')).toBe('amber');
    expect(col('stale_at')).toBeTruthy();
    // it did not touch the score, the stage or anything a person owns
    expect(col('current_score')).toBeNull();
    expect(col('stage')).toBe('offer-in');
  });

  it('leaves a parked or bought deal alone', async () => {
    sqlite.prepare("UPDATE deals SET status = 'dead' WHERE id = ?").run(DEAL);
    await stampStaleness(env().DB, Date.now());
    expect(col('stale_state')).toBeNull();
  });

  it('the schedule in wrangler.jsonc and the code agree about the daily cron', () => {
    const cfg = readFileSync(fileURLToPath(new URL('../../wrangler.jsonc', import.meta.url)), 'utf8');
    const crons = /"crons"\s*:\s*\[([^\]]*)\]/.exec(cfg)?.[1] ?? '';
    expect(crons, 'the daily trigger must exist in the deployed config').toContain(`"${DAILY_CRON}"`);
    expect(crons, 'and the outbox trigger must survive').toContain('"*/15 * * * *"');
  });

  it('every OTHER trigger still runs the outbox exactly as before', async () => {
    sqlite.prepare("INSERT INTO kit_outbox (id, user_id, email, first_name, action, status, created_at, attempts) VALUES ('o2', 'u1', 'a@b.c', 'A', 'subscribe', 'pending', ?, 9)")
      .run(new Date(Date.now() - 60_000).toISOString());
    await worker.scheduled({ cron: '*/15 * * * *' }, env());
    // attempts >= MAX_ATTEMPTS is failed off by the outbox — proof the branch ran
    expect((sqlite.prepare("SELECT status s FROM kit_outbox WHERE id = 'o2'").get() as { s: string }).s).toBe('failed');
    expect(col('stale_state'), 'and the outbox run stamps nothing').toBeNull();
  });

  it('the daily trigger stamps and NEVER touches the outbox', async () => {
    sqlite.prepare("INSERT INTO kit_outbox (id, user_id, email, first_name, action, status, created_at) VALUES ('o1', 'u1', 'a@b.c', 'A', 'subscribe', 'pending', ?)")
      .run(new Date().toISOString());
    await worker.scheduled({ cron: DAILY_CRON }, env());
    expect(col('stale_state')).toBe('amber');
    // the outbox row is untouched: the daily job computes, it never sends
    expect((sqlite.prepare("SELECT status s FROM kit_outbox WHERE id = 'o1'").get() as { s: string }).s).toBe('pending');
  });

  it('clears the stamp when a deal leaves live, so it never contradicts the board', async () => {
    await stampStaleness(env().DB, Date.now());
    expect(col('stale_state')).toBe('amber');
    sqlite.prepare("UPDATE deals SET status = 'dead' WHERE id = ?").run(DEAL);
    await stampStaleness(env().DB, Date.now());
    expect(col('stale_state')).toBeNull();
    expect(col('stale_at')).toBeNull();
  });

  it('scales by STATE, not by deal: a hundred deals is a handful of statements', async () => {
    const ins = sqlite.prepare('INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (let i = 0; i < 100; i++) {
      ins.run(`d${i}-1111-4111-8111-111111111111`, 'u1', 'btl', `Deal ${i}`, 'CF37 1', 'offer-in', 'live', 'analyser',
        new Date(Date.now() - (i % 12) * DAY).toISOString(), '2026-01-01T00:00:00Z');
    }
    let batches = 0;
    const counted = { ...env(), DB: { ...env().DB, batch: async (sts: { run: () => Promise<unknown> }[]) => { batches += 1; return Promise.all(sts.map((s) => s.run())); } } } as Env;
    const n = await stampStaleness(counted.DB, Date.now());
    expect(n).toBe(102);
    expect(batches, 'a hundred deals must not be a hundred round trips').toBeLessThanOrEqual(2);
  });

  it('says the same thing the board says — one function, two callers', async () => {
    const { dwellState } = await import('../lib/deals/board');
    await stampStaleness(env().DB, Date.now());
    const row = sqlite.prepare('SELECT stage, status, stale_state FROM deals WHERE id = ?').get(DEAL) as { stage: string; status: string; stale_state: string };
    const since = new Date(Date.now() - 9 * DAY).toISOString();
    expect(row.stale_state).toBe(dwellState({ stage: row.stage, status: row.status, stage_since: since }, Date.now()));
  });
});
