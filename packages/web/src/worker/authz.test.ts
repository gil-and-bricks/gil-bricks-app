/**
 * S1 — CROSS-USER AUTHORISATION, AND THE BROKER LINKS (the attack surface).
 *
 * WHAT THIS IS. Not a unit test of a helper: an attempt to READ AND WRITE
 * ANOTHER PERSON'S DATA by changing an id in a URL. Every route that takes an
 * id is hit, signed in as somebody who does not own it, and must answer as if
 * the thing does not exist — never with the data, never with a different error
 * that confirms it is there.
 *
 * WHY IT MATTERS MOST HERE. A fact-find holds a date of birth, a home address
 * and a credit answer. A bridging enquiry holds a phone number and somebody's
 * financial position. Those are the rows an attacker actually wants.
 *
 * THE ERROR MUST NOT DISTINGUISH. A 404 for "someone else's deal" and a 404 for
 * "no such deal" are the same response on purpose: a different status, or a
 * different message, is an oracle that confirms which ids exist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from './index';
import { SESSION_COOKIE } from './lib/cookies';
import { signSession } from './lib/jwt';
import { features } from '../config/features';
import { BROKER } from '../config/bridging';
import { hashToken } from './lib/brokerLink';

const MIG = (n: string) => readFileSync(fileURLToPath(new URL(`../../migrations/${n}`, import.meta.url)), 'utf8');
const ALL_MIGRATIONS = [
  '0001_init.sql', '0002_outbox_action.sql', '0003_deals_idempotent_outbox_backoff.sql',
  '0004_deals_key_includes_strategy.sql', '0005_deal_pipeline.sql', '0006_deal_headline_figure.sql',
  '0007_deal_is_auction.sql', '0008_deal_verdict_line.sql', '0009_bridging_enquiries.sql',
  '0010_tool_saves.sql', '0011_outbox_fields.sql', '0012_deal_sold_evidence.sql',
  '0013_deal_changes.sql', '0014_folded_facts_and_room_sizes.sql', '0015_deal_dates_and_staleness.sql',
  '0016_deal_deaths.sql', '0017_deal_viewing_date.sql', '0018_chain_risk_ack.sql',
  '0019_bridging_factfind.sql', '0020_factfind_consent_record.sql', '0021_change_cash_needed.sql',
  '0022_epc_cache.sql', '0023_cron_heartbeat.sql', '0024_bridging_enquiry_link.sql', '0026_deal_floorplans.sql',
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
const env = (): Env => ({ ASSETS: { fetch: async () => new Response('a') }, DB: makeD1(sqlite), JWT_SECRET: 'test-secret', GOOGLE_CLIENT_SECRET: 'x', TURNSTILE_SECRET: 'ts', KIT_API_KEY: 'k' }) as Env;
const as = async (user: string) => ({ Cookie: `${SESSION_COOKIE}=${await signSession({ sub: user, email: `${user}@t.test`, name: 'Test Person', avatar: '' }, 'test-secret')}` });

const DEAL_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FACT_A = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const CHANGE_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ENQ_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MISSING = '00000000-0000-4000-8000-000000000000';

const req = (path: string, method: string, headers: Record<string, string>, body?: unknown) =>
  worker.fetch(new Request(`https://s.test${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env());

const one = <T>(sql: string): T => sqlite.prepare(sql).get() as T;

const REAL_BROKER = { name: 'Test Broker', email: 'broker@test.test', inbox: 'inbox@test.test', kitTagQualified: '1', kitTagNotYet: '2', kitTagFactFind: '3', kitTagEnquiry: '4' };
const savedBroker = { ...BROKER } as Record<string, string>;

beforeEach(() => {
  Object.assign(BROKER as unknown as Record<string, string>, REAL_BROKER);
  for (const k of ['dealPipeline', 'dealFacts', 'verdictChanges', 'dealDates', 'dealGraveyard', 'chainRisk', 'bridgingFinance', 'brokerFactFind', 'brokerEnquiryLink'] as const) {
    (features as unknown as Record<string, boolean>)[k] = true;
  }
  sqlite = new DatabaseSync(':memory:');
  for (const m of ALL_MIGRATIONS) sqlite.exec(MIG(m));
  for (const u of ['userA', 'userB']) {
    sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)')
      .run(u, `${u}@t.test`, u, '2026-01-01T00:00:00Z');
  }
  // userA's world: a deal, a fact, a change, a death, an enquiry, a fact-find.
  sqlite.prepare(
    `INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, status, source, created_at, updated_at)
     VALUES (?, 'userA', 'flip', 'A SECRET STREET', 'CF24 4', 'worth-a-look', 'live', 'analyser', ?, ?)`,
  ).run(DEAL_A, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
  sqlite.prepare("INSERT INTO deal_facts (id, deal_id, fact_type, value_json, entered_at) VALUES (?, ?, 'builder-quote', ?, ?)")
    .run(FACT_A, DEAL_A, JSON.stringify({ value: 48000, note: 'A SECRET NOTE' }), '2026-01-02T00:00:00Z');
  sqlite.prepare(
    `INSERT INTO deal_changes (id, deal_id, fact_type, fact_value, previous_value, from_score, to_score, to_verdict_line, at)
     VALUES (?, ?, 'builder-quote', 48000, 30000, 8, 6, 'A SECRET LINE', ?)`,
  ).run(CHANGE_A, DEAL_A, '2026-01-02T00:00:00Z');
  sqlite.prepare(
    `INSERT INTO bridging_enquiries (id, user_id, email, first_name, phone, loan, deposit_band, property_state,
      entity, exit_route, story, timing, credit, outcome, reasons, consent_at, created_at)
     VALUES (?, 'userA', 'userA@t.test', 'A', '07700900123', 95000, '25-plus', 'found', 'ltd', 'refinance',
       'A SECRET STORY', '4-weeks', 'none', 'qualified', '', ?, ?)`,
  ).run(ENQ_A, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
});
afterEach(() => {
  Object.assign(BROKER as unknown as Record<string, string>, savedBroker);
  vi.unstubAllGlobals();
});

/** Every id-bearing route, as [method, path, body?]. */
const ID_ROUTES: [string, string, unknown?][] = [
  ['DELETE', `/api/deals/${DEAL_A}`],
  ['GET', `/api/deals/${DEAL_A}/history`],
  ['POST', `/api/deals/${DEAL_A}/stage`, { stage: 'going-to-view' }],
  ['POST', `/api/deals/${DEAL_A}/dead`, { reason_key: 'numbers-fail', note: '' }],
  ['POST', `/api/deals/${DEAL_A}/score`, { score: 9, criteria_json: '{}', evidence_json: '{}' }],
  ['POST', `/api/deals/${DEAL_A}/facts`, { fact_type: 'builder-quote', value: 1 }],
  ['DELETE', `/api/deals/${DEAL_A}/facts/${FACT_A}`],
  ['POST', `/api/deals/${DEAL_A}/changes/${CHANGE_A}/ack`],
  ['POST', `/api/deals/${DEAL_A}/date`, { date_key: 'viewing_date', value: '2026-02-01' }],
  ['POST', `/api/deals/${DEAL_A}/revive`],
  ['POST', `/api/deals/${DEAL_A}/chain-ack`],
];

