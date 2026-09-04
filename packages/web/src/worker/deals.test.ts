import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';
import { SESSION_COOKIE } from './lib/cookies';
import { signSession } from './lib/jwt';
import { features } from '../config/features';

// This suite tests the FLAT saved-deals path, which is the flag-OFF behaviour.
// Pin the flag off so the suite is correct regardless of the committed default
// (production ships it ON).
beforeEach(() => { features.dealPipeline = false; });

/**
 * Stateful in-memory D1 stub interpreting exactly the SQL this Worker runs.
 * Small on purpose — it exists to prove routing/state logic, not SQL.
 */
function fakeDb() {
  const users = new Map<string, { marketing_consent: number }>();
  const deals: { id: string; user_id: string; strategy: string; title: string; url_params: string; key_figure: string; created_at: string }[] = [];
  const outbox: { id: string; user_id?: string | null; email: string; first_name: string; action: string; status: string; attempts: number; last_error: string | null }[] = [];

  const stmt = (sql: string) => {
    let args: unknown[] = [];
    const api = {
      bind(...a: unknown[]) {
        args = a;
        return api;
      },
      async first() {
        // copy, as real D1 does — the handler's 'before' snapshot must not
        // alias the row a later UPDATE mutates
        if (sql.includes('SELECT marketing_consent FROM users')) {
          const u = users.get(args[0] as string);
          return u ? { ...u } : null;
        }
        if (sql.includes('SELECT id FROM saved_deals WHERE user_id = ? AND strategy = ? AND url_params'))
          return deals.find((d) => d.user_id === args[0] && d.strategy === args[1] && d.url_params === args[2]) ?? null;
        if (sql.includes('SELECT COUNT(*) AS n FROM saved_deals'))
          return { n: deals.filter((d) => d.user_id === args[0]).length };
        if (sql.includes('SELECT id FROM saved_deals WHERE id = ? AND user_id'))
          return deals.find((d) => d.id === args[0] && d.user_id === args[1]) ?? null;
        return null;
      },
      async all() {
        if (sql.includes('FROM saved_deals WHERE user_id'))
          return { results: deals.filter((d) => d.user_id === args[0]) };
        if (sql.includes("FROM kit_outbox WHERE status = 'pending'"))
          return { results: outbox.filter((o) => o.status === 'pending') };
        return { results: [] };
      },
      async run() {
        if (sql.includes('INSERT INTO saved_deals')) {
          const existing = deals.find((d) => d.user_id === args[1] && d.strategy === args[2] && d.url_params === args[4]);
          if (existing) Object.assign(existing, { title: args[3], key_figure: args[5] }); // ON CONFLICT DO UPDATE
          else
            deals.push({
              id: args[0] as string,
              user_id: args[1] as string,
              strategy: args[2] as string,
              title: args[3] as string,
              url_params: args[4] as string,
              key_figure: args[5] as string,
              created_at: args[6] as string,
            });
          return { success: true };
        }
        if (sql.includes('UPDATE saved_deals SET title')) {
          const d = deals.find((x) => x.id === args[2]);
          if (d) Object.assign(d, { title: args[0], key_figure: args[1] });
          return { success: true };
        }
        if (sql.includes('DELETE FROM saved_deals WHERE id')) {
          const i = deals.findIndex((x) => x.id === args[0]);
          if (i >= 0) deals.splice(i, 1);
          return { success: true };
        }
        if (sql.includes('DELETE FROM saved_deals WHERE user_id')) {
          for (let i = deals.length - 1; i >= 0; i -= 1) if (deals[i].user_id === args[0]) deals.splice(i, 1);
          return { success: true };
        }
        if (sql.includes('DELETE FROM kit_outbox WHERE user_id')) {
          for (let i = outbox.length - 1; i >= 0; i -= 1) if ((outbox[i] as { user_id?: unknown }).user_id === args[0]) outbox.splice(i, 1);
          return { success: true };
        }
        if (sql.includes("UPDATE kit_outbox SET status = 'superseded'")) {
          for (const o of outbox) if (o.email === args[0] && o.status === 'pending') o.status = 'superseded';
          return { success: true };
        }
        if (sql.includes('INSERT INTO kit_outbox')) {
          // delete-path INSERT has literal NULL/'' so email/action indices shift
          const deletePath = sql.includes("VALUES (?, NULL, ?, '', 'unsubscribe'");
          outbox.push(
            deletePath
              ? { id: args[0] as string, user_id: null as never, email: args[1] as string, first_name: '', action: 'unsubscribe', status: 'pending', attempts: 0, last_error: null }
              : { id: args[0] as string, user_id: args[1] as never, email: args[2] as string, first_name: args[3] as string, action: args[4] as string, status: 'pending', attempts: 0, last_error: null },
          );
          return { success: true };
        }
        if (sql.includes("UPDATE kit_outbox SET status = 'sent'")) {
          const o = outbox.find((x) => x.id === (args[args.length - 1] as string));
          if (o) o.status = 'sent';
          return { success: true };
        }
        if (sql.includes('UPDATE kit_outbox SET attempts')) {
          const o = outbox.find((x) => x.id === (args[args.length - 1] as string));
          if (o) { o.attempts = args[0] as number; o.last_error = args[2] as string; o.status = args[3] as string; }
          return { success: true };
        }
        if (sql.includes('UPDATE users SET marketing_consent = 1') && sql.includes('AND marketing_consent = 0')) {
          const u = users.get(args[2] as string);
          const changes = u && u.marketing_consent === 0 ? 1 : 0;
          if (changes) u!.marketing_consent = 1;
          return { success: true, meta: { changes } };
        }
        if (sql.includes('UPDATE users SET marketing_consent = 0') && sql.includes('AND marketing_consent = 1')) {
          const u = users.get(args[2] as string);
          const changes = u && u.marketing_consent === 1 ? 1 : 0;
          if (changes) u!.marketing_consent = 0;
          return { success: true, meta: { changes } };
        }
        return { success: true };
      },
    };
    return api;
  };
  return {
    db: { prepare: stmt, batch: async (sts: { run: () => Promise<unknown> }[]) => Promise.all(sts.map((s) => s.run())) } as unknown as Env['DB'],
    users,
    deals,
    outbox,
  };
}

