/**
 * THE BROKER'S ENQUIRY LINK, END TO END (F3).
 *
 * WHAT THIS IS PROVING. The consent tick beside the enquiry form says "Share
 * these answers and my contact details with [him]". Before F3 that was not
 * true: Kit got an email address and a first name, and every answer sat in
 * bridging_enquiries with no page that showed it to him. These tests are the
 * claim, enforced.
 *
 * The rules, in order of how much damage breaking them would do:
 *   1. NOTHING THEY WROTE REACHES KIT. Kit gets his address and a link. Not the
 *      loan, the deposit band, the phone number, or a word of their story.
 *   2. He sees every question, under the label the enquirer answered.
 *   3. The link works ONCE, expires, and reveals nothing to a GET.
 *   4. Retention clears the LINK and never the enquiry; deleting the account
 *      kills it on the spot.
 *   5. No broker config, no link — and therefore no form.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from './index';
import { SESSION_COOKIE } from './lib/cookies';
import { signSession } from './lib/jwt';
import { features } from '../config/features';
import { BRIDGING, BROKER, ENQUIRY_LINK_RULES, brokerReady } from '../config/bridging';
import { hashToken } from './lib/brokerLink';
import { answersCoverEveryQuestion, purgeEnquiryLinks } from './lib/enquiryLink';

const MIG = (n: string) => readFileSync(fileURLToPath(new URL(`../../migrations/${n}`, import.meta.url)), 'utf8');
const MIGRATIONS = [
  '0001_init.sql', '0002_outbox_action.sql', '0003_deals_idempotent_outbox_backoff.sql',
  '0004_deals_key_includes_strategy.sql', '0005_deal_pipeline.sql', '0006_deal_headline_figure.sql',
  '0007_deal_is_auction.sql', '0008_deal_verdict_line.sql', '0009_bridging_enquiries.sql',
  '0010_tool_saves.sql', '0011_outbox_fields.sql', '0019_bridging_factfind.sql',
  '0013_deal_changes.sql', '0016_deal_deaths.sql',
  '0020_factfind_consent_record.sql', '0024_bridging_enquiry_link.sql', '0026_deal_floorplans.sql',
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

/** A qualified enquiry: over the minimum, real deposit, a real repayment plan. */
const STORY = 'I have found a three bed terrace in Swansea at auction and I will refurbish it over about four months. '
  + 'I will then remortgage onto a buy to let mortgage and repay the bridge from that advance, with my own savings as backup.';
const GOOD = {
  loan: '95000', deposit: '25-plus', property: 'found', entity: 'ltd', exit: 'refinance',
  story: STORY, timing: '4-weeks', credit: 'none', phone: '07700900123', consent: true, turnstile: 'ok',
};
/** Fails our filter: below the minimum loan. Nothing is passed on. */
const POOR = { ...GOOD, loan: '5000' };