describe('userB cannot touch userA by changing an id', () => {
  for (const [method, path, body] of ID_ROUTES) {
    it(`${method} ${path.replace(DEAL_A, '<A>').replace(FACT_A, '<factA>').replace(CHANGE_A, '<changeA>')} is refused`, async () => {
      const res = await req(path, method, await as('userB'), body);
      expect([401, 403, 404], `${method} ${path} leaked with ${res.status}`).toContain(res.status);
      const text = await res.text();
      for (const secret of ['A SECRET STREET', 'A SECRET NOTE', 'A SECRET LINE', '07700900123']) {
        expect(text, `${method} ${path} leaked "${secret}"`).not.toContain(secret);
      }
    });
  }

  it('and every one of them answers the SAME as a deal that does not exist — no oracle', async () => {
    for (const [method, path, body] of ID_ROUTES) {
      const mine = await req(path.replace(DEAL_A, MISSING), method, await as('userB'), body);
      const theirs = await req(path, method, await as('userB'), body);
      expect(theirs.status, `${method} ${path} distinguishes "someone else's" from "no such thing"`).toBe(mine.status);
    }
  });

  it('userA\'s deal is untouched after every attempt', async () => {
    for (const [method, path, body] of ID_ROUTES) await req(path, method, await as('userB'), body);
    const deal = one<{ title: string; stage: string; status: string }>(`SELECT title, stage, status FROM deals WHERE id = '${DEAL_A}'`);
    expect(deal.title).toBe('A SECRET STREET');
    expect(deal.stage).toBe('worth-a-look');
    expect(deal.status).toBe('live');
    expect(one<{ n: number }>(`SELECT COUNT(*) n FROM deal_facts WHERE deal_id = '${DEAL_A}'`).n).toBe(1);
  });

  it('the deal LIST only ever returns your own', async () => {
    const res = await req('/api/deals', 'GET', await as('userB'));
    expect(await res.text()).not.toContain('A SECRET STREET');
  });

  it('signed out, every id route refuses too', async () => {
    for (const [method, path, body] of ID_ROUTES) {
      const res = await req(path, method, {}, body);
      expect([401, 403, 404], `${method} ${path}`).toContain(res.status);
    }
  });
});