const envWith = (db: Env['DB']): Env =>
  ({
    ASSETS: { fetch: async () => new Response('asset') },
    DB: db,
    JWT_SECRET: 'test-secret',
    GOOGLE_CLIENT_SECRET: 'x',
    TURNSTILE_SECRET: 'x',
    KIT_API_KEY: 'kit-key',
  }) as Env;

const authed = async (user = 'u1') => ({
  Cookie: `${SESSION_COOKIE}=${await signSession({ sub: user, email: `${user}@t.test`, name: 'Test User', avatar: '' }, 'test-secret')}`,
});

const saveReq = (headers: Record<string, string>, body: Record<string, unknown>) =>
  new Request('https://site.test/api/deals', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ strategy: 'btl', title: 'T · CF37 1HR · £150,000', url_params: 'postcode=CF37+1HR&price=150000', key_figure: 'ROI 12%', ...body }),
  });

describe('saved deals API', () => {
  it('401 signed out (POST, GET, DELETE)', async () => {
    const { db } = fakeDb();
    expect((await worker.fetch(saveReq({}, {}), envWith(db))).status).toBe(401);
    expect((await worker.fetch(new Request('https://site.test/api/deals'), envWith(db))).status).toBe(401);
    expect(
      (await worker.fetch(new Request('https://site.test/api/deals/00000000-0000-4000-8000-000000000000', { method: 'DELETE' }), envWith(db))).status,
    ).toBe(401);
  });

  it('saves, then re-saving identical url_params updates instead of duplicating', async () => {
    const f = fakeDb();
    const h = await authed();
    const first = await worker.fetch(saveReq(h, {}), envWith(f.db));
    expect(first.status).toBe(200);
    expect(((await first.json()) as { updated: boolean }).updated).toBe(false);
    const second = await worker.fetch(saveReq(h, { key_figure: 'ROI 14%' }), envWith(f.db));
    expect(((await second.json()) as { updated: boolean }).updated).toBe(true);
    expect(f.deals).toHaveLength(1);
    expect(f.deals[0].key_figure).toBe('ROI 14%');
  });

  it('the 100-deal cap answers 409 with a friendly message', async () => {
    const f = fakeDb();
    for (let i = 0; i < 100; i += 1)
      f.deals.push({ id: `d${i}`, user_id: 'u1', strategy: 'btl', title: 't', url_params: `p=${i}`, key_figure: '', created_at: '2026-01-01' });
    const res = await worker.fetch(saveReq(await authed(), {}), envWith(f.db));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain('100-deal limit');
  });

  it('rejects unknown strategies and empty payloads', async () => {
    const f = fakeDb();
    const h = await authed();
    expect((await worker.fetch(saveReq(h, { strategy: 'ponzi' }), envWith(f.db))).status).toBe(400);
    expect((await worker.fetch(saveReq(h, { title: '' }), envWith(f.db))).status).toBe(400);
  });

  it('lists own deals; delete enforces ownership', async () => {
    const f = fakeDb();
    f.deals.push({ id: '11111111-1111-4111-8111-111111111111', user_id: 'u1', strategy: 'flip', title: 'mine', url_params: 'a=1', key_figure: '', created_at: '2026-01-01' });
    f.deals.push({ id: '22222222-2222-4222-8222-222222222222', user_id: 'u2', strategy: 'btl', title: 'theirs', url_params: 'b=2', key_figure: '', created_at: '2026-01-01' });
    const h = await authed('u1');
    const list = (await (await worker.fetch(new Request('https://site.test/api/deals', { headers: h }), envWith(f.db))).json()) as { deals: unknown[] };
    expect(list.deals).toHaveLength(1);
    const foreign = await worker.fetch(
      new Request('https://site.test/api/deals/22222222-2222-4222-8222-222222222222', { method: 'DELETE', headers: h }),
      envWith(f.db),
    );
    expect(foreign.status).toBe(404);
    expect(f.deals).toHaveLength(2);
    const own = await worker.fetch(
      new Request('https://site.test/api/deals/11111111-1111-4111-8111-111111111111', { method: 'DELETE', headers: h }),
      envWith(f.db),
    );
    expect(own.status).toBe(200);
    expect(f.deals.map((d) => d.id)).toEqual(['22222222-2222-4222-8222-222222222222']);
  });
});

