/**
 * The tool lead endpoint (T3), end to end against a real SQLite.
 *
 * THE LAW: the answer was never gated, so this endpoint only ever runs because
 * someone ASKED for their figures by email. It must refuse anything it cannot
 * honestly deliver, refuse an untriggered consent, and never let a typed
 * address through without a human check.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from './index';
import { SESSION_COOKIE } from './lib/cookies';
import { signSession } from './lib/jwt';
import { features } from '../config/features';
import { CAPTURE_TOOLS, KIT_FIELDS } from '../config/capture';

const MIG = (n: string) => readFileSync(fileURLToPath(new URL(`../../migrations/${n}`, import.meta.url)), 'utf8');
const MIGRATIONS = [
  '0001_init.sql', '0002_outbox_action.sql', '0003_deals_idempotent_outbox_backoff.sql',
  '0004_deals_key_includes_strategy.sql', '0005_deal_pipeline.sql', '0006_deal_headline_figure.sql',
  '0007_deal_is_auction.sql', '0008_deal_verdict_line.sql', '0012_deal_sold_evidence.sql', '0013_deal_changes.sql', '0014_folded_facts_and_room_sizes.sql', '0015_deal_dates_and_staleness.sql', '0016_deal_deaths.sql', '0017_deal_viewing_date.sql', '0018_chain_risk_ack.sql', '0019_bridging_factfind.sql', '0009_bridging_enquiries.sql', '0020_factfind_consent_record.sql',
  '0010_tool_saves.sql', '0011_outbox_fields.sql',
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
const authed = async () => ({ Cookie: `${SESSION_COOKIE}=${await signSession({ sub: 'u1', email: 'gil@t.test', name: 'Gil Person', avatar: '' }, 'test-secret')}` });

const FIGURES = { headline: '£171,494 of equity', detail: 'Estimated value £266,494.', maths: '£180,000 × (102.6 ÷ 69.3) − £95,000' };
const post = async (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  worker.fetch(new Request('https://s.test/api/tools/lead', {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), env());
const rows = <T>(sql: string): T[] => sqlite.prepare(sql).all() as T[];

/** The equity tool, made deliverable for the duration of a test. */
const equity = CAPTURE_TOOLS.find((t) => t.slug === 'equity') as { kitTag: string; kitAutomation: string };
let savedTag: string;
let savedAutomation: string;
let turnstileOk = true;

beforeEach(() => {
  features.toolsSection = true;
  features.toolCapture = true;
  turnstileOk = true;
  savedTag = equity.kitTag;
  savedAutomation = equity.kitAutomation;
  sqlite = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) sqlite.exec(MIG(m));
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('challenges.cloudflare.com')) return new Response(JSON.stringify({ success: turnstileOk }), { status: 200 });
    return new Response('{}', { status: 200 });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  equity.kitTag = savedTag;
  equity.kitAutomation = savedAutomation;
  features.toolsSection = true;
  features.toolCapture = true;
});

/** Make the equity offer real, the way the operator will. */
const makeDeliverable = (): void => {
  equity.kitTag = '12345';
  equity.kitAutomation = 'Equity breakdown';
};