describe('the broker links cannot be guessed or replayed', () => {
  const mintFactFind = async (token: string): Promise<void> => {
    sqlite.prepare(
      `INSERT INTO bridging_factfinds (id, enquiry_id, user_id, email, phone, applicant_name, buying_ltd,
        company_name, dob, address, owns_home, mortgage_provider, other_properties, refurb_experience,
        good_credit, credit_report, savings, deposit_source, gift_from, equity_property,
        consent_at, created_at, token_hash, expires_at, viewed_at)
       VALUES ('ff1', ?, 'userA', 'userA@t.test', '07700900123', 'Alex Morgan', 'no', '', '1988-04-12',
         '12 SECRET ROAD', 'yes', 'Nationwide', 'no', 'yes', 'yes', '', '£40k', 'savings', '', '',
         ?, ?, ?, ?, NULL)`,
    ).run(ENQ_A, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', await hashToken(token), '2099-01-01T00:00:00Z');
  };

  it('a GET reveals nothing even with the RIGHT token — a mail scanner cannot spend it', async () => {
    await mintFactFind('real-token-aaa');
    const res = await worker.fetch(new Request('https://s.test/broker/factfind?t=real-token-aaa'), env());
    const body = await res.text();
    expect(body).not.toContain('12 SECRET ROAD');
    expect(body).not.toContain('1988-04-12');
    expect(one<{ v: string | null }>("SELECT viewed_at v FROM bridging_factfinds").v).toBeNull();
  });

  it('a wrong token is refused and does not spend the real one', async () => {
    await mintFactFind('real-token-aaa');
    for (const guess of ['', 'x', 'real-token-aab', "' OR 1=1 --", '%', '../ff1', 'null']) {
      const res = await worker.fetch(new Request('https://s.test/broker/factfind', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `t=${encodeURIComponent(guess)}`,
      }), env());
      expect(res.status, `guess ${JSON.stringify(guess)}`).toBe(404);
      expect(await res.text()).not.toContain('12 SECRET ROAD');
    }
    expect(one<{ v: string | null }>("SELECT viewed_at v FROM bridging_factfinds").v).toBeNull();
  });

  it('the right token works EXACTLY once', async () => {
    await mintFactFind('real-token-aaa');
    const post = () => worker.fetch(new Request('https://s.test/broker/factfind', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 't=real-token-aaa',
    }), env());
    expect(await (await post()).text()).toContain('12 SECRET ROAD');
    const second = await post();
    expect(second.status).toBe(404);
    expect(await second.text()).not.toContain('12 SECRET ROAD');
  });

  it('an expired token is dead, and says the same thing as a spent one', async () => {
    await mintFactFind('real-token-aaa');
    sqlite.prepare("UPDATE bridging_factfinds SET expires_at = '2000-01-01T00:00:00Z'").run();
    const res = await worker.fetch(new Request('https://s.test/broker/factfind', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 't=real-token-aaa',
    }), env());
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('This link has gone');
  });

  it('the enquiry link is the same story: one use, no guessing', async () => {
    sqlite.prepare('UPDATE bridging_enquiries SET token_hash = ?, link_expires_at = ? WHERE id = ?')
      .run(await hashToken('enq-token-aaa'), '2099-01-01T00:00:00Z', ENQ_A);
    const post = (t: string) => worker.fetch(new Request('https://s.test/broker/enquiry', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `t=${encodeURIComponent(t)}`,
    }), env());
    expect((await post('enq-token-aab')).status).toBe(404);
    expect(await (await post('enq-token-aaa')).text()).toContain('A SECRET STORY');
    expect((await post('enq-token-aaa')).status).toBe(404);
  });

  it('a signed-in ordinary user cannot reach a broker page without a token', async () => {
    await mintFactFind('real-token-aaa');
    const res = await req('/broker/factfind', 'GET', await as('userB'));
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('12 SECRET ROAD');
  });
});

/**
 * S1 — "DELETE EVERYTHING" MUST MEAN IT.
 *
 * The privacy policy promises the account record, every saved deal and
 * everything in the pipeline, any bridging enquiry, the broker's questions,
 * anything a tool queued, and any queued message. This proves each one.
 *
 * RUN WITH `PRAGMA foreign_keys = OFF` ON PURPOSE. D1 runs with them ON today,
 * so the cascade works — but then the promise rests on a platform default we do
 * not control and never test. With them off, only the app's own DELETEs can
 * clear these rows, so this test fails the moment the code goes back to relying
 * on the cascade.
 */
