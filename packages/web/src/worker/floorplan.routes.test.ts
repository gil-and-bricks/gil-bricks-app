/**
 * F1 — SAVING THE PLAN. Geometry in, geometry out, and nothing image-shaped
 * accepted by the back door.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from './index';
import { SESSION_COOKIE } from './lib/cookies';
import { signSession } from './lib/jwt';
import { features } from '../config/features';

const MIG = (n: string) => readFileSync(fileURLToPath(new URL(`../../migrations/${n}`, import.meta.url)), 'utf8');
const MIGRATIONS = ['0001_init.sql', '0005_deal_pipeline.sql', '0026_deal_floorplans.sql'];

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
  return { prepare, async batch(s: { run: () => Promise<unknown> }[]) { return Promise.all(s.map((x) => x.run())); } } as unknown as Env['DB'];
}

let sqlite: DatabaseSync;
const env = (): Env => ({ ASSETS: { fetch: async () => new Response('a') }, DB: makeD1(sqlite), JWT_SECRET: 'test-secret', GOOGLE_CLIENT_SECRET: 'x', TURNSTILE_SECRET: 'x', KIT_API_KEY: 'k' }) as Env;
const as = async (u: string) => ({ Cookie: `${SESSION_COOKIE}=${await signSession({ sub: u, email: `${u}@t.test`, name: 'T', avatar: '' }, 'test-secret')}` });
const DEAL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const GEOMETRY = JSON.stringify({
  v: 1, mpp: 0.04, sizedBy: 'epc',
  levels: [{ name: 'Ground floor', rooms: [{ name: 'Lounge', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }] }] }],
});

const put = async (body: unknown, who = 'userA', deal = DEAL) => worker.fetch(new Request(`https://s.test/api/deals/${deal}/floorplan`, {
  method: 'PUT', headers: { ...(await as(who)), 'content-type': 'application/json' }, body: JSON.stringify(body),
}), env());
const get = async (who = 'userA', deal = DEAL) => worker.fetch(new Request(`https://s.test/api/deals/${deal}/floorplan`, { headers: await as(who) }), env());

beforeEach(() => {
  features.floorPlan = true;
  sqlite = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) sqlite.exec(MIG(m));
  for (const u of ['userA', 'userB']) {
    sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run(u, `${u}@t.test`, u, '2026-01-01T00:00:00Z');
  }
  sqlite.prepare(
    `INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, status, source, created_at, updated_at)
     VALUES (?, 'userA', 'btl', 'T', 'CF24 4', 'worth-a-look', 'live', 'analyser', ?, ?)`,
  ).run(DEAL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
});

describe('a plan saves and comes back', () => {
  it('round-trips', async () => {
    expect((await put({ plan: GEOMETRY })).status).toBe(200);
    const body = await (await get()).json() as { plan: string | null };
    expect(JSON.parse(body.plan as string).levels[0].rooms[0].name).toBe('Lounge');
  });

  it('re-saving replaces — one plan per property', async () => {
    await put({ plan: GEOMETRY });
    await put({ plan: JSON.stringify({ ...JSON.parse(GEOMETRY), levels: [{ name: 'First floor', rooms: [] }] }) });
    expect(sqlite.prepare('SELECT COUNT(*) n FROM deal_floorplans').get()).toEqual({ n: 1 });
  });

  it('a deal with no plan answers null, not an error', async () => {
    expect((await (await get()).json() as { plan: null }).plan).toBeNull();
  });
});

describe('nothing image-shaped can arrive by the back door', () => {
  for (const [what, payload] of [
    ['a data URI', JSON.stringify({ v: 1, levels: [], note: 'data:image/png;base64,iVBOR' })],
    ['a blob URL', JSON.stringify({ v: 1, levels: [], note: 'blob:https://x/9f2a' })],
    ['a portal URL', JSON.stringify({ v: 1, levels: [], src: 'https://media.rightmove.co.uk/p.jpeg' })],
    ['base64 anything', JSON.stringify({ v: 1, levels: [], b: 'base64,AAAA' })],
  ] as const) {
    it(`refuses ${what}`, async () => {
      expect((await put({ plan: payload })).status).toBe(400);
      expect(sqlite.prepare('SELECT COUNT(*) n FROM deal_floorplans').get()).toEqual({ n: 0 });
    });
  }

  it('refuses something too big to be geometry', async () => {
    const huge = JSON.stringify({ v: 1, levels: [], pad: 'x'.repeat(70_000) });
    expect((await put({ plan: huge })).status).toBe(400);
  });

  it('refuses anything that is not the versioned shape', async () => {
    for (const bad of ['not json', '{}', JSON.stringify({ v: 2, levels: [] }), JSON.stringify({ v: 1 })]) {
      expect((await put({ plan: bad })).status, bad).toBe(400);
    }
  });
});

describe('a plan belongs to its deal and nobody else', () => {
  it('another user cannot read it', async () => {
    await put({ plan: GEOMETRY });
    expect((await get('userB')).status).toBe(404);
  });

  it('another user cannot write it', async () => {
    expect((await put({ plan: GEOMETRY }, 'userB')).status).toBe(404);
    expect(sqlite.prepare('SELECT COUNT(*) n FROM deal_floorplans').get()).toEqual({ n: 0 });
  });

  it('signed out, neither', async () => {
    const anon = await worker.fetch(new Request(`https://s.test/api/deals/${DEAL}/floorplan`), env());
    expect(anon.status).toBe(401);
  });

  it('and with the flag off the route does not exist', async () => {
    features.floorPlan = false;
    try {
      expect((await get()).status).toBe(404);
      expect((await put({ plan: GEOMETRY })).status).toBe(404);
    } finally {
      features.floorPlan = true;
    }
  });
});
