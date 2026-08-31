/**
 * The ONE Worker (S6.1): Google sign-in (Authorization Code + PKCE), 30-day
 * HttpOnly JWT sessions, users in D1, account/consent/delete APIs. Every
 * page stays a static asset — only /auth/* and /api/* run here
 * (wrangler.jsonc run_worker_first).
 *
 * Secrets (GOOGLE_CLIENT_SECRET, JWT_SECRET, TURNSTILE_SECRET, KIT_API_KEY)
 * live only in env and are never logged or echoed.
 */
import { siteConfig } from '../site.config';
import {
  AUTH_STATE_COOKIE,
  authStateCookie,
  clearAuthStateCookie,
  clearSessionCookie,
  getCookie,
  SESSION_COOKIE,
  sessionCookie,
} from './lib/cookies';
import { decodeAuthState, encodeAuthState, pkceChallenge, randomToken, safeNextPath } from './lib/oauth';
import { SESSION_DAYS, signSession, verifySession, type SessionClaims } from './lib/jwt';
import { verifyGoogleIdToken } from './lib/googleIdToken';

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  DB: D1Database;
  JWT_SECRET: string;
  GOOGLE_CLIENT_SECRET: string;
  TURNSTILE_SECRET: string;
  KIT_API_KEY: string;
}

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const redirect = (location: string, cookies: string[] = []): Response => {
  const h = new Headers({ Location: location });
  for (const c of cookies) h.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers: h });
};

/** Plain-English error page that never leaks internals. */
const errorPage = (message: string, cookies: string[] = []): Response => {
  const h = new Headers({ 'content-type': 'text/html; charset=utf-8' });
  for (const c of cookies) h.append('Set-Cookie', c);
  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#070014;color:#fff;display:grid;place-items:center;min-height:100dvh;margin:0;padding:1rem"><div style="max-width:26rem;text-align:center"><h1 style="font-size:1.3rem">Sign-in didn't complete</h1><p style="color:rgba(255,255,255,0.7)">${message}</p><p><a style="color:#dcff00" href="/">Back to ${siteConfig.siteName}</a></p></div></body>`,
    { status: 400, headers: h },
  );
};

async function currentUser(request: Request, env: Env): Promise<SessionClaims | null> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return verifySession(token, env.JWT_SECRET);
}

function redirectUri(url: URL): string {
  return `${url.origin}/auth/callback`;
}

async function handleLogin(request: Request, url: URL): Promise<Response> {
  const state = randomToken();
  const verifier = randomToken(48);
  const challenge = await pkceChallenge(verifier);
  const payload = encodeAuthState({
    state,
    verifier,
    next: safeNextPath(url.searchParams.get('next')),
    marketing: url.searchParams.get('marketing') === '1' ? '1' : '0',
    turnstile: url.searchParams.get('ts') ?? '',
  });
  const auth = new URL(GOOGLE_AUTH);
  auth.searchParams.set('client_id', siteConfig.googleClientId);
  auth.searchParams.set('redirect_uri', redirectUri(url));
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', 'openid email profile');
  auth.searchParams.set('state', state);
  auth.searchParams.set('code_challenge', challenge);
  auth.searchParams.set('code_challenge_method', 'S256');
  return redirect(auth.toString(), [authStateCookie(payload)]);
}