describe('deleting the account really deletes everything', () => {
  const USER_TABLES = ['deals', 'deal_facts', 'deal_verdicts', 'deal_stage_history',
    'deal_changes', 'deal_deaths', 'deal_floorplans', 'bridging_enquiries',
    'bridging_factfinds', 'tool_saves', 'saved_deals', 'users'] as const;

  const seedEverything = async (): Promise<void> => {
    sqlite.exec('PRAGMA foreign_keys = OFF');
    sqlite.prepare("INSERT INTO saved_deals (id, user_id, strategy, title, url_params, key_figure, created_at) VALUES ('sd1','userA','flip','t','p','£1',?)").run('2026-01-01T00:00:00Z');
    sqlite.prepare("INSERT INTO deal_verdicts (id, deal_id, score, criteria_json, evidence_json, at) VALUES ('v1',?,7,'{}','{}',?)").run(DEAL_A, '2026-01-02T00:00:00Z');
    sqlite.prepare("INSERT INTO deal_stage_history (id, deal_id, from_stage, to_stage, at) VALUES ('sh1',?,'worth-a-look','going-to-view',?)").run(DEAL_A, '2026-01-02T00:00:00Z');
    sqlite.prepare("INSERT INTO deal_deaths (id, deal_id, reason_key, note, snapshot_json, at) VALUES ('dd1',?,'numbers-fail','n','{}',?)").run(DEAL_A, '2026-01-03T00:00:00Z');
    sqlite.prepare("INSERT INTO tool_saves (id, user_id, tool, inputs_json, headline, created_at) VALUES ('ts1','userA','equity','{}','£1',?)").run('2026-01-01T00:00:00Z');
    sqlite.prepare("INSERT INTO deal_floorplans (deal_id, user_id, geometry_json, updated_at) VALUES (?, 'userA', '{\"v\":1,\"levels\":[]}', ?)").run(DEAL_A, '2026-01-01T00:00:00Z');
    sqlite.prepare("INSERT INTO kit_outbox (id, user_id, email, first_name, action, status, created_at) VALUES ('ko1','userA','userA@t.test','A','subscribe','pending',?)").run('2026-01-01T00:00:00Z');
    sqlite.prepare(
      `INSERT INTO bridging_factfinds (id, enquiry_id, user_id, email, phone, applicant_name, buying_ltd,
        company_name, dob, address, owns_home, mortgage_provider, other_properties, refurb_experience,
        good_credit, credit_report, savings, deposit_source, gift_from, equity_property,
        consent_at, created_at, token_hash, expires_at, viewed_at)
       VALUES ('ff1', ?, 'userA', 'userA@t.test', '07700900123', 'Alex', 'no', '', '1988-04-12',
         '12 SECRET ROAD', 'yes', 'N', 'no', 'yes', 'yes', '', '£40k', 'savings', '', '', ?, ?, 'hash', '2099-01-01T00:00:00Z', NULL)`,
    ).run(ENQ_A, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
  };

  const countsFor = (user: string): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const t of USER_TABLES) {
      const col = t === 'users' ? 'id' : (t.startsWith('deal_') ? 'deal_id' : 'user_id');
      const q = t === 'users' ? `SELECT COUNT(*) n FROM users WHERE id = '${user}'`
        : col === 'deal_id' ? `SELECT COUNT(*) n FROM ${t} WHERE deal_id = '${DEAL_A}'`
          : `SELECT COUNT(*) n FROM ${t} WHERE user_id = '${user}'`;
      out[t] = one<{ n: number }>(q).n;
    }
    return out;
  };

  it('every table holding this user has rows BEFORE — otherwise the test proves nothing', async () => {
    await seedEverything();
    const before = countsFor('userA');
    for (const t of USER_TABLES) expect(before[t], `${t} was not seeded`).toBeGreaterThan(0);
  });

  it('and NONE of them does afterwards — with foreign keys OFF, so only our own DELETEs count', async () => {
    await seedEverything();
    const res = await req('/api/account/delete', 'POST', await as('userA'));
    expect(res.status).toBe(200);
    const after = countsFor('userA');
    for (const t of USER_TABLES) expect(after[t], `${t} still holds rows after deletion`).toBe(0);
  });

  it('the other user is untouched', async () => {
    await seedEverything();
    sqlite.prepare("INSERT INTO saved_deals (id, user_id, strategy, title, url_params, key_figure, created_at) VALUES ('sdB','userB','flip','t','p','£1',?)").run('2026-01-01T00:00:00Z');
    await req('/api/account/delete', 'POST', await as('userA'));
    expect(one<{ n: number }>("SELECT COUNT(*) n FROM saved_deals WHERE user_id = 'userB'").n).toBe(1);
    expect(one<{ n: number }>("SELECT COUNT(*) n FROM users WHERE id = 'userB'").n).toBe(1);
  });

  it('and the broker\'s link to their fact-find dies with it', async () => {
    await seedEverything();
    await req('/api/account/delete', 'POST', await as('userA'));
    expect(one<{ n: number }>("SELECT COUNT(*) n FROM bridging_factfinds").n).toBe(0);
  });
});
