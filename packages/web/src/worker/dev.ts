/**
 * DEV-ONLY routes — local sign-in and a realistic seed set for judging board design
 * without staring at an empty board. INERT IN PRODUCTION BY CONSTRUCTION: every route
 * requires BOTH
 *   1. env.DEV_LOGIN === 'on' — set ONLY in .dev.vars (gitignored, never uploaded by
 *      `wrangler deploy`); undefined in the deployed Worker.
 *   2. a localhost / 127.0.0.1 request host — the deployed Worker is only ever reached
 *      on its workers.dev / custom domain.
 * If either fails the route answers a bare 404, exactly as if it did not exist, so it
 * can never sign anyone in or seed data on the deployed site.
 */
import type { Env } from './index';
import { SESSION_DAYS, signSession } from './lib/jwt';
import { sessionCookie } from './lib/cookies';
import { clearDemoDeals, seedDemoDeals } from './lib/pipeline';

const DEMO = { sub: 'demo-user', email: 'demo@local.test', name: 'Demo', avatar: '' } as const;

/** Both gates must pass. Returns false in production (no DEV_LOGIN, non-localhost). */
export function isDevEnv(env: Env, request: Request): boolean {
  const host = new URL(request.url).hostname;
  return env.DEV_LOGIN === 'on' && (host === 'localhost' || host === '127.0.0.1');
}

const notFound = (): Response => new Response('Not Found', { status: 404 });
const seeSee = (to: string, cookie?: string): Response =>
  new Response(null, { status: 302, headers: cookie ? { Location: to, 'Set-Cookie': cookie } : { Location: to } });

async function ensureDemoUser(env: Env): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (id, email, name, avatar_url, created_at, marketing_consent) VALUES (?, ?, ?, '', ?, 0)",
  ).bind(DEMO.sub, DEMO.email, DEMO.name, new Date().toISOString()).run();
}

/** GET /auth/dev-login — sign in as the demo account and land on the board. */
export async function handleDevLogin(request: Request, env: Env): Promise<Response> {
  if (!isDevEnv(env, request)) return notFound();
  await ensureDemoUser(env);
  const jwt = await signSession(DEMO, env.JWT_SECRET);
  return seeSee('/deals', sessionCookie(jwt, SESSION_DAYS * 86400));
}

/** GET /dev/seed — load the realistic test set onto the demo account. */
export async function handleDevSeed(request: Request, env: Env): Promise<Response> {
  if (!isDevEnv(env, request)) return notFound();
  await ensureDemoUser(env);
  await seedDemoDeals(env.DB, DEMO.sub);
  return seeSee('/deals');
}

/** GET /dev/seed/clear — remove the seeded test set from the demo account. */
export async function handleDevSeedClear(request: Request, env: Env): Promise<Response> {
  if (!isDevEnv(env, request)) return notFound();
  await clearDemoDeals(env.DB, DEMO.sub);
  return seeSee('/deals');
}
