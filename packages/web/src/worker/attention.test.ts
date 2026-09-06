/**
 * WHAT NEEDS YOU, FOR THE BADGE (P10). The extension must never invent its own
 * idea of urgent, so this proves the endpoint is the board's own ranking: the
 * same deals, the same tiers, the same sentence — and nothing at all when the
 * person is not signed in.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from './index';
import { SESSION_COOKIE } from './lib/cookies';
import { signSession } from './lib/jwt';
import { features } from '../config/features';
import { TODAY_COPY, URGENCY } from '../config/pipeline';
import { rankUrgent } from '../lib/deals/urgency';

const MIG = (n: string) => readFileSync(fileURLToPath(new URL(`../../migrations/${n}`, import.meta.url)), 'utf8');
const MIGRATIONS = [
  '0001_init.sql', '0002_outbox_action.sql', '0003_deals_idempotent_outbox_backoff.sql',
  '0004_deals_key_includes_strategy.sql', '0005_deal_pipeline.sql', '0006_deal_headline_figure.sql',
  '0007_deal_is_auction.sql', '0008_deal_verdict_line.sql', '0012_deal_sold_evidence.sql',
  '0013_deal_changes.sql', '0014_folded_facts_and_room_sizes.sql', '0015_deal_dates_and_staleness.sql',
  '0016_deal_deaths.sql', '0017_deal_viewing_date.sql', '0018_chain_risk_ack.sql', '0019_bridging_factfind.sql', '0021_change_cash_needed.sql',
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
const attention = async (headers: Record<string, string> = {}) =>
  worker.fetch(new Request('https://s.test/api/attention', { headers }), env());

/**
 * A plain day, offset from today, in the READER'S OWN time — the same clock
 * `endOfDay` uses (urgency.ts). Building it with toISOString() made it a UTC
 * day, so for the hour between 23:00 UTC and midnight BST "tomorrow" was
 * already today and these tests failed once a day, every day. The app had this
 * right since the P8 review; the test did not (D5).
 */
const day = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const PARAMS = 'postcode=CF37+1HR&price=150000&rent=1200&refurbCost=20000';

/** A deal, written the way the board reads it (saved_deals mirror + deals row). */
const mkDeal = (id: string, over: Record<string, unknown> = {}, user = 'u1'): void => {
  sqlite.prepare('INSERT INTO saved_deals (id, user_id, strategy, title, url_params, key_figure, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, user, 'btl', `Deal ${id}`, `${String(over.url_params ?? PARAMS)}&k=${id}`, 'ROI 7%', '2026-09-01T00:00:00Z');
  const stageSince = String(over.stage_since ?? new Date().toISOString());
  sqlite.prepare('INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, current_score, headline_figure, verdict_line, is_auction, status, source, sold_evidence, viewing_date, chase_date, auction_date, exchange_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      id, user, 'btl', `Deal ${id}`, 'CF37 1', String(over.stage ?? 'offer-in'), 7.2, 'ROI 7%', 'Cashflows.',
      over.is_auction === true ? 1 : 0, String(over.status ?? 'live'), 'analyser', 'null',
      (over.viewing_date as string) ?? null, (over.chase_date as string) ?? null,
      (over.auction_date as string) ?? null, (over.exchange_date as string) ?? null,
      stageSince, stageSince,
    );
  sqlite.prepare('INSERT INTO deal_stage_history (id, deal_id, from_stage, to_stage, at) VALUES (?, ?, NULL, ?, ?)')
    .run(`h-${id}`, id, String(over.stage ?? 'offer-in'), stageSince);
};

beforeEach(() => {
  features.dealPipeline = true;
  features.dealDates = true;
  features.dealFacts = true;
  features.verdictChanges = true;
  features.evidenceChips = true;
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const m of MIGRATIONS) sqlite.exec(MIG(m));
  for (const u of ['u1', 'u2']) {
    sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run(u, `${u}@t`, u, '2026-01-01T00:00:00Z');
  }
});
afterEach(() => { features.dealPipeline = true; features.dealDates = true; });

