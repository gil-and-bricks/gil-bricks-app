/**
 * The bridging endpoint (F1), end to end against a real SQLite: sign-in gate,
 * Turnstile, the SAME qualification the browser ran, D1 first, then the Kit
 * outbox row. A Kit outage must never lose an enquiry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from './index';
import { SESSION_COOKIE } from './lib/cookies';
import { signSession } from './lib/jwt';
import { features } from '../config/features';
import { BRIDGING_RULES } from '../config/bridging';

const MIG = (n: string) => readFileSync(fileURLToPath(new URL(`../../migrations/${n}`, import.meta.url)), 'utf8');
const MIGRATIONS = [
  '0001_init.sql', '0002_outbox_action.sql', '0003_deals_idempotent_outbox_backoff.sql',
  '0004_deals_key_includes_strategy.sql', '0005_deal_pipeline.sql', '0006_deal_headline_figure.sql',
  '0007_deal_is_auction.sql', '0008_deal_verdict_line.sql', '0009_bridging_enquiries.sql',
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
const env = (): Env => ({ ASSETS: { fetch: async () => new Response('a') }, DB: makeD1(sqlite), JWT_SECRET: 'test-secret', GOOGLE_CLIENT_SECRET: 'x', TURNSTILE_SECRET: 'ts-secret', KIT_API_KEY: 'k' }) as Env;
const authed = async (user = 'u1') => ({ Cookie: `${SESSION_COOKIE}=${await signSession({ sub: user, email: `${user}@t.test`, name: 'Test Person', avatar: '' }, 'test-secret')}` });

const STORY =
  'I have agreed a three-bed terrace in Swansea at £120,000. It needs a kitchen, bathroom and rewire, about £25,000. ' +
  'I am putting in £45,000 of my own cash and want to bridge the rest. When the work is done I will refinance onto a ' +
  'buy-to-let mortgage at about £165,000 and repay the bridge from that.';
const QUALIFIED = {
  loan: '95000', deposit: '25-plus', property: 'found', entity: 'ltd', exit: 'refinance',
  story: STORY, timing: '4-weeks', credit: 'none', phone: '07700 900123', consent: true, turnstile: 'tok',
};
const send = async (body: Record<string, unknown>, headers: Record<string, string>) =>
  worker.fetch(new Request('https://s.test/api/bridging', {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), env());
const rows = <T>(sql: string): T[] => sqlite.prepare(sql).all() as T[];

/** Turnstile and Kit are both network: the test owns them. */
let turnstileOk = true;
let kitOk = true;
beforeEach(() => {
  features.bridgingFinance = true;
  turnstileOk = true;
  kitOk = true;
  sqlite = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) sqlite.exec(MIG(m));
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('challenges.cloudflare.com')) return new Response(JSON.stringify({ success: turnstileOk }), { status: 200 });
    if (url.includes('api.kit.com')) {
      if (!kitOk) return new Response('down', { status: 503 });
      return new Response('{}', { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  features.bridgingFinance = true;
});

describe('POST /api/bridging (F1)', () => {
  it('refuses a signed-out visitor — the form never renders for them either', async () => {
    const res = await send(QUALIFIED, {});
    expect(res.status).toBe(401);
    expect(rows('SELECT * FROM bridging_enquiries').length).toBe(0);
  });

  it('refuses when the human check fails, and stores nothing', async () => {
    turnstileOk = false;
    const res = await send(QUALIFIED, await authed());
    expect(res.status).toBe(403);
    expect(rows('SELECT * FROM bridging_enquiries').length).toBe(0);
  });

  it('refuses an incomplete enquiry, including an unticked consent box', async () => {
    expect((await send({ ...QUALIFIED, phone: '' }, await authed())).status).toBe(400);
    expect((await send({ ...QUALIFIED, consent: false }, await authed())).status).toBe(400);
    expect(rows('SELECT * FROM bridging_enquiries').length).toBe(0);
  });

  it('QUALIFIED: stores the enquiry, queues the qualified tag, answers honestly', async () => {
    const res = await send(QUALIFIED, await authed());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: 'qualified', reasons: [] });
    const [row] = rows<{ outcome: string; reasons: string; loan: number; phone: string; email: string; consent_at: string; story: string }>('SELECT * FROM bridging_enquiries');
    expect(row.outcome).toBe('qualified');
    expect(row.reasons).toBe('');
    expect(row.loan).toBe(95000);
    expect(row.phone).toBe('07700900123');
    expect(row.email).toBe('u1@t.test');
    expect(row.consent_at).not.toBe('');
    expect(row.story.length).toBeGreaterThanOrEqual(BRIDGING_RULES.minStoryChars);
    const [out] = rows<{ action: string; status: string }>("SELECT * FROM kit_outbox WHERE action LIKE 'bridging%'");
    expect(out.action).toBe('bridging-qualified');
  });

  it('NOT YET: the same path, the other tag, and the reasons are recorded', async () => {
    const res = await send({ ...QUALIFIED, deposit: 'under-10', property: 'looking', timing: 'researching' }, await authed());
    expect((await res.json() as { outcome: string }).outcome).toBe('not-yet');
    const [row] = rows<{ outcome: string; reasons: string }>('SELECT * FROM bridging_enquiries');
    expect(row.outcome).toBe('not-yet');
    expect(row.reasons.split(',').sort()).toEqual(['deposit-below-minimum', 'just-researching', 'no-property-yet']);
    const [out] = rows<{ action: string }>("SELECT * FROM kit_outbox WHERE action LIKE 'bridging%'");
    expect(out.action).toBe('bridging-not-yet');
  });

  it('the browser cannot talk its way past a threshold — the server re-decides', async () => {
    // a client that lies about its own outcome changes nothing
    const res = await send({ ...QUALIFIED, deposit: 'under-10', outcome: 'qualified' }, await authed());
    expect((await res.json() as { outcome: string }).outcome).toBe('not-yet');
  });

  it('KIT DOWN: the enquiry is still stored, the row waits for the cron, the user still gets an answer', async () => {
    kitOk = false;
    const res = await send(QUALIFIED, await authed());
    expect(res.status).toBe(200);
    expect((await res.json() as { outcome: string }).outcome).toBe('qualified');
    expect(rows('SELECT * FROM bridging_enquiries').length).toBe(1);
    const [out] = rows<{ status: string; attempts: number; last_error: string }>("SELECT * FROM kit_outbox WHERE action LIKE 'bridging%'");
    expect(out.status).toBe('pending');
    expect(out.attempts).toBeGreaterThanOrEqual(1);
    expect(out.last_error).not.toBe('');
  });

  it('with the flag off the endpoint does not exist', async () => {
    features.bridgingFinance = false;
    const res = await send(QUALIFIED, await authed());
    expect(res.status).toBe(404);
    expect(rows('SELECT * FROM bridging_enquiries').length).toBe(0);
  });

  it('no deal data can ride along — only the answers are stored', async () => {
    await send({ ...QUALIFIED, url_params: 'postcode=CF37+1HR&price=150000', score: 8.2 }, await authed());
    const [row] = rows<Record<string, unknown>>('SELECT * FROM bridging_enquiries');
    expect(Object.keys(row)).not.toContain('url_params');
    expect(Object.keys(row)).not.toContain('score');
    expect(JSON.stringify(row)).not.toContain('CF37');
  });
});
