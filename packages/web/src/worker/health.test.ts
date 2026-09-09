/**
 * THE LAST SILENT FAILURE (C3 follow-up).
 *
 * The Kit outbox retry runs every 15 minutes, server-side, invisibly. If it
 * throws or Cloudflare stops firing it, a bridging enquiry or a fact-find sits
 * queued for ever and the site looks perfectly well — and the app may never
 * send email to say so (CLAUDE.md rule 6). So it publishes what it knows and
 * something else does the telling.
 *
 * These tests exist to stop that endpoint becoming another quiet lie: it must
 * detect each fault, it must tell a stranger NOTHING, and it must never carry
 * anybody's email out with the diagnosis.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from './index';
import { minutesSince, runHealthChecks, tokenMatches } from './lib/health';
import { HEALTH } from '../config/health';

const MIG = (n: string) => readFileSync(fileURLToPath(new URL(`../../migrations/${n}`, import.meta.url)), 'utf8');

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
  return { prepare } as unknown as Env['DB'];
}

const NOW = Date.parse('2026-09-09T12:00:00.000Z');
const agoIso = (ms: number): string => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const DAY = 86_400_000;

let sqlite: DatabaseSync;
const db = (): Env['DB'] => makeD1(sqlite);

/** A manifest the checks can read, healthy unless a test says otherwise. */
const manifest = (over: Record<string, unknown> = {}) => async (): Promise<Response> =>
  new Response(JSON.stringify({ schemaVersion: 1, ppdMonth: '2026-07', generatedAt: agoIso(2 * DAY), ...over }), { status: 200 });

const run = (fetchImpl: typeof fetch, database = db()) =>
  runHealthChecks(database, { now: NOW, manifestUrl: 'https://data.test/manifest.json', fetchImpl });

const check = (r: { checks: { id: string; ok: boolean; detail: string }[] }, id: string) => {
  const c = r.checks.find((x) => x.id === id);
  expect(c, `no check called ${id}`).toBeDefined();
  return c!;
};

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(MIG('0001_init.sql'));
  sqlite.exec(MIG('0002_outbox_action.sql'));
  sqlite.exec(MIG('0023_cron_heartbeat.sql'));
  // both crons healthy by default; each test breaks one thing
  sqlite.exec(`DELETE FROM cron_heartbeat`);
  for (const n of ['outbox', 'daily']) {
    sqlite.prepare('INSERT INTO cron_heartbeat (name, last_at) VALUES (?, ?)').run(n, agoIso(5 * MIN));
  }
});

const queue = (status: string, createdAt: string, email = 'someone@example.com') => {
  sqlite.prepare(
    "INSERT INTO kit_outbox (id, email, first_name, status, attempts, created_at, action) VALUES (?, ?, 'Sam', ?, 0, ?, 'bridging')",
  ).run(`row-${Math.trunc(Date.parse(createdAt))}-${status}`, email, status, createdAt);
};

describe('a healthy app says so', () => {
  it('every check passes and the verdict is ok', async () => {
    const r = await run(manifest() as unknown as typeof fetch);
    expect(r.status).toBe('ok');
    expect(r.checks.every((c) => c.ok), JSON.stringify(r.checks.filter((c) => !c.ok))).toBe(true);
    expect(r.checks.map((c) => c.id)).toEqual([
      'database', 'outboxPending', 'outboxFailed', 'outboxCron', 'dailyCron', 'dataReachable', 'dataSchema', 'dataFresh',
    ]);
  });

  it('a queue that is simply busy is not a fault', async () => {
    queue('pending', agoIso(10 * MIN));
    expect((await run(manifest() as unknown as typeof fetch)).status).toBe('ok');
  });
});

describe('the fault that started this: an enquiry stuck in the queue', () => {
  it('a row still waiting past the limit fails the check', async () => {
    queue('pending', agoIso((HEALTH.outboxPendingMaxMinutes + 1) * MIN));
    const r = await run(manifest() as unknown as typeof fetch);
    expect(r.status).toBe('fail');
    expect(check(r, 'outboxPending').ok).toBe(false);
    expect(check(r, 'outboxPending').detail).toMatch(/oldest queued row is \d+ minutes old/);
  });

  it('a row that GAVE UP fails even if it is the only one', async () => {
    queue('failed', agoIso(1 * DAY));
    const r = await run(manifest() as unknown as typeof fetch);
    expect(r.status).toBe('fail');
    expect(check(r, 'outboxFailed').ok).toBe(false);
    expect(check(r, 'outboxFailed').detail).toContain("never reached Kit");
  });

  it('but an old failure that has been dealt with stops shouting', async () => {
    queue('failed', agoIso((HEALTH.outboxFailedWithinDays + 1) * DAY));
    expect((await run(manifest() as unknown as typeof fetch)).status).toBe('ok');
  });

  it('a SENT row is not a fault, however old', async () => {
    queue('sent', agoIso(400 * DAY));
    expect((await run(manifest() as unknown as typeof fetch)).status).toBe('ok');
  });
});

