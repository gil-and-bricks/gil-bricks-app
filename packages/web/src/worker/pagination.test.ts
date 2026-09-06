/**
 * THE LISTS THAT USED TO LOAD EVERYTHING (P11).
 *
 * Live deals are bounded by the cap, but bought and killed deals are kept for
 * ever — so the board loads a WINDOW of those and asks for more. The rule this
 * holds: a window may change how much of the list is on screen, and it may never
 * change a number. Proved at several hundred rows, which is where the old
 * behaviour would have hurt.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from './index';
import { SESSION_COOKIE } from './lib/cookies';
import { signSession } from './lib/jwt';
import { features } from '../config/features';
import { BOARD_PAGE, GRAVEYARD, MAX_LIVE_DEALS } from '../config/pipeline';

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
const get = async (path: string, headers: Record<string, string>) =>
  worker.fetch(new Request(`https://s.test${path}`, { headers }), env());

interface Board {
  deals: { id: string; status: string; updated_at: string }[];
  deaths: { deal_id: string }[];
  counts: { live: number; done: number; dead: number };
  more: { done: boolean; dead: boolean };
  liveCount: number;
  cap: number;
}

/** A realistic pile: every deal has its saved_deals mirror, and every dead one a death. */
const seed = (live: number, done: number, dead: number, user = 'u1'): void => {
  const saved = sqlite.prepare('INSERT INTO saved_deals (id, user_id, strategy, title, url_params, key_figure, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const deal = sqlite.prepare("INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, current_score, headline_figure, verdict_line, is_auction, status, source, sold_evidence, created_at, updated_at) VALUES (?, ?, 'btl', ?, 'CF37 1', ?, 7.2, 'ROI 7%', 'Cashflows.', 0, ?, 'analyser', 'null', ?, ?)");
  const death = sqlite.prepare("INSERT INTO deal_deaths (id, deal_id, reason_key, note, snapshot_json, at, revived_at) VALUES (?, ?, 'survey', '', '{\"v\":1,\"strategy\":\"btl\"}', ?, NULL)");
  const mk = (n: number, status: string, stage: string, prefix: string): void => {
    for (let i = 0; i < n; i++) {
      const id = `${prefix}-${String(i).padStart(4, '0')}`;
      // distinct, ordered timestamps so paging has something real to page over
      const at = new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();
      saved.run(id, user, 'btl', `Deal ${id}`, `postcode=CF37+1HR&price=150000&rent=1200&k=${id}`, 'ROI 7%', at);
      deal.run(id, user, `Deal ${id}`, stage, status, at, at);
      if (status === 'dead') death.run(`x-${id}`, id, at);
    }
  };
  mk(live, 'live', 'offer-in', `${user}-live`);
  mk(done, 'done', 'bought-it', `${user}-done`);
  mk(dead, 'dead', 'parked-dead', `${user}-dead`);
};

beforeEach(() => {
  features.dealPipeline = true;
  features.dealGraveyard = true;
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const m of MIGRATIONS) sqlite.exec(MIG(m));
  for (const u of ['u1', 'u2']) {
    sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run(u, `${u}@t`, u, '2026-01-01T00:00:00Z');
  }
});
afterEach(() => { features.dealGraveyard = true; });

describe('a board with several hundred deals behind it', () => {
  it('loads every LIVE deal, a window of the rest, and counts that are TRUE', async () => {
    seed(100, 250, 300);
    const b = await (await get('/api/deals', await authed())).json() as Board;
    const by = (s: string) => b.deals.filter((d) => d.status === s).length;
    // every live deal: there can never be more than the cap, so nothing is hidden
    expect(by('live')).toBe(100);
    expect(by('done')).toBe(BOARD_PAGE.done);
    expect(by('dead')).toBe(BOARD_PAGE.dead);
    // …and the numbers beside them are the real ones, not what is on screen
    expect(b.counts).toEqual({ live: 100, done: 250, dead: 300 });
    expect(b.liveCount).toBe(100);
    expect(b.cap).toBe(MAX_LIVE_DEALS);
    expect(b.more).toEqual({ done: true, dead: true });
    // the deaths that travel are the ones for the deals that travelled
    expect(b.deaths).toHaveLength(BOARD_PAGE.dead);
    const shown = new Set(b.deals.filter((d) => d.status === 'dead').map((d) => d.id));
    for (const d of b.deaths) expect(shown.has(d.deal_id)).toBe(true);
  });

  it('pages the graveyard to the end: nothing repeats, nothing is skipped', async () => {
    seed(2, 0, 300);
    const h = await authed();
    const seen: string[] = [];
    let body = await (await get('/api/deals', h)).json() as Board;
    seen.push(...body.deals.filter((d) => d.status === 'dead').map((d) => d.id));
    let guard = 0;
    while (body.more.dead && guard++ < 100) {
      const last = seen[seen.length - 1];
      const at = (sqlite.prepare('SELECT updated_at u FROM deals WHERE id = ?').get(last) as { u: string }).u;
      const next = await (await get(`/api/deals/dead?before=${encodeURIComponent(at)}&beforeId=${encodeURIComponent(last)}`, h)).json() as { deals: Board['deals']; more: boolean; counts: Board['counts'] };
      expect(next.counts.dead, 'the total never moves while you page').toBe(300);
      seen.push(...next.deals.map((d) => d.id));
      body = { ...body, more: { ...body.more, dead: next.more } };
    }
    expect(new Set(seen).size, 'no repeats').toBe(seen.length);
    expect(seen).toHaveLength(300);
  });

  it('the graveyard window is never smaller than the pattern needs', () => {
    // patternIn reads the last GRAVEYARD.patternWindow headstones; if the board
    // loaded fewer than that, a pattern could be drawn from a partial sample.
    expect(BOARD_PAGE.dead).toBeGreaterThanOrEqual(GRAVEYARD.patternWindow);
  });

  it('never leaks another person’s deals into a page', async () => {
    seed(1, 0, 30);
    seed(1, 0, 30, 'u2');
    const b = await (await get('/api/deals/dead', await authed())).json() as { deals: { id: string }[] };
    for (const d of b.deals) expect(d.id.startsWith('u1-')).toBe(true);
    const mine = await (await get('/api/deals', await authed())).json() as Board;
    expect(mine.counts.dead).toBe(30);
  });

  it('a page needs a session, and the graveyard flag decides whether deaths travel', async () => {
    seed(1, 0, 5);
    expect((await get('/api/deals/dead', {})).status).toBe(401);
    features.dealGraveyard = false;
    const b = await (await get('/api/deals', await authed())).json() as Board;
    expect(b.deaths).toEqual([]);
    expect(b.counts.dead, 'the count is still true — the flag hides the CARD, not the deal').toBe(5);
  });

  it('an empty board pages to nothing without falling over', async () => {
    const b = await (await get('/api/deals', await authed())).json() as Board;
    expect(b.counts).toEqual({ live: 0, done: 0, dead: 0 });
    expect(b.more).toEqual({ done: false, dead: false });
    const page = await (await get('/api/deals/dead', await authed())).json() as { deals: unknown[]; more: boolean };
    expect(page.deals).toEqual([]);
    expect(page.more).toBe(false);
  });
});