const post = async (body: Record<string, unknown>, headers: Record<string, string>) =>
  worker.fetch(new Request('https://s.test/api/bridging', {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), env());
const send = async (over: Record<string, unknown> = {}) => post({ ...GOOD, ...over }, await authed());

const rows = <T>(sql: string): T[] => sqlite.prepare(sql).all() as T[];
const one = <T>(sql: string): T => sqlite.prepare(sql).get() as T;
const kitSaw = (): string => kitCalls.map((c) => `${c.url} ${c.body}`).join(' ');
/** The token as it actually travelled to Kit. */
const sentToken = (): string => decodeURIComponent(/enquiry\?t=([^"&\\]+)/.exec(kitCalls.map((c) => c.body).join(' '))?.[1] ?? '');

const get = (token: string) => worker.fetch(new Request(`https://s.test/broker/enquiry?t=${encodeURIComponent(token)}`), env());
const reveal = (token: string) => worker.fetch(new Request('https://s.test/broker/enquiry', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `t=${encodeURIComponent(token)}`,
}), env());

const REAL_BROKER = { name: 'Test Broker', email: 'broker@test.test', inbox: 'inbox@test.test', kitTagQualified: '1', kitTagNotYet: '2', kitTagFactFind: '3', kitTagEnquiry: '4' };
const savedBroker = { ...BROKER } as Record<string, string>;

beforeEach(() => {
  Object.assign(BROKER as unknown as Record<string, string>, REAL_BROKER);
  features.bridgingFinance = true;
  features.brokerEnquiryLink = true;
  kitCalls = [];
  sqlite = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) sqlite.exec(MIG(m));
  sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run('u1', 'u1@t.test', 'Test Person', '2026-01-01T00:00:00Z');
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('api.kit.com')) {
      kitCalls.push({ url, body: String(init?.body ?? '') });
      return new Response('{}', { status: 200 });
    }
    // Turnstile
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
});
afterEach(() => {
  Object.assign(BROKER as unknown as Record<string, string>, savedBroker);
  vi.unstubAllGlobals();
  features.bridgingFinance = true;
  features.brokerEnquiryLink = true;
});

describe('nothing they wrote reaches Kit', () => {
  it('Kit is told the BROKER’s address and a link — and nothing else', async () => {
    expect((await send()).status).toBe(200);
    const everythingKitSaw = kitSaw();
    // their own words, and every figure behind the enquiry
    expect(everythingKitSaw).not.toContain('Swansea');
    expect(everythingKitSaw).not.toContain('remortgage');
    expect(everythingKitSaw).not.toContain('95000');
    expect(everythingKitSaw).not.toContain('25-plus');
    expect(everythingKitSaw).not.toContain('refinance');
    expect(everythingKitSaw).not.toContain('07700900123');
    // what it DID get: the broker, and a link
    expect(everythingKitSaw).toContain('broker@test.test');
    expect(everythingKitSaw).toContain('/broker/enquiry?t=');
  });

  it('the enquirer is upserted for THEIR OWN tag, and the broker for his — never mixed', async () => {
    await send();
    const enquiryReady = kitCalls.filter((c) => c.body.includes('/broker/enquiry?t='));
    expect(enquiryReady).toHaveLength(1);
    // the link went out addressed to the broker, not to the person enquiring
    expect(enquiryReady[0].body).toContain('broker@test.test');
    expect(enquiryReady[0].body).not.toContain('u1@t.test');
    // and the person's own confirmation carries no link at all
    const theirs = kitCalls.filter((c) => c.body.includes('u1@t.test'));
    expect(theirs.length).toBeGreaterThan(0);
    for (const c of theirs) expect(c.body).not.toContain('/broker/enquiry?t=');
  });

  it('and the queued row itself holds no live link once Kit has taken it', async () => {
    await send();
    const row = one<{ email: string; first_name: string; fields_json: string | null }>(
      "SELECT email, first_name, fields_json FROM kit_outbox WHERE action = 'enquiry-ready'",
    );
    expect(row.email).toBe('broker@test.test');
    expect(row.first_name).toBe('Test Broker');
    expect(kitCalls.map((c) => c.body).join(' ')).toContain('/broker/enquiry?t=');
    expect(row.fields_json, 'no live link left behind').toBeNull();
  });

  it('the token itself never touches the database — only its hash', async () => {
    await send();
    const token = sentToken();
    expect(token.length).toBeGreaterThan(20);
    const stored = one<{ token_hash: string }>('SELECT token_hash FROM bridging_enquiries');
    expect(stored.token_hash).toBe(await hashToken(token));
    const everything = JSON.stringify(rows('SELECT * FROM kit_outbox')) + JSON.stringify(rows('SELECT * FROM bridging_enquiries'));
    expect(everything, 'nowhere in the database').not.toContain(token);
  });

  it('a NOT-YET enquiry mints nothing — there is nothing to read and no link to leak', async () => {
    expect((await post({ ...POOR }, await authed())).status).toBe(200);
    expect(one<{ outcome: string }>('SELECT outcome FROM bridging_enquiries').outcome).toBe('not-yet');
    expect(one<{ token_hash: string | null }>('SELECT token_hash FROM bridging_enquiries').token_hash).toBeNull();
    expect(rows("SELECT * FROM kit_outbox WHERE action = 'enquiry-ready'")).toHaveLength(0);
    expect(kitSaw()).not.toContain('/broker/enquiry?t=');
  });
});

describe('what he is shown', () => {
  it('every question the form asks reaches him — none is quietly dropped', () => {
    expect(answersCoverEveryQuestion()).toBe(true);
  });

  it('under the SAME labels the enquirer read, and the same option wording', async () => {
    await send();
    const html = await (await reveal(sentToken())).text();
    // the questions, exactly as the form asked them
    for (const f of [BRIDGING.form.loan, BRIDGING.form.deposit, BRIDGING.form.property,
      BRIDGING.form.entity, BRIDGING.form.exit, BRIDGING.form.story, BRIDGING.form.timing, BRIDGING.form.credit]) {
      expect(html, f.label).toContain(f.label.replace(/&/g, '&amp;'));
    }
    // and the answers as LABELS, never as the stored codes
    expect(html).toContain('25% or more');
    expect(html).toContain('Found a specific one');
    expect(html).toContain('Limited company or SPV');
    expect(html).toContain('Refinance onto a mortgage');
    expect(html).not.toContain('25-plus');
    expect(html).not.toContain('>found<');
  });

  it('their own words, their contact details, and the money formatted not recomputed', async () => {
    await send();
    const html = await (await reveal(sentToken())).text();
    expect(html).toContain('Swansea');           // the story, in full
    expect(html).toContain('07700900123');       // the number he rings
    expect(html).toContain('u1@t.test');
    expect(html).toContain('£95,000');           // formatted from the stored integer
  });
});

describe('the link works once, and only for a while', () => {
  it('a GET reveals NOTHING — a scanner following the link cannot spend it', async () => {
    await send();
    const token = sentToken();
    const html = await (await get(token)).text();
    expect(html).toContain('Show the enquiry');
    expect(html).not.toContain('Swansea');
    expect(html).not.toContain('07700900123');
    // and it is still unspent
    expect(one<{ link_viewed_at: string | null }>('SELECT link_viewed_at FROM bridging_enquiries').link_viewed_at).toBeNull();
  });

  it('a POST shows the details once, and never again', async () => {
    await send();
    const token = sentToken();
    const first = await reveal(token);
    expect(first.status).toBe(200);
    expect(await first.text()).toContain('Swansea');
    const second = await reveal(token);
    expect(second.status).toBe(404);
    expect(await second.text()).not.toContain('Swansea');
  });

  it('two taps arriving together spend the one use once', async () => {
    await send();
    const token = sentToken();
    const [a, b] = await Promise.all([reveal(token), reveal(token)]);
    const shown = [a, b].filter((r) => r.status === 200);
    expect(shown).toHaveLength(1);
  });

  it('an expired link is dead, and says the same thing as a spent one', async () => {
    await send();
    const token = sentToken();
    sqlite.prepare('UPDATE bridging_enquiries SET link_expires_at = ?').run('2000-01-01T00:00:00Z');
    const res = await reveal(token);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('This link has gone');
  });

  it('a made-up token is refused, and the enquiry is untouched', async () => {
    await send();
    expect((await reveal('not-a-real-token')).status).toBe(404);
    expect(one<{ link_viewed_at: string | null }>('SELECT link_viewed_at FROM bridging_enquiries').link_viewed_at).toBeNull();
  });

  it('his page is never indexed, never cached, and leaks no referrer', async () => {
    await send();
    const res = await reveal(sentToken());
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('the window really is the configured one', async () => {
    await send();
    const row = one<{ created_at: string; link_expires_at: string }>('SELECT created_at, link_expires_at FROM bridging_enquiries');
    const hours = (Date.parse(row.link_expires_at) - Date.parse(row.created_at)) / 3_600_000;
    expect(Math.round(hours)).toBe(ENQUIRY_LINK_RULES.linkHours);
  });
});

describe('retention clears the LINK and never the enquiry', () => {
  const age = (col: string, days: number): void => {
    sqlite.prepare(`UPDATE bridging_enquiries SET ${col} = ?`)
      .run(new Date(Date.now() - days * 86_400_000).toISOString());
  };

  it('a read link is cleared days later — and every answer stays', async () => {
    await send();
    sqlite.prepare('UPDATE bridging_enquiries SET link_viewed_at = ?').run(new Date().toISOString());
    age('link_viewed_at', ENQUIRY_LINK_RULES.keepAfterViewedDays + 1);
    await purgeEnquiryLinks(env().DB);
    const row = one<{ token_hash: string | null; link_expires_at: string | null; link_viewed_at: string | null; story: string; phone: string }>(
      'SELECT token_hash, link_expires_at, link_viewed_at, story, phone FROM bridging_enquiries',
    );
    expect(row.token_hash).toBeNull();
    expect(row.link_expires_at).toBeNull();
    expect(row.link_viewed_at).toBeNull();
    // THE POINT: the enquiry itself is the person's own record and survives
    expect(row.story).toContain('Swansea');
    expect(row.phone).toBe('07700900123');
  });

  it('an unread link still goes at the maximum age, enquiry intact', async () => {
    await send();
    age('created_at', ENQUIRY_LINK_RULES.keepMaxDays + 1);
    await purgeEnquiryLinks(env().DB);
    const row = one<{ token_hash: string | null; story: string }>('SELECT token_hash, story FROM bridging_enquiries');
    expect(row.token_hash).toBeNull();
    expect(row.story).toContain('Swansea');
  });

  it('a fresh link is left alone', async () => {
    await send();
    await purgeEnquiryLinks(env().DB);
    expect(one<{ token_hash: string | null }>('SELECT token_hash FROM bridging_enquiries').token_hash).not.toBeNull();
  });

  it('the notification that carried the link goes with it', async () => {
    await send();
    sqlite.prepare("UPDATE kit_outbox SET created_at = ? WHERE action = 'enquiry-ready'")
      .run(new Date(Date.now() - (ENQUIRY_LINK_RULES.keepMaxDays + 1) * 86_400_000).toISOString());
    age('created_at', ENQUIRY_LINK_RULES.keepMaxDays + 1);
    await purgeEnquiryLinks(env().DB);
    expect(rows("SELECT * FROM kit_outbox WHERE action = 'enquiry-ready'")).toHaveLength(0);
  });

  it('a cleared link no longer opens', async () => {
    await send();
    const token = sentToken();
    age('created_at', ENQUIRY_LINK_RULES.keepMaxDays + 1);
    await purgeEnquiryLinks(env().DB);
    expect((await reveal(token)).status).toBe(404);
  });
});

describe('deleting the account kills the link on the spot', () => {
  it('even though he has never opened it', async () => {
    await send();
    const token = sentToken();
    const res = await worker.fetch(new Request('https://s.test/api/account/delete', {
      method: 'POST', headers: await authed(),
    }), env());
    expect(res.status).toBe(200);
    expect(rows('SELECT * FROM bridging_enquiries')).toHaveLength(0);
    expect((await reveal(token)).status).toBe(404);
  });
});

describe('no way to read it, no form', () => {
  it('brokerReady() is false until the enquiry tag is real', () => {
    Object.assign(BROKER as unknown as Record<string, string>, { ...REAL_BROKER, kitTagEnquiry: '' });
    expect(brokerReady()).toBe(false);
    Object.assign(BROKER as unknown as Record<string, string>, REAL_BROKER);
    expect(brokerReady()).toBe(true);
  });

  it('the endpoint is shut while the tag is missing — nothing is stored', async () => {
    Object.assign(BROKER as unknown as Record<string, string>, { ...REAL_BROKER, kitTagEnquiry: '' });
    expect((await send()).status).toBe(404);
    expect(rows('SELECT * FROM bridging_enquiries')).toHaveLength(0);
  });

  it('flag off: the endpoint is shut and his page is 404', async () => {
    features.brokerEnquiryLink = false;
    expect((await send()).status).toBe(404);
    expect((await get('anything')).status).toBe(404);
  });

  it('flag off mid-life: a link already sent stops resolving', async () => {
    await send();
    const token = sentToken();
    features.brokerEnquiryLink = false;
    expect((await reveal(token)).status).toBe(404);
  });
});