describe('a cron that has stopped', () => {
  it('catches the 15-minute outbox cron going quiet', async () => {
    sqlite.prepare("UPDATE cron_heartbeat SET last_at = ? WHERE name = 'outbox'").run(agoIso((HEALTH.outboxCronMaxMinutes + 5) * MIN));
    const r = await run(manifest() as unknown as typeof fetch);
    expect(r.status).toBe('fail');
    expect(check(r, 'outboxCron').ok).toBe(false);
    expect(check(r, 'dailyCron').ok, 'and does not blame the other one').toBe(true);
  });

  it('catches the daily cron going quiet', async () => {
    sqlite.prepare("UPDATE cron_heartbeat SET last_at = ? WHERE name = 'daily'").run(agoIso((HEALTH.dailyCronMaxHours + 2) * 60 * MIN));
    const r = await run(manifest() as unknown as typeof fetch);
    expect(check(r, 'dailyCron').ok).toBe(false);
    expect(check(r, 'outboxCron').ok).toBe(true);
  });

  it('a cron that never stamped at all is a fault, not a pass', async () => {
    sqlite.exec('DELETE FROM cron_heartbeat');
    const r = await run(manifest() as unknown as typeof fetch);
    expect(check(r, 'outboxCron').detail).toBe('has never stamped');
    expect(check(r, 'outboxCron').ok).toBe(false);
  });

  it('the daily cron gets slack for a late trigger — 24h is not yet a fault', async () => {
    sqlite.prepare("UPDATE cron_heartbeat SET last_at = ? WHERE name = 'daily'").run(agoIso(24 * 60 * MIN));
    expect(check(await run(manifest() as unknown as typeof fetch), 'dailyCron').ok).toBe(true);
  });
});

describe('the data behind the whole product', () => {
  it('catches the monthly refresh having stopped', async () => {
    const r = await run(manifest({ generatedAt: agoIso((HEALTH.dataStaleAfterDays + 1) * DAY) }) as unknown as typeof fetch);
    expect(check(r, 'dataFresh').ok).toBe(false);
    expect(r.status).toBe('fail');
  });

  it('catches a schema the app cannot read — the pipeline shipping v2', async () => {
    const r = await run(manifest({ schemaVersion: 2 }) as unknown as typeof fetch);
    expect(check(r, 'dataSchema').ok).toBe(false);
    expect(check(r, 'dataSchema').detail).toContain('cannot use it');
  });

  it('catches the data being unreachable, and does not pretend to know the rest', async () => {
    const dead = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch;
    const r = await run(dead);
    expect(check(r, 'dataReachable').ok).toBe(false);
    expect(check(r, 'dataSchema').detail).toContain('not checked');
    expect(check(r, 'dataFresh').detail).toContain('not checked');
  });

  it('a thrown fetch is a failure, never an exception out of the endpoint', async () => {
    const boom = (async () => { throw new TypeError('network'); }) as unknown as typeof fetch;
    await expect(run(boom)).resolves.toBeDefined();
    expect(check(await run(boom), 'dataReachable').ok).toBe(false);
  });
});

describe('when the database itself is gone', () => {
  const brokenDb = { prepare: () => { throw new Error('D1_ERROR'); } } as unknown as Env['DB'];

  it('says so once, and still answers', async () => {
    const r = await run(manifest() as unknown as typeof fetch, brokenDb);
    expect(r.status).toBe('fail');
    expect(check(r, 'database').ok).toBe(false);
    expect(r.checks.filter((c) => c.id.startsWith('outbox')).map((c) => c.id))
      .toEqual(['outboxCron']); // no duplicate alarms for questions it cannot ask
    expect(check(r, 'dataReachable').ok, 'and the data checks still ran').toBe(true);
  });
});