describe('POST /api/tools/lead (T3)', () => {
  it('refuses a tool whose Kit tag and automation are not set up — we never promise an email nobody sends', async () => {
    equity.kitTag = '';
    equity.kitAutomation = '';
    const res = await post({ tool: 'equity', email: 'a@b.co', consent: true, ...FIGURES });
    expect(res.status).toBe(404);
    expect(rows("SELECT * FROM kit_outbox").length).toBe(0);
  });

  it('refuses when the flag is off', async () => {
    makeDeliverable();
    features.toolCapture = false;
    expect((await post({ tool: 'equity', email: 'a@b.co', consent: true, ...FIGURES })).status).toBe(404);
  });

  it('refuses without consent — there is no row without a tick', async () => {
    makeDeliverable();
    const res = await post({ tool: 'equity', email: 'a@b.co', consent: false, turnstile: 'tok', ...FIGURES });
    expect(res.status).toBe(400);
    expect(rows("SELECT * FROM kit_outbox").length).toBe(0);
  });

  it('a typed address must pass the human check', async () => {
    makeDeliverable();
    turnstileOk = false;
    const res = await post({ tool: 'equity', email: 'a@b.co', consent: true, turnstile: 'tok', ...FIGURES });
    expect(res.status).toBe(403);
    expect(rows("SELECT * FROM kit_outbox").length).toBe(0);
  });

  it('a typed address must look like an address', async () => {
    makeDeliverable();
    for (const bad of ['', 'nope', 'a@b', 'a b@c.co']) {
      const res = await post({ tool: 'equity', email: bad, consent: true, turnstile: 'tok', ...FIGURES });
      expect(res.status, bad).toBe(400);
    }
  });

  it('a typed address that passes queues ONE row, tagged for that tool, with their figures', async () => {
    makeDeliverable();
    const res = await post({ tool: 'equity', email: 'Cold@Visitor.CO', consent: true, turnstile: 'tok', ...FIGURES });
    expect(res.status).toBe(200);
    const queued = rows<{ email: string; action: string; user_id: string | null; fields_json: string }>("SELECT email, action, user_id, fields_json FROM kit_outbox");
    expect(queued.length).toBe(1);
    expect(queued[0].email).toBe('cold@visitor.co');
    expect(queued[0].action).toBe('lead-equity');
    expect(queued[0].user_id).toBe(null);
    const fields = JSON.parse(queued[0].fields_json) as Record<string, string>;
    expect(fields[KIT_FIELDS.headline]).toBe(FIGURES.headline);
    expect(fields[KIT_FIELDS.maths]).toBe(FIGURES.maths);
  });

  it('a signed-in person needs no typing and no human check — the sign-in IS the check', async () => {
    makeDeliverable();
    const res = await post({ tool: 'equity', consent: true, ...FIGURES }, await authed());
    expect(res.status).toBe(200);
    const queued = rows<{ email: string; action: string; user_id: string; first_name: string }>("SELECT email, action, user_id, first_name FROM kit_outbox");
    expect(queued.length).toBe(1);
    expect(queued[0].email).toBe('gil@t.test');
    expect(queued[0].user_id).toBe('u1');
    expect(queued[0].first_name).toBe('Gil');
  });

  it('each tool queues its OWN action, so Kit can tell which tool brought someone in', async () => {
    const yieldTool = CAPTURE_TOOLS.find((t) => t.slug === 'rental-yield') as { kitTag: string; kitAutomation: string };
    const tag = yieldTool.kitTag;
    const automation = yieldTool.kitAutomation;
    yieldTool.kitTag = '999';
    yieldTool.kitAutomation = 'Yield breakdown';
    try {
      const res = await post({ tool: 'rental-yield', email: 'a@b.co', consent: true, turnstile: 'tok', ...FIGURES });
      expect(res.status).toBe(200);
      expect(rows<{ action: string }>("SELECT action FROM kit_outbox")[0].action).toBe('lead-rental-yield');
    } finally {
      yieldTool.kitTag = tag;
      yieldTool.kitAutomation = automation;
    }
  });

  it('an oversized body is trimmed, never stored whole', async () => {
    makeDeliverable();
    await post({ tool: 'equity', email: 'a@b.co', consent: true, turnstile: 'tok', headline: 'x'.repeat(5000), detail: 'y'.repeat(5000), maths: 'z'.repeat(5000) });
    const fields = JSON.parse(rows<{ fields_json: string }>("SELECT fields_json FROM kit_outbox")[0].fields_json) as Record<string, string>;
    expect(fields[KIT_FIELDS.headline].length).toBe(200);
    expect(fields[KIT_FIELDS.detail].length).toBe(400);
    expect(fields[KIT_FIELDS.maths].length).toBe(600);
  });

  it('"use another email" really uses it, even when they are signed in', async () => {
    makeDeliverable();
    const res = await post({ tool: 'equity', email: 'other@place.co', consent: true, turnstile: 'tok', ...FIGURES }, await authed());
    expect(res.status).toBe(200);
    const queued = rows<{ email: string; first_name: string }>("SELECT email, first_name FROM kit_outbox");
    expect(queued[0].email).toBe('other@place.co');
    // and we do not overwrite that subscriber's name in Kit with a blank
    expect(queued[0].first_name).toBe('');
  });

  it('a signed-in tick is recorded as consent on the account, so deletion can undo it', async () => {
    makeDeliverable();
    sqlite.exec("INSERT INTO users (id, email, name, avatar_url, created_at, marketing_consent) VALUES ('u1','gil@t.test','Gil Person','',datetime('now'),0)");
    await post({ tool: 'equity', consent: true, ...FIGURES }, await authed());
    const u = rows<{ marketing_consent: number; consent_ts: string | null }>("SELECT marketing_consent, consent_ts FROM users WHERE id = 'u1'")[0];
    expect(u.marketing_consent).toBe(1);
    expect(u.consent_ts).not.toBe(null);
  });

  it('deleting the account erases a lead queued from the same address before they signed up', async () => {
    makeDeliverable();
    await post({ tool: 'equity', email: 'gil@t.test', consent: true, turnstile: 'tok', ...FIGURES });
    expect(rows("SELECT * FROM kit_outbox WHERE action = 'lead-equity'").length).toBe(1);
    sqlite.exec("INSERT INTO users (id, email, name, avatar_url, created_at, marketing_consent) VALUES ('u1','gil@t.test','Gil Person','',datetime('now'),0)");
    const res = await worker.fetch(new Request('https://s.test/api/account/delete', { method: 'POST', headers: await authed() }), env());
    expect(res.status).toBe(200);
    expect(rows("SELECT * FROM kit_outbox WHERE action = 'lead-equity'").length).toBe(0);
  });

  it('an unknown tool is refused', async () => {
    makeDeliverable();
    expect((await post({ tool: 'not-a-tool', email: 'a@b.co', consent: true, turnstile: 'tok', ...FIGURES })).status).toBe(404);
  });
});