describe('GET /api/attention', () => {
  it('says nothing at all when nobody is signed in — never a stale number', async () => {
    mkDeal('11111111-1111-4111-8111-111111111111', { chase_date: day(0) });
    const res = await attention();
    expect(res.status).toBe(401);
    expect(await res.json()).not.toHaveProperty('count');
  });

  it('counts exactly what the BOARD would rank — one ranking, two surfaces', async () => {
    mkDeal('11111111-1111-4111-8111-111111111111', { chase_date: day(1) });          // a deadline
    mkDeal('22222222-2222-4222-8222-222222222222', { stage_since: '2026-01-01T00:00:00Z' }); // gone cold
    mkDeal('33333333-3333-4333-8333-333333333333', { stage: 'worth-a-look' });        // fresh, nothing due
    const res = await attention(await authed());
    expect(res.status).toBe(200);
    const body = await res.json() as { count: number; critical: { dealId: string; text: string } | null };

    // the same function the board calls, over the same rows
    const rows = sqlite.prepare("SELECT d.*, s.url_params, s.key_figure, d.created_at AS stage_since FROM deals d JOIN saved_deals s ON s.id = d.id WHERE d.user_id = 'u1'").all() as Record<string, unknown>[];
    const deals = rows.map((r) => ({ ...r, is_auction: r.is_auction === 1 })) as never;
    const expected = rankUrgent({ deals, facts: [], changes: [], now: Date.now() });
    expect(body.count).toBe(expected.length);
    expect(body.count).toBe(2);
  });

  it('a deal that needs nothing is not counted, and an empty board is zero', async () => {
    const res = await attention(await authed());
    expect((await res.json() as { count: number }).count).toBe(0);
  });

  it('never counts anyone else’s deals', async () => {
    mkDeal('44444444-4444-4444-8444-444444444444', { chase_date: day(0) }, 'u2');
    expect((await (await attention(await authed())).json() as { count: number }).count).toBe(0);
    expect((await (await attention(await authed('u2'))).json() as { count: number }).count).toBe(1);
  });

  it('names something CRITICAL only for a dated deadline, in the board’s own words', async () => {
    mkDeal('11111111-1111-4111-8111-111111111111', { chase_date: day(1) });
    const body = await (await attention(await authed())).json() as { critical: { dealId: string; text: string; due: string } | null; deadlines: unknown[] };
    expect(body.critical?.dealId).toBe('11111111-1111-4111-8111-111111111111');
    // WHICH deadline it is, so the extension can tell you about it exactly once
    expect(body.critical?.due).toBe(day(1));
    expect(body.critical?.text).toContain(TODAY_COPY.when.tomorrow);
    // it IS the sentence the board would show
    expect(body.critical?.text).toBe(TODAY_COPY.deadline('Chase the agent on', 'Deal 11111111-1111-4111-8111-111111111111', 'your chase date', TODAY_COPY.when.tomorrow));
  });

  it('a date you MISSED still counts, but never interrupts — it is not time-critical', async () => {
    mkDeal('11111111-1111-4111-8111-111111111111', { chase_date: day(-40) });
    const body = await (await attention(await authed())).json() as { count: number; critical: unknown; deadlines: unknown[] };
    // the board still ranks it: an overdue date is exactly what you want to see
    expect(body.count).toBe(1);
    // …but a notification about a date from last month is noise, and the store
    // paperwork promises "inside the next 48 hours" (P10 review)
    expect(body.critical).toBeNull();
    expect(body.deadlines).toEqual([]);
  });

  it('hands over EVERY qualifying deadline, so a new one behind an old one is not silenced', async () => {
    mkDeal('11111111-1111-4111-8111-111111111111', { chase_date: day(1) });
    mkDeal('22222222-2222-4222-8222-222222222222', { stage: 'nearly-there', exchange_date: day(0) });
    const body = await (await attention(await authed())).json() as { deadlines: { dealId: string; due: string }[] };
    expect(body.deadlines).toHaveLength(2);
    expect(new Set(body.deadlines.map((d) => d.due))).toEqual(new Set([day(0), day(1)]));
  });

  it('a stale deal is counted but NEVER critical — a badge, not an interruption', async () => {
    mkDeal('22222222-2222-4222-8222-222222222222', { stage_since: '2026-01-01T00:00:00Z' });
    const body = await (await attention(await authed())).json() as { count: number; critical: unknown };
    expect(body.count).toBe(1);
    expect(body.critical).toBeNull();
  });

  it('a date beyond the window is a diary entry, not a nudge', async () => {
    // a stage that expects no evidence yet, so the date is the only thing in play
    mkDeal('11111111-1111-4111-8111-111111111111', { stage: 'going-to-view', chase_date: day(30), stage_since: new Date().toISOString() });
    const far = await (await attention(await authed())).json() as { count: number; critical: unknown };
    expect(far.count, 'a date a month out is a diary entry, not a nudge').toBe(0);
    expect(far.critical).toBeNull();
  });

  it('the critical tier is CONFIG — switch it off and nothing is ever critical', async () => {
    mkDeal('11111111-1111-4111-8111-111111111111', { chase_date: day(0) });
    const before = await (await attention(await authed())).json() as { critical: unknown };
    expect(before.critical).not.toBeNull();
    const kept = URGENCY.critical;
    try {
      (URGENCY as { critical: string }).critical = '';
      const after = await (await attention(await authed())).json() as { count: number; critical: unknown };
      expect(after.critical, 'no tier is critical, so nothing ever interrupts').toBeNull();
      expect(after.count, 'the badge still counts it').toBe(1);
    } finally {
      (URGENCY as { critical: string }).critical = kept;
    }
  });

  it('is 404 with the pipeline switched off', async () => {
    features.dealPipeline = false;
    expect((await attention(await authed())).status).toBe(404);
  });
});