describe('what a stranger is allowed to see', () => {
  // The endpoint reaches for the manifest over the network. Stub it, so these
  // tests are about the ANSWER and never about whether r2.dev is up today.
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    // These go through worker.fetch, which reads the REAL clock — so the
    // fixtures have to be relative to it too, or a healthy app looks broken
    // purely because the test picked a fixed hour.
    const realAgo = (ms: number) => new Date(Date.now() - ms).toISOString();
    globalThis.fetch = (async () => new Response(JSON.stringify({
      schemaVersion: 1, ppdMonth: '2026-07', generatedAt: realAgo(2 * DAY),
    }), { status: 200 })) as unknown as typeof fetch;
    sqlite.exec('DELETE FROM cron_heartbeat');
    for (const n of ['outbox', 'daily']) {
      sqlite.prepare('INSERT INTO cron_heartbeat (name, last_at) VALUES (?, ?)').run(n, realAgo(5 * MIN));
    }
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const env = (token?: string): Env => ({
    ASSETS: { fetch: async () => new Response('a') }, DB: db(), JWT_SECRET: 'x',
    GOOGLE_CLIENT_SECRET: 'x', TURNSTILE_SECRET: 'x', KIT_API_KEY: 'k', HEALTH_TOKEN: token,
  }) as Env;
  const get = (headers: Record<string, string> = {}, token?: string) =>
    worker.fetch(new Request('https://s.test/api/health', { headers }), env(token));

  it('ONE WORD, and nothing else, without the token', async () => {
    queue('failed', agoIso(1 * DAY), 'private.person@example.com');
    const res = await get({}, 'secret-token');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['status']);
    expect(body.status).toBe('fail');
  });

  it('no queue depth, no ages, no addresses leak in the anonymous answer', async () => {
    queue('pending', agoIso(999 * MIN), 'private.person@example.com');
    const text = await (await get({}, 'secret-token')).text();
    expect(text).not.toContain('private.person');
    expect(text).not.toMatch(/\d/); // not a single number: no count, no age
    expect(text.length).toBeLessThan(40);
  });

  it('a WRONG token gets the stranger answer, not an error that confirms the shape', async () => {
    const body = await (await get({ authorization: 'Bearer wrong' }, 'secret-token')).json() as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['status']);
  });

  it('an environment with NO token configured never opens up', async () => {
    const body = await (await get({ authorization: 'Bearer anything' }, undefined)).json() as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['status']);
  });

  it('the RIGHT token gets the detail the workflow needs', async () => {
    const body = await (await get({ authorization: 'Bearer secret-token' }, 'secret-token')).json() as { status: string; checks: unknown[] };
    expect(body.status).toBe('ok');
    expect(Array.isArray(body.checks)).toBe(true);
    expect(body.checks.length).toBeGreaterThan(5);
  });

  it('even the DETAIL carries no personal data — counts and ages only', async () => {
    queue('pending', agoIso(999 * MIN), 'private.person@example.com');
    queue('failed', agoIso(1 * DAY), 'someone.else@example.com');
    const body = await (await get({ authorization: 'Bearer secret-token' }, 'secret-token')).json() as { checks: { detail: string }[] };
    const all = body.checks.map((c) => c.detail).join(' | ');
    expect(all).not.toContain('@');
    expect(all).not.toMatch(/private|someone\.else|Sam/);
  });

  it('is never cached and never indexed', async () => {
    const res = await get({}, 't');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
  });

  it('answers 200 even when the news is bad — a poller must be able to read the verdict', async () => {
    queue('failed', agoIso(1 * DAY));
    expect((await get({}, 't')).status).toBe(200);
  });
});

describe('the token comparison', () => {
  it('accepts only an exact match', () => {
    expect(tokenMatches('abc', 'abc')).toBe(true);
    expect(tokenMatches('abc', 'abd')).toBe(false);
    expect(tokenMatches('abc', 'abcd')).toBe(false);
    expect(tokenMatches('abcd', 'abc')).toBe(false);
  });

  it('refuses when there is nothing to compare against', () => {
    expect(tokenMatches('abc', undefined)).toBe(false);
    expect(tokenMatches('abc', '')).toBe(false);
    expect(tokenMatches(null, 'abc')).toBe(false);
    expect(tokenMatches('', '')).toBe(false);
  });
});

describe('reading an age', () => {
  it('counts whole minutes, and refuses to guess', () => {
    expect(minutesSince(agoIso(90 * MIN), NOW)).toBe(90);
    expect(minutesSince(agoIso(-5 * MIN), NOW), 'a future stamp is zero, not negative').toBe(0);
    expect(minutesSince(null, NOW)).toBe(null);
    expect(minutesSince('not a date', NOW)).toBe(null);
  });
});