async function verifyTurnstile(token: string, secret: string, ip: string | null): Promise<boolean> {
  if (token === '') return false;
  const form = new FormData();
  form.set('secret', secret);
  form.set('response', token);
  if (ip) form.set('remoteip', ip);
  try {
    const res = await fetch(TURNSTILE_VERIFY, { method: 'POST', body: form });
    if (!res.ok) {
      console.error(`turnstile siteverify HTTP ${res.status}`);
      return false;
    }
    const body = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
    if (body.success !== true) {
      // codes only — never the token or secret (visible via wrangler tail)
      console.error(`turnstile siteverify failed: ${(body['error-codes'] ?? []).join(',') || 'no-code'}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('turnstile siteverify unreachable');
    return false;
  }
}

async function handleCallback(request: Request, env: Env, url: URL): Promise<Response> {
  const stored = decodeAuthState(getCookie(request, AUTH_STATE_COOKIE) ?? '');
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!stored || !state || !code || state !== stored.state) {
    return errorPage('The sign-in link expired or did not match. Please try again.', [clearAuthStateCookie()]);
  }

  // Server-side code exchange (client secret + PKCE verifier).
  const body = new URLSearchParams({
    client_id: siteConfig.googleClientId,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    code,
    code_verifier: stored.verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(url),
  });
  let idToken: string;
  try {
    const res = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) return errorPage('Google did not accept the sign-in. Please try again.', [clearAuthStateCookie()]);
    idToken = ((await res.json()) as { id_token: string }).id_token;
  } catch {
    return errorPage('Could not reach Google. Please try again in a moment.', [clearAuthStateCookie()]);
  }

  let google;
  try {
    google = await verifyGoogleIdToken(idToken, siteConfig.googleClientId);
  } catch {
    return errorPage('Could not reach Google to verify the sign-in. Please try again in a moment.', [clearAuthStateCookie()]);
  }
  // Strict: an ABSENT email_verified claim gives no assurance either.
  if (!google || google.email_verified !== true) {
    return errorPage('The Google account could not be verified.', [clearAuthStateCookie()]);
  }

  const email = google.email.toLowerCase();
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();

  let userId: string;
  if (existing) {
    userId = existing.id;
    await env.DB.prepare('UPDATE users SET name = ?, avatar_url = ? WHERE id = ?')
      .bind(google.name ?? '', google.picture ?? '', userId)
      .run();
    // A returning user who TICKED the wall's marketing box gets that consent
    // recorded (0→1 with a fresh ts/version). An unticked box never revokes —
    // the account page is the only place consent switches off.
    if (stored.marketing === '1') {
      await env.DB.prepare(
        'UPDATE users SET marketing_consent = 1, consent_ts = ?, consent_version = ? WHERE id = ? AND marketing_consent = 0',
      )
        .bind(new Date().toISOString(), siteConfig.consentVersion, userId)
        .run();
    }
  } else {
    // New account: this is the one moment Turnstile is verified (bot gate on
    // account CREATION only — returning users are never challenged).
    const human = await verifyTurnstile(stored.turnstile, env.TURNSTILE_SECRET, request.headers.get('CF-Connecting-IP'));
    if (!human) {
      return errorPage('The quick human check did not pass. Please go back and try signing in again.', [clearAuthStateCookie()]);
    }
    userId = crypto.randomUUID();
    const now = new Date().toISOString();
    const marketing = stored.marketing === '1';
    // ON CONFLICT: two first sign-ins racing on the same email must not 500 —
    // the loser re-reads the winner's row.
    await env.DB.prepare(
      'INSERT INTO users (id, email, name, avatar_url, created_at, marketing_consent, consent_ts, consent_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING',
    )
      .bind(userId, email, google.name ?? '', google.picture ?? '', now, marketing ? 1 : 0, now, siteConfig.consentVersion)
      .run();
    const row = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
    if (!row) return errorPage('Something went wrong creating the account. Please try again.', [clearAuthStateCookie()]);
    userId = row.id;
  }

  const jwt = await signSession({ sub: userId, email, name: google.name ?? '', avatar: google.picture ?? '' }, env.JWT_SECRET);
  return redirect(stored.next, [sessionCookie(jwt, SESSION_DAYS * 86400), clearAuthStateCookie()]);
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  const row = await env.DB.prepare('SELECT marketing_consent FROM users WHERE id = ?')
    .bind(user.sub)
    .first<{ marketing_consent: number }>();
  if (!row) {
    // Session outlived the account (deleted) — treat as signed out.
    return json({ error: 'not signed in' }, 401, { 'Set-Cookie': clearSessionCookie() });
  }
  return json({ email: user.email, name: user.name, avatar: user.avatar, marketingConsent: row.marketing_consent === 1 });
}

async function handleConsent(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  let marketing: boolean;
  try {
    marketing = ((await request.json()) as { marketing: boolean }).marketing === true;
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  await env.DB.prepare('UPDATE users SET marketing_consent = ?, consent_ts = ?, consent_version = ? WHERE id = ?')
    .bind(marketing ? 1 : 0, new Date().toISOString(), siteConfig.consentVersion, user.sub)
    .run();
  return json({ ok: true, marketingConsent: marketing });
}

async function handleDeleteAccount(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  const now = new Date().toISOString();
  // Cascade delete; queue a Kit unsubscribe ONLY for users who had consented —
  // privacy.md promises Kit sees data only when the marketing box was ticked.
  const consent = await env.DB.prepare('SELECT marketing_consent FROM users WHERE id = ?')
    .bind(user.sub)
    .first<{ marketing_consent: number }>();
  const stmts = [
    env.DB.prepare('DELETE FROM saved_deals WHERE user_id = ?').bind(user.sub),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.sub),
  ];
  if (consent?.marketing_consent === 1) {
    stmts.unshift(
      env.DB.prepare(
        "INSERT INTO kit_outbox (id, user_id, email, first_name, action, status, created_at) VALUES (?, ?, ?, ?, 'unsubscribe', 'pending', ?)",
      ).bind(crypto.randomUUID(), user.sub, user.email, user.name.split(' ')[0] ?? '', now),
    );
  }
  await env.DB.batch(stmts);
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // State-changing POSTs must come from our own pages (Sec-Fetch-Site is
    // set by every modern browser; requests without it — curl, tests — pass).
    if (method === 'POST') {
      const site = request.headers.get('Sec-Fetch-Site');
      if (site !== null && site !== 'same-origin' && site !== 'none') {
        return json({ error: 'cross-site request refused' }, 403);
      }
    }

    if (pathname === '/auth/login' && method === 'GET') return handleLogin(request, url);
    if (pathname === '/auth/callback' && method === 'GET') return handleCallback(request, env, url);
    if (pathname === '/auth/logout' && method === 'POST') {
      return redirect(safeNextPath(url.searchParams.get('next')), [clearSessionCookie()]);
    }
    if (pathname === '/api/me' && method === 'GET') return handleMe(request, env);
    if (pathname === '/api/consent' && method === 'POST') return handleConsent(request, env);
    if (pathname === '/api/account/delete' && method === 'POST') return handleDeleteAccount(request, env);

    if (pathname.startsWith('/auth/') || pathname.startsWith('/api/')) {
      return json({ error: 'not found' }, 404);
    }
    return env.ASSETS.fetch(request);
  },
};
