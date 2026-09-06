/**
 * KILLING AND UN-KILLING A DEAL (P9), over the real routes.
 *
 * The capture has to be complete whoever asked for it, the snapshot has to be
 * written once and left alone, a dead deal has to free a live slot, and a deal
 * that comes back has to land where it died — with its death kept as history.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from './index';
import { SESSION_COOKIE } from './lib/cookies';
import { signSession } from './lib/jwt';
import { features } from '../config/features';
import { parkReason } from '../config/pipeline';
import { parseSnapshot } from '../lib/deals/graveyard';

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

const DEAL = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PARAMS = 'postcode=CF37+1HR&paon=44&price=120000&type=T&rent=950&refurbCost=20000';
const count = (t: string, where = '') => (sqlite.prepare(`SELECT COUNT(*) n FROM ${t} ${where}`).get() as { n: number }).n;

const post = async (path: string, body: unknown, headers: Record<string, string>) =>
  worker.fetch(new Request(`https://s.test${path}`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), env());
const kill = async (headers: Record<string, string>, body: Record<string, unknown>, deal = DEAL) =>
  post(`/api/deals/${deal}/dead`, body, headers);
const revive = async (headers: Record<string, string>, body: Record<string, unknown> = {}, deal = DEAL) =>
  post(`/api/deals/${deal}/revive`, body, headers);
const board = async (headers: Record<string, string>) =>
  (await worker.fetch(new Request('https://s.test/api/deals', { headers }), env())).json() as Promise<{ deals: unknown[]; deaths?: { deal_id: string; reason_key: string; note: string; snapshot_json: string }[] }>;

beforeEach(() => {
  features.dealPipeline = true;
  features.dealGraveyard = true;
  features.dealFacts = true;
  features.chainRisk = true;
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const m of MIGRATIONS) sqlite.exec(MIG(m));
  for (const u of ['u1', 'u2']) {
    sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run(u, `${u}@t`, u, '2026-01-01T00:00:00Z');
  }
  const mk = (id: string, user: string, stage: string) => {
    sqlite.prepare('INSERT INTO saved_deals (id, user_id, strategy, title, url_params, key_figure, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, user, 'btl', 'Terraced · CF37 1HR · £120,000', PARAMS, 'ROI 7%', '2026-09-01T00:00:00Z');
    sqlite.prepare('INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, current_score, headline_figure, verdict_line, is_auction, status, source, sold_evidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)')
      .run(id, user, 'btl', 'Terraced · CF37 1HR · £120,000', 'CF37 1', stage, 8.4, 'ROI 7%', 'The rent covers it twice over', 'live', 'analyser', 'null', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z');
    sqlite.prepare('INSERT INTO deal_stage_history (id, deal_id, from_stage, to_stage, at) VALUES (?, ?, NULL, ?, ?)')
      .run(`h-${id}`, id, stage, '2026-09-01T00:00:00Z');
  };
  mk(DEAL, 'u1', 'offer-in');
  mk(OTHER, 'u2', 'worth-a-look');
});
afterEach(() => { features.dealPipeline = true; features.dealGraveyard = true; features.dealFacts = true; });

describe('capturing a death', () => {
  it('stores a stable reason key, the optional note, and freezes the card', async () => {
    const h = await authed();
    sqlite.prepare('INSERT INTO deal_facts (id, deal_id, fact_type, value_json, entered_at) VALUES (?, ?, ?, ?, ?)')
      .run('f1', DEAL, 'builder-quote', JSON.stringify({ value: 48000, note: 'Two quotes' }), '2026-09-02T00:00:00Z');
    const res = await kill(h, { reason_key: 'refurb-too-high', note: 'Quote came back at twice my guess' });
    expect(res.status).toBe(200);

    const row = sqlite.prepare('SELECT * FROM deal_deaths WHERE deal_id = ?').get(DEAL) as Record<string, string>;
    expect(row.reason_key).toBe('refurb-too-high');
    expect(row.note).toBe('Quote came back at twice my guess');
    const snap = parseSnapshot(row.snapshot_json);
    expect(snap?.score).toBe(8.4);
    expect(snap?.verdictLine).toBe('The rent covers it twice over');
    expect(snap?.stage, 'the stage it REACHED, not the dead stage').toBe('offer-in');
    expect(snap?.facts.map((f) => f.type)).toEqual(['builder-quote']);
    expect(snap?.chips.find((c) => c.key === 'refurb')?.state).toBe('evidenced');

    // the deal itself is dead, and keeps the label it always kept
    const d = sqlite.prepare('SELECT status, stage, dead_reason FROM deals WHERE id = ?').get(DEAL) as Record<string, string>;
    expect(d.status).toBe('dead');
    expect(d.dead_reason).toBe(parkReason('refurb-too-high')?.label);
    // and the death is handed straight back, so the board can show it at once
    const { death } = await res.json() as { death: { reason_key: string; snapshot_json: string } };
    expect(death.reason_key).toBe('refurb-too-high');
    expect(parseSnapshot(death.snapshot_json)?.score).toBe(8.4);
  });

  it('a reason the config does not know is refused, and nothing dies', async () => {
    const h = await authed();
    expect((await kill(h, { reason_key: 'made-up' })).status).toBe(400);
    expect((await kill(h, { reason: 'Chain fell through' })).status).toBe(400);
    expect(count('deal_deaths')).toBe(0);
    expect((sqlite.prepare('SELECT status FROM deals WHERE id = ?').get(DEAL) as { status: string }).status).toBe('live');
  });

  it('a second kill writes nothing and hands back the death it already has', async () => {
    const h = await authed();
    expect((await kill(h, { reason_key: 'survey', note: 'the first words' })).status).toBe(200);
    // another tab, or a retry: the FIRST death is the true one, and the answer
    // still tells the board the deal is dead so the screen cannot disagree.
    const again = await kill(h, { reason_key: 'beaten', note: 'later words' });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ status: 'dead', death: { reason_key: 'survey', note: 'the first words' } });
    expect(count('deal_deaths')).toBe(1);
    expect((sqlite.prepare('SELECT reason_key FROM deal_deaths').get() as { reason_key: string }).reason_key).toBe('survey');
  });

  it('the note is the person’s own words, capped — and never anyone else’s deal', async () => {
    const h = await authed();
    await kill(h, { reason_key: 'survey', note: ' x'.repeat(400) });
    expect((sqlite.prepare('SELECT note FROM deal_deaths').get() as { note: string }).note.length).toBeLessThanOrEqual(200);
    expect((await kill(await authed('u2'), { reason_key: 'survey' })).status).toBe(404);
  });

  it('with the graveyard off a kill still works and is still recorded — no hole to come back to', async () => {
    features.dealGraveyard = false;
    const h = await authed();
    expect((await kill(h, { reason_key: 'survey', note: 'typed somehow' })).status).toBe(200);
    const row = sqlite.prepare('SELECT reason_key, note FROM deal_deaths').get() as Record<string, string>;
    expect(row.reason_key).toBe('survey');
    expect(row.note, 'there is nowhere to type one, so none is stored').toBe('');
    expect((await board(h)).deaths ?? []).toEqual([]);
  });
});

describe('the chain-risk card (P11)', () => {
  const chainAck = async (headers: Record<string, string>, deal = DEAL) =>
    post(`/api/deals/${deal}/chain-ack`, {}, headers);

  it('is unread until it is read, and then stays read', async () => {
    const h = await authed();
    const before = sqlite.prepare('SELECT chain_ack_at FROM deals WHERE id = ?').get(DEAL) as { chain_ack_at: string | null };
    expect(before.chain_ack_at).toBeNull();
    expect((await chainAck(h)).status).toBe(200);
    const after = sqlite.prepare('SELECT chain_ack_at FROM deals WHERE id = ?').get(DEAL) as { chain_ack_at: string };
    expect(after.chain_ack_at).not.toBeNull();
    // reading it twice does not move the moment you read it
    await chainAck(h);
    expect((sqlite.prepare('SELECT chain_ack_at FROM deals WHERE id = ?').get(DEAL) as { chain_ack_at: string }).chain_ack_at)
      .toBe(after.chain_ack_at);
  });

  it('travels with the board, so it does not come back on the next load', async () => {
    const h = await authed();
    await chainAck(h);
    const b = await (await worker.fetch(new Request('https://s.test/api/deals', { headers: h }), env())).json() as { deals: { id: string; chain_ack_at: string | null }[] };
    expect(b.deals.find((d) => d.id === DEAL)?.chain_ack_at).not.toBeNull();
  });

  it('needs a session, is nobody else’s to dismiss, and 404s with the flag off', async () => {
    expect((await chainAck({})).status).toBe(401);
    expect((await chainAck(await authed('u2'))).status).toBe(404);
    features.chainRisk = false;
    expect((await chainAck(await authed())).status).toBe(404);
    features.chainRisk = true;
  });
});

describe('the board is handed the deaths', () => {
  it('newest first, with the frozen card, and never anyone else’s', async () => {
    const h = await authed();
    await kill(h, { reason_key: 'down-valued', note: 'Valuer came in low' });
    await kill(await authed('u2'), { reason_key: 'survey' }, OTHER);
    const b = await board(h);
    expect(b.deaths).toHaveLength(1);
    expect(b.deaths?.[0].deal_id).toBe(DEAL);
    expect(b.deaths?.[0].note).toBe('Valuer came in low');
    expect(parseSnapshot(b.deaths?.[0].snapshot_json ?? '')?.score).toBe(8.4);
  });
});

describe('a dead deal frees a live slot, and coming back takes one', () => {
  it('the deal is out of the live count the moment it dies', async () => {
    const h = await authed();
    const before = (await (await worker.fetch(new Request('https://s.test/api/deals', { headers: h }), env())).json()) as { liveCount: number };
    expect(before.liveCount).toBe(1);
    await kill(h, { reason_key: 'numbers-fail' });
    const after = (await (await worker.fetch(new Request('https://s.test/api/deals', { headers: h }), env())).json()) as { liveCount: number };
    expect(after.liveCount).toBe(0);
  });

  it('brings it back to the stage it died at, keeps the death, and re-scores it', async () => {
    const h = await authed();
    await kill(h, { reason_key: 'seller-pulled-out' });
    const res = await revive(h, { score: 5.9, verdict_line: 'Today’s rules, today’s answer', headline_figure: 'ROI 4%', criteria_json: '{}', evidence_json: '{}' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, stage: 'offer-in', status: 'live' });

    const d = sqlite.prepare('SELECT status, stage, current_score, verdict_line FROM deals WHERE id = ?').get(DEAL) as Record<string, unknown>;
    expect(d.status).toBe('live');
    expect(d.stage, 'back where it died').toBe('offer-in');
    expect(d.current_score, 're-scored against today’s rules').toBe(5.9);
    expect(d.verdict_line).toBe('Today’s rules, today’s answer');

    // the death is KEPT — marked, never deleted — and leaves the graveyard
    const death = sqlite.prepare('SELECT revived_at FROM deal_deaths WHERE deal_id = ?').get(DEAL) as { revived_at: string | null };
    expect(death.revived_at).not.toBeNull();
    expect((await board(h)).deaths).toEqual([]);
    // and the way back is in the history like any other move
    expect(count('deal_stage_history', `WHERE deal_id = '${DEAL}' AND from_stage = 'parked-dead' AND to_stage = 'offer-in'`)).toBe(1);
    // the snapshot it died on is untouched by the revival
    expect(parseSnapshot((sqlite.prepare('SELECT snapshot_json s FROM deal_deaths WHERE deal_id = ?').get(DEAL) as { s: string }).s)?.score).toBe(8.4);
  });

  it('a deal killed before P9 still comes back — the stage history knows where', async () => {
    const h = await authed();
    // a pre-P9 death: the deal is dead with a reason, and there is no snapshot
    sqlite.prepare("UPDATE deals SET status = 'dead', stage = 'parked-dead', dead_reason = 'Too dear' WHERE id = ?").run(DEAL);
    sqlite.prepare('INSERT INTO deal_stage_history (id, deal_id, from_stage, to_stage, at) VALUES (?, ?, ?, ?, ?)')
      .run('h-old', DEAL, 'offer-in', 'parked-dead', '2026-09-02T00:00:00Z');
    const res = await revive(h);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ stage: 'offer-in' });
  });

  it('refuses when the board is full — a revived deal is a live deal again', async () => {
    const h = await authed();
    await kill(h, { reason_key: 'beaten' });
    // fill the board to the cap with live deals
    const ins = sqlite.prepare("INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, status, source, created_at, updated_at) VALUES (?, 'u1', 'btl', 't', '', 'worth-a-look', 'live', 'analyser', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')");
    for (let i = 0; i < 100; i++) ins.run(`fill-${i}`);
    const res = await revive(h);
    expect(res.status).toBe(409);
    expect((sqlite.prepare('SELECT status FROM deals WHERE id = ?').get(DEAL) as { status: string }).status).toBe('dead');
  });

  it('nobody else can bring my deal back, and a live deal cannot be revived', async () => {
    const h = await authed();
    await kill(h, { reason_key: 'beaten' });
    expect((await revive(await authed('u2'))).status).toBe(404);
    expect((await revive(h)).status).toBe(200);
    expect((await revive(h)).status, 'already live').toBe(404);
  });

  it('with the graveyard off there is no way back at all', async () => {
    const h = await authed();
    await kill(h, { reason_key: 'beaten' });
    features.dealGraveyard = false;
    expect((await revive(h)).status).toBe(404);
    expect((sqlite.prepare('SELECT status FROM deals WHERE id = ?').get(DEAL) as { status: string }).status).toBe('dead');
  });

  it('a signed-out visitor can neither kill nor revive', async () => {
    expect((await kill({}, { reason_key: 'beaten' })).status).toBe(401);
    expect((await revive({})).status).toBe(401);
  });
});