describe('cross-strategy + supersede behaviours', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('the same url_params under a different strategy is a SEPARATE deal', async () => {
    const f = fakeDb();
    const h = await authed();
    await worker.fetch(saveReq(h, { strategy: 'btl' }), envWith(f.db));
    await worker.fetch(saveReq(h, { strategy: 'flip', key_figure: '£20,000 profit after tax' }), envWith(f.db));
    expect(f.deals).toHaveLength(2);
    expect(f.deals.map((d) => d.strategy).sort()).toEqual(['btl', 'flip']);
  });

  it('a newer unsubscribe supersedes a stalled pending subscribe (no replay)', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('kit down');
    });
    const f = fakeDb();
    f.users.set('u1', { marketing_consent: 0 });
    const on = new Request('https://site.test/api/consent', {
      method: 'POST',
      headers: { ...(await authed()), 'content-type': 'application/json' },
      body: '{"marketing":true}',
    });
    await worker.fetch(on, envWith(f.db));
    expect(f.outbox[0]).toMatchObject({ action: 'subscribe', status: 'pending' });
    const off = new Request('https://site.test/api/consent', {
      method: 'POST',
      headers: { ...(await authed()), 'content-type': 'application/json' },
      body: '{"marketing":false}',
    });
    await worker.fetch(off, envWith(f.db));
    expect(f.outbox.map((o) => [o.action, o.status])).toEqual([
      ['subscribe', 'superseded'],
      ['unsubscribe', 'pending'],
    ]);
  });

  it('account deletion purges outbox history and queues one redactable unsubscribe atomically', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('kit down');
    });
    const f = fakeDb();
    f.users.set('u1', { marketing_consent: 1 });
    f.outbox.push({ id: 'old', user_id: 'u1' as never, email: 'u1@t.test', first_name: 'Test', action: 'subscribe', status: 'sent', attempts: 1, last_error: null } as never);
    const res = await worker.fetch(
      new Request('https://site.test/api/account/delete', { method: 'POST', headers: await authed() }),
      envWith(f.db),
    );
    expect(res.status).toBe(200);
    expect(f.outbox).toHaveLength(1); // history purged
    expect(f.outbox[0]).toMatchObject({ action: 'unsubscribe', status: 'pending', first_name: '' });
  });

  it('null JSON body → 400, not a 500', async () => {
    const f = fakeDb();
    const res = await worker.fetch(
      new Request('https://site.test/api/deals', { method: 'POST', headers: { ...(await authed()), 'content-type': 'application/json' }, body: 'null' }),
      envWith(f.db),
    );
    expect(res.status).toBe(400);
  });
});

describe('consent → Kit outbox', () => {
  afterEach(() => vi.unstubAllGlobals());

  const consentReq = async (marketing: boolean) =>
    new Request('https://site.test/api/consent', {
      method: 'POST',
      headers: { ...(await authed()), 'content-type': 'application/json' },
      body: JSON.stringify({ marketing }),
    });

  it('toggling ON queues a subscribe row and the inline push marks it sent', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 201 }));
    const f = fakeDb();
    f.users.set('u1', { marketing_consent: 0 });
    const res = await worker.fetch(await consentReq(true), envWith(f.db));
    expect(res.status).toBe(200);
    expect(f.outbox).toHaveLength(1);
    expect(f.outbox[0]).toMatchObject({ action: 'subscribe', email: 'u1@t.test', first_name: 'Test', status: 'sent' });
  });

  it('toggling OFF (from on) queues an unsubscribe; Kit down leaves it pending for the cron', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('down');
    });
    const f = fakeDb();
    f.users.set('u1', { marketing_consent: 1 });
    await worker.fetch(await consentReq(false), envWith(f.db));
    expect(f.outbox).toHaveLength(1);
    expect(f.outbox[0]).toMatchObject({ action: 'unsubscribe', status: 'pending' });
  });

  it('re-ticking when already on queues NOTHING (no duplicate Kit pushes)', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 201 }));
    const f = fakeDb();
    f.users.set('u1', { marketing_consent: 1 });
    await worker.fetch(await consentReq(true), envWith(f.db));
    expect(f.outbox).toHaveLength(0);
  });
});

describe('a consent change never cancels a bridging notification (F1)', () => {
  it('supersedes only the consent actions', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    // The supersede is scoped by action, so a pending bridging row is untouched
    // — the broker still gets told, whatever the person does about marketing.
    const sql = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8');
    const supersedes = sql.match(/UPDATE kit_outbox SET status = 'superseded'[^"]*/g) ?? [];
    expect(supersedes.length).toBeGreaterThan(0);
    const inEnqueue = supersedes.find((q) => q.includes("action IN ('subscribe','unsubscribe')"));
    expect(inEnqueue, 'enqueueKit must scope its supersede by action').toBeTruthy();
  });
});
