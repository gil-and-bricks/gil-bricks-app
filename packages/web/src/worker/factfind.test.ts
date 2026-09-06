/**
 * THE BROKER'S FACT-FIND, END TO END (F2).
 *
 * The rules this holds, in order of how much damage breaking them would do:
 *   1. NOTHING PERSONAL REACHES KIT. Kit is a marketing platform; a date of
 *      birth, a home address and a credit answer must never enter one. All Kit
 *      is ever told is the broker's own address and a link.
 *   2. It exists only after OUR filter passes, only for the person's own
 *      enquiry, and only when there is a broker to send it to.
 *   3. The link works ONCE, expires, and reveals nothing to a GET — because
 *      email scanners follow links and must not be able to spend the one use.
 *   4. Retention deletes it, and deleting the account deletes it now.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from './index';
import { SESSION_COOKIE } from './lib/cookies';
import { signSession } from './lib/jwt';
import { features } from '../config/features';
import { BROKER, FACTFIND_RULES } from '../config/bridging';
import { siteConfig } from '../site.config';
import { columnsCoverEveryField, hashToken, purgeFactFinds } from './lib/factfind';

const MIG = (n: string) => readFileSync(fileURLToPath(new URL(`../../migrations/${n}`, import.meta.url)), 'utf8');
const MIGRATIONS = [
  '0001_init.sql', '0002_outbox_action.sql', '0003_deals_idempotent_outbox_backoff.sql',
  '0004_deals_key_includes_strategy.sql', '0005_deal_pipeline.sql', '0006_deal_headline_figure.sql',
  '0007_deal_is_auction.sql', '0008_deal_verdict_line.sql', '0009_bridging_enquiries.sql', '0020_factfind_consent_record.sql',
  // account deletion reaches into these too, so the fixture carries them
  '0010_tool_saves.sql', '0011_outbox_fields.sql', '0019_bridging_factfind.sql',
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
let kitCalls: { url: string; body: string }[] = [];
const env = (): Env => ({ ASSETS: { fetch: async () => new Response('a') }, DB: makeD1(sqlite), JWT_SECRET: 'test-secret', GOOGLE_CLIENT_SECRET: 'x', TURNSTILE_SECRET: 'ts', KIT_API_KEY: 'k' }) as Env;
const authed = async (user = 'u1') => ({ Cookie: `${SESSION_COOKIE}=${await signSession({ sub: user, email: `${user}@t.test`, name: 'Test Person', avatar: '' }, 'test-secret')}` });

const ENQUIRY = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ANSWERS = {
  name: 'Alex Morgan', ltd: 'yes', companyName: 'Bryn Property Ltd', dob: '1988-04-12',
  address: '12 Bryn Road, Swansea, SA2 0AA', ownsHome: 'yes', mortgageProvider: 'Nationwide',
  otherProperties: 'no', refurbExperience: 'yes', goodCredit: 'no', creditReport: 'yes',
  savings: 'About £40,000', depositSource: 'gift', giftFrom: 'My mother',
};
const post = async (body: Record<string, unknown>, headers: Record<string, string>) =>
  worker.fetch(new Request('https://s.test/api/bridging/factfind', {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), env());
const send = (over: Record<string, unknown> = {}, headers?: Record<string, string>) =>
  post({ ...ANSWERS, enquiry_id: ENQUIRY, consent: true, ...over }, headers ?? { Cookie: '' });
const rows = <T>(sql: string): T[] => sqlite.prepare(sql).all() as T[];
const one = <T>(sql: string): T => sqlite.prepare(sql).get() as T;

const enquiry = (id: string, user: string, outcome: string): void => {
  sqlite.prepare(
    `INSERT INTO bridging_enquiries (id, user_id, email, first_name, phone, loan, deposit_band, property_state,
      entity, exit_route, story, timing, credit, outcome, reasons, consent_at, created_at)
     VALUES (?, ?, ?, 'Test', '07700900123', 95000, '25-plus', 'found', 'ltd', 'refinance', 's', '4-weeks', 'none', ?, '', ?, ?)`,
  ).run(id, user, `${user}@t.test`, outcome, '2026-09-06T00:00:00Z', '2026-09-06T00:00:00Z');
};

const REAL_BROKER = { name: 'Test Broker', email: 'broker@test.test', inbox: 'inbox@test.test', kitTagQualified: '1', kitTagNotYet: '2', kitTagFactFind: '3' };
const savedBroker = { ...BROKER } as Record<string, string>;

beforeEach(() => {
  Object.assign(BROKER as unknown as Record<string, string>, REAL_BROKER);
  features.bridgingFinance = true;
  features.brokerFactFind = true;
  kitCalls = [];
  sqlite = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) sqlite.exec(MIG(m));
  sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run('u1', 'u1@t.test', 'Test Person', '2026-01-01T00:00:00Z');
  sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run('u2', 'u2@t.test', 'Someone Else', '2026-01-01T00:00:00Z');
  enquiry(ENQUIRY, 'u1', 'qualified');
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('api.kit.com')) {
      kitCalls.push({ url, body: String(init?.body ?? '') });
      return new Response('{}', { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
});
afterEach(() => {
  Object.assign(BROKER as unknown as Record<string, string>, savedBroker);
  vi.unstubAllGlobals();
  features.bridgingFinance = true;
  features.brokerFactFind = true;
});

describe('nothing personal reaches Kit', () => {
  it('Kit is told the BROKER’s address and a link — and nothing else', async () => {
    expect((await send({}, await authed())).status).toBe(200);
    const everythingKitSaw = kitCalls.map((c) => `${c.url} ${c.body}`).join(' ');
    // the answers themselves
    for (const secret of [ANSWERS.dob, ANSWERS.address, ANSWERS.name, ANSWERS.savings, ANSWERS.giftFrom, ANSWERS.mortgageProvider, ANSWERS.companyName]) {
      expect(everythingKitSaw, secret).not.toContain(secret);
    }
    // and the person themselves: not their email, not their phone
    expect(everythingKitSaw).not.toContain('u1@t.test');
    expect(everythingKitSaw).not.toContain('07700900123');
    // what it DID get: the broker, and a link
    expect(everythingKitSaw).toContain('broker@test.test');
    expect(everythingKitSaw).toContain('/broker/factfind?t=');
  });

  it('and the queued row itself holds no answer either', async () => {
    await send({}, await authed());
    const row = one<{ email: string; first_name: string; fields_json: string }>(
      "SELECT email, first_name, fields_json FROM kit_outbox WHERE action = 'factfind-ready'",
    );
    expect(row.email).toBe('broker@test.test');
    expect(row.first_name).toBe('Test Broker');
    // the link travelled to Kit, and our own copy of it is dropped the moment
    // Kit has taken it — a live bearer token has no business sitting in our
    // database for three days (F2 review)
    expect(kitCalls.map((c) => c.body).join(' ')).toContain('/broker/factfind?t=');
    expect(row.fields_json, 'no live link left behind').toBeNull();
  });

  it('the token itself never touches the database — only its hash', async () => {
    await send({}, await authed());
    const token = decodeURIComponent(/t=([^"&\\]+)/.exec(kitCalls.map((c) => c.body).join(' '))?.[1] ?? '');
    expect(token.length).toBeGreaterThan(20);
    const stored = one<{ token_hash: string }>('SELECT token_hash FROM bridging_factfinds');
    expect(stored.token_hash).toBe(await hashToken(token));
    const everything = JSON.stringify(rows('SELECT * FROM kit_outbox')) + JSON.stringify(rows('SELECT * FROM bridging_factfinds'));
    expect(everything, 'nowhere in the database').not.toContain(token);
  });

});

describe('who may send one, and when', () => {
  it('a signed-out visitor cannot', async () => {
    expect((await send()).status).toBe(401);
    expect(rows('SELECT * FROM bridging_factfinds').length).toBe(0);
  });

  it('only against your OWN qualified enquiry', async () => {
    enquiry(OTHER, 'u2', 'qualified');
    expect((await send({ enquiry_id: OTHER }, await authed())).status).toBe(404);
    expect(rows('SELECT * FROM bridging_factfinds').length).toBe(0);
  });

  it('never against a NOT-YET enquiry — our filter is the door', async () => {
    const notYet = '33333333-3333-4333-8333-333333333333';
    enquiry(notYet, 'u1', 'not-yet');
    expect((await send({ enquiry_id: notYet }, await authed())).status).toBe(404);
    expect(rows('SELECT * FROM bridging_factfinds').length).toBe(0);
  });

  it('needs the consent tick, and every asked answer', async () => {
    expect((await send({ consent: false }, await authed())).status).toBe(400);
    expect((await send({ dob: '' }, await authed())).status).toBe(400);
    expect((await send({ dob: '2020-01-01' }, await authed())).status, 'a child').toBe(400);
    // asked because ltd = yes
    expect((await send({ companyName: '' }, await authed())).status).toBe(400);
    expect(rows('SELECT * FROM bridging_factfinds').length).toBe(0);
  });

  it('stores only what was asked — a company name from a personal buyer is refused', async () => {
    expect((await send({ ltd: 'no', companyName: 'Ghost Ltd' }, await authed())).status).toBe(200);
    const row = one<{ company_name: string; buying_ltd: string }>('SELECT company_name, buying_ltd FROM bridging_factfinds');
    expect(row.buying_ltd).toBe('no');
    expect(row.company_name, 'never kept, however it was sent').toBe('');
  });

  it('records the consent EVENT on the enquiry, so it outlives the data', async () => {
    await send({}, await authed());
    const row = one<{ factfind_consent_at: string | null; factfind_consent_version: string | null }>(
      'SELECT factfind_consent_at, factfind_consent_version FROM bridging_enquiries WHERE id = ?'.replace('?', `'${ENQUIRY}'`),
    );
    expect(row.factfind_consent_at).not.toBeNull();
    expect(row.factfind_consent_version, 'which wording they agreed to').toBe(siteConfig.consentVersion);
    // …and it survives the answers being deleted
    await purgeFactFinds(makeD1(sqlite) as unknown as D1Database, Date.now() + 400 * 86_400_000);
    expect(rows('SELECT * FROM bridging_factfinds').length).toBe(0);
    expect(one<{ factfind_consent_at: string | null }>(
      `SELECT factfind_consent_at FROM bridging_enquiries WHERE id = '${ENQUIRY}'`,
    ).factfind_consent_at, 'the record that they agreed remains').not.toBeNull();
  });

  it('once per enquiry: a second submission changes nothing', async () => {
    await send({}, await authed());
    const res = await send({ name: 'Someone Else Entirely' }, await authed());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ alreadySent: true });
    expect(rows('SELECT * FROM bridging_factfinds').length).toBe(1);
    expect(one<{ applicant_name: string }>('SELECT applicant_name FROM bridging_factfinds').applicant_name).toBe('Alex Morgan');
  });

  it('is 404 with the flag off, and 404 with no broker to send it to', async () => {
    features.brokerFactFind = false;
    expect((await send({}, await authed())).status).toBe(404);
    features.brokerFactFind = true;
    Object.assign(BROKER as unknown as Record<string, string>, { kitTagFactFind: '' });
    expect((await send({}, await authed())).status).toBe(404);
    expect(rows('SELECT * FROM bridging_factfinds').length).toBe(0);
  });
});

describe('the broker’s one-time link', () => {
  /** The link as KIT received it — our own copy is redacted the moment it lands. */
  const linkToken = (): string => decodeURIComponent(/t=([^"&\\]+)/.exec(kitCalls.map((c) => c.body).join(' '))?.[1] ?? '');
  const open = async (token: string, method: 'GET' | 'POST') =>
    worker.fetch(method === 'GET'
      ? new Request(`https://s.test/broker/factfind?t=${encodeURIComponent(token)}`)
      : new Request('https://s.test/broker/factfind', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `t=${encodeURIComponent(token)}`,
      }), env());

  it('a GET reveals NOTHING — a scanner following the link cannot spend it', async () => {
    await send({}, await authed());
    const token = linkToken();
    const res = await open(token, 'GET');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const secret of [ANSWERS.dob, ANSWERS.address, ANSWERS.name, 'u1@t.test']) {
      expect(html, secret).not.toContain(secret);
    }
    expect(html).toContain('Show the details');
    expect(one<{ viewed_at: string | null }>('SELECT viewed_at FROM bridging_factfinds').viewed_at, 'still unspent').toBeNull();
  });

  it('a POST shows the details once, and never again', async () => {
    await send({}, await authed());
    const token = linkToken();
    const first = await open(token, 'POST');
    const html = await first.text();
    expect(first.status).toBe(200);
    // everything he needs to go and get quotes
    for (const shown of [ANSWERS.name, ANSWERS.dob, ANSWERS.address, ANSWERS.mortgageProvider, ANSWERS.giftFrom, 'u1@t.test', '07700900123']) {
      expect(html, shown).toContain(shown);
    }
    // labelled in the same words the person answered
    expect(html).toContain('Date of birth');
    expect(html).toContain('Bryn Property Ltd');
    // and it is spent
    expect(one<{ viewed_at: string | null }>('SELECT viewed_at FROM bridging_factfinds').viewed_at).not.toBeNull();
    const second = await open(token, 'POST');
    expect(second.status).toBe(404);
    expect(await second.text()).not.toContain(ANSWERS.address);
  });

  it('two taps arriving together spend the one use once', async () => {
    await send({}, await authed());
    const token = linkToken();
    const [a, b] = await Promise.all([open(token, 'POST'), open(token, 'POST')]);
    const shown = [await a.text(), await b.text()].filter((h) => h.includes(ANSWERS.address));
    expect(shown.length, 'exactly one of them saw the details').toBe(1);
  });

  it('never leaves the details in a cache or an index', async () => {
    await send({}, await authed());
    const res = await open(linkToken(), 'POST');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('an expired link is as dead as a used one', async () => {
    await send({}, await authed());
    sqlite.prepare("UPDATE bridging_factfinds SET expires_at = '2020-01-01T00:00:00Z'").run();
    const res = await open(linkToken(), 'POST');
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain(ANSWERS.dob);
  });

  it('a guessed or missing token says the same thing as a spent one', async () => {
    const guess = await open('not-a-real-token', 'POST');
    expect(guess.status).toBe(404);
    expect(await guess.text()).toContain('This link has gone');
    expect((await worker.fetch(new Request('https://s.test/broker/factfind'), env())).status).toBe(404);
  });

  it('and the page is shut entirely when the feature is off', async () => {
    await send({}, await authed());
    const token = linkToken();
    features.brokerFactFind = false;
    expect((await open(token, 'POST')).status).toBe(404);
  });
});

describe('how long it is kept', () => {
  it('goes days after he reads it, and at the maximum age whether he read it or not', async () => {
    await send({}, await authed());
    const day = 86_400_000;
    const now = Date.now();
    // read today: still here tomorrow
    sqlite.prepare('UPDATE bridging_factfinds SET viewed_at = ?').run(new Date(now).toISOString());
    await purgeFactFinds(makeD1(sqlite) as unknown as D1Database, now + day);
    expect(rows('SELECT * FROM bridging_factfinds').length).toBe(1);
    // …and gone once the viewed window has passed
    await purgeFactFinds(makeD1(sqlite) as unknown as D1Database, now + (FACTFIND_RULES.keepAfterViewedDays + 1) * day);
    expect(rows('SELECT * FROM bridging_factfinds').length).toBe(0);
  });

  it('an unread one still goes at the maximum age', async () => {
    await send({}, await authed());
    const now = Date.now();
    const day = 86_400_000;
    await purgeFactFinds(makeD1(sqlite) as unknown as D1Database, now + (FACTFIND_RULES.keepMaxDays - 1) * day);
    expect(rows('SELECT * FROM bridging_factfinds').length).toBe(1);
    await purgeFactFinds(makeD1(sqlite) as unknown as D1Database, now + (FACTFIND_RULES.keepMaxDays + 1) * day);
    expect(rows('SELECT * FROM bridging_factfinds').length).toBe(0);
  });

  it('the notification that carried the link goes with it', async () => {
    await send({}, await authed());
    expect(rows("SELECT * FROM kit_outbox WHERE action = 'factfind-ready'").length).toBe(1);
    const now = Date.now();
    await purgeFactFinds(makeD1(sqlite) as unknown as D1Database, now + (FACTFIND_RULES.keepMaxDays + 1) * 86_400_000);
    expect(rows('SELECT * FROM bridging_factfinds').length).toBe(0);
    expect(rows("SELECT * FROM kit_outbox WHERE action = 'factfind-ready'").length, 'no dead link left behind').toBe(0);
  });

  it('the sweep runs on the cron the app already has', async () => {
    await send({}, await authed());
    sqlite.prepare("UPDATE bridging_factfinds SET created_at = '2020-01-01T00:00:00Z'").run();
    await worker.scheduled({ cron: '*/15 * * * *' }, env());
    expect(rows('SELECT * FROM bridging_factfinds').length).toBe(0);
  });
});

describe('deleting the account', () => {
  it('erases the fact-find, and kills the link with it', async () => {
    await send({}, await authed());
    const token = decodeURIComponent(/t=([^"&\\]+)/.exec(kitCalls.map((c) => c.body).join(' '))?.[1] ?? '');
    const res = await worker.fetch(new Request('https://s.test/api/account/delete', {
      method: 'POST', headers: await authed(),
    }), env());
    expect(res.status).toBe(200);
    expect(rows('SELECT * FROM bridging_factfinds').length).toBe(0);
    const opened = await worker.fetch(new Request('https://s.test/broker/factfind', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `t=${encodeURIComponent(token)}`,
    }), env());
    expect(opened.status).toBe(404);
  });
});

describe('the shape of it', () => {
  it('every question the config asks has a column of its own', () => {
    expect(columnsCoverEveryField()).toBe(true);
  });
});
