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
import { canSaveAnotherDeal, MAX_DEALS_PER_USER } from './lib/deals';
import { isDealStrategy, MAX_ATTEMPTS, pushToKit, shouldAttempt, type OutboxRow } from './lib/outbox';
import { canAddLiveDeal, countLiveDeals, deleteDeal, getOwnedDeal, markDead, MAX_LIVE_DEALS, moveStage, parseAnalyserDeal, upsertPipelineDeal } from './lib/pipeline';
import { DEAD_STAGE, isStage, LIVE_CAP_MESSAGE, statusForStage } from '../config/pipeline';

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
      await recordConsentOn(env, userId, email, firstNameOf(google.name ?? ''));
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
    const won = row.id === userId;
    userId = row.id;
    if (marketing) {
      // winner: our INSERT already recorded consent — just queue Kit.
      // loser: the winner's row governs; escalate 0→1 only (never assume).
      if (won) await enqueueKit(env, userId, email, firstNameOf(google.name ?? ''), 'subscribe');
      else await recordConsentOn(env, userId, email, firstNameOf(google.name ?? ''));
    }
  }

  const jwt = await signSession({ sub: userId, email, name: google.name ?? '', avatar: google.picture ?? '' }, env.JWT_SECRET);
  return redirect(stored.next, [sessionCookie(jwt, SESSION_DAYS * 86400), clearAuthStateCookie()]);
}

/**
 * Queue a Kit action and try it INLINE once so the common case is instant;
 * the 15-minute cron is the safety net for failures. Only ever called for
 * consent events — non-consented users never reach the outbox.
 */
async function enqueueKit(env: Env, userId: string | null, email: string, firstName: string, action: 'subscribe' | 'unsubscribe'): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // LATEST INTENT WINS: any still-pending row for this email is superseded in
  // the same transaction, so a stalled older subscribe can never be replayed
  // by the cron after a newer unsubscribe (and vice versa).
  await env.DB.batch([
    env.DB.prepare("UPDATE kit_outbox SET status = 'superseded' WHERE email = ? AND status = 'pending'").bind(email),
    env.DB.prepare(
      "INSERT INTO kit_outbox (id, user_id, email, first_name, action, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
    ).bind(id, userId, email, firstName, action, now),
  ]);
  await attemptKitRow(env, { id, email, first_name: firstName, action, attempts: 0 });
}

/** One push attempt for a queued row; updates its status. Never throws. */
async function attemptKitRow(
  env: Env,
  row: { id: string; email: string; first_name: string; action: string; attempts: number },
  nowMs = Date.now(),
): Promise<void> {
  const attemptTs = new Date(nowMs).toISOString();
  const result = await pushToKit(row, env.KIT_API_KEY);
  if (result.ok) {
    // deletion-origin unsubscribes (no user row left) redact their email once
    // Kit has honoured it — "delete everything" then holds in our DB too
    await env.DB.prepare(
      "UPDATE kit_outbox SET status = 'sent', sent_at = ?, attempts = ?, last_attempt = ?, last_error = ?, email = CASE WHEN action = 'unsubscribe' AND user_id IS NULL THEN '' ELSE email END WHERE id = ?",
    )
      .bind(new Date().toISOString(), row.attempts + 1, attemptTs, result.note ?? null, row.id)
      .run();
  } else {
    const attempts = row.attempts + 1;
    const terminal = attempts >= MAX_ATTEMPTS && row.action !== 'unsubscribe';
    if (terminal) console.error(`kit outbox row permanently failed: action=${row.action} error=${result.error}`);
    await env.DB.prepare("UPDATE kit_outbox SET attempts = ?, last_attempt = ?, last_error = ?, status = ? WHERE id = ?")
      .bind(attempts, attemptTs, result.error, terminal ? 'failed' : 'pending', row.id)
      .run();
  }
}

/**
 * Consent switch-ON that is safe under races: the conditional UPDATE only
 * fires 0→1, and only the request that actually flipped it queues Kit.
 */
async function recordConsentOn(env: Env, userId: string, email: string, firstName: string): Promise<boolean> {
  const res = await env.DB.prepare(
    'UPDATE users SET marketing_consent = 1, consent_ts = ?, consent_version = ? WHERE id = ? AND marketing_consent = 0',
  )
    .bind(new Date().toISOString(), siteConfig.consentVersion, userId)
    .run();
  if (res.meta?.changes !== 1) return false;
  await enqueueKit(env, userId, email, firstName, 'subscribe');
  return true;
}

const firstNameOf = (name: string): string => name.split(' ')[0] ?? '';

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
  if (marketing) {
    await recordConsentOn(env, user.sub, user.email, firstNameOf(user.name));
  } else {
    // conditional 1→0: only the request that actually flipped it queues Kit
    const res = await env.DB.prepare(
      'UPDATE users SET marketing_consent = 0, consent_ts = ?, consent_version = ? WHERE id = ? AND marketing_consent = 1',
    )
      .bind(new Date().toISOString(), siteConfig.consentVersion, user.sub)
      .run();
    if (res.meta?.changes === 1) await enqueueKit(env, user.sub, user.email, firstNameOf(user.name), 'unsubscribe');
  }
  return json({ ok: true, marketingConsent: marketing });
}

async function handleDeleteAccount(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  const now = new Date().toISOString();
  // Everything in ONE transactional batch: purge the account's outbox history
  // ("delete everything" includes our own queue), supersede any pending rows
  // for the email, and — ONLY for consented users (privacy.md's promise) —
  // queue the unsubscribe BEFORE the user row disappears. A crash can never
  // lose the withdrawal: either the whole batch landed or none of it did.
  const consent = await env.DB.prepare('SELECT marketing_consent FROM users WHERE id = ?')
    .bind(user.sub)
    .first<{ marketing_consent: number }>();
  const unsubId = consent?.marketing_consent === 1 ? crypto.randomUUID() : null;
  const stmts = [
    env.DB.prepare('DELETE FROM kit_outbox WHERE user_id = ?').bind(user.sub),
    env.DB.prepare("UPDATE kit_outbox SET status = 'superseded' WHERE email = ? AND status = 'pending'").bind(user.email),
  ];
  if (unsubId) {
    // user_id NULL + empty first name: the row keeps ONLY what the
    // unsubscribe needs (the email), and that is redacted once sent.
    stmts.push(
      env.DB.prepare(
        "INSERT INTO kit_outbox (id, user_id, email, first_name, action, status, created_at) VALUES (?, NULL, ?, '', 'unsubscribe', 'pending', ?)",
      ).bind(unsubId, user.email, now),
    );
  }
  stmts.push(
    env.DB.prepare('DELETE FROM saved_deals WHERE user_id = ?').bind(user.sub),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.sub),
  );
  await env.DB.batch(stmts);
  if (unsubId) await attemptKitRow(env, { id: unsubId, email: user.email, first_name: '', action: 'unsubscribe', attempts: 0 });
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}

interface DealBody {
  strategy: string;
  title: string;
  url_params: string;
  key_figure: string;
  // Pipeline extras (P2) — used only when features.dealPipeline is on. The
  // verdict snapshot captures the score, the criteria it was judged against, and
  // the evidence state (which inputs were listing/EPC/estimated/typed).
  score?: number;
  criteria_json?: string;
  evidence_json?: string;
  headline_figure?: string;
  verdict_line?: string;
  is_auction?: boolean;
  postcode_sector?: string;
  source?: 'extension' | 'analyser';
}

async function handleSaveDeal(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  let body: DealBody;
  try {
    body = (await request.json()) as DealBody;
    if (typeof body !== 'object' || body === null) throw new Error('not an object');
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const strategy = String(body.strategy ?? '');
  const title = String(body.title ?? '').slice(0, 120).trim();
  const urlParams = String(body.url_params ?? '').slice(0, 2000);
  const keyFigure = String(body.key_figure ?? '').slice(0, 80).trim();
  if (!isDealStrategy(strategy) || title === '' || urlParams === '') return json({ error: 'bad request' }, 400);

  const now = new Date().toISOString();
  // The stable id for (user, strategy, url_params): the SAME property+strategy is
  // the SAME deal; the same property under a DIFFERENT strategy is a separate deal.
  const existing = await env.DB.prepare('SELECT id FROM saved_deals WHERE user_id = ? AND strategy = ? AND url_params = ?')
    .bind(user.sub, strategy, urlParams)
    .first<{ id: string }>();

  // ---- P2: save into the deal PIPELINE (only when the flag is on) ----
  if (siteConfig.features.dealPipeline) {
    // A deal can ONLY be born from an analyser payload — parse+brand it here.
    const payload = parseAnalyserDeal(body, isDealStrategy);
    if (!payload) return json({ error: 'bad request' }, 400);
    const postcodeSector = String(body.postcode_sector ?? '').slice(0, 12).trim();
    // A NEW deal must fit under the LIVE cap — checked BEFORE any write, so an
    // at-cap save leaves nothing behind (no stray saved_deals row).
    if (!existing && !canAddLiveDeal(await countLiveDeals(env.DB, user.sub))) {
      return json({ error: LIVE_CAP_MESSAGE }, 409);
    }
    // Claim the stable id atomically. saved_deals' UNIQUE(user_id, strategy, url_params)
    // collapses a re-save AND two racing saves to ONE row, and we read the canonical id
    // back from it — so the pipeline deal (which shares that id) can never be duplicated
    // by a divergent uuid. Mirroring first also keeps the legacy read path working.
    const id = existing?.id ?? crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO saved_deals (id, user_id, strategy, title, url_params, key_figure, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, strategy, url_params) DO UPDATE SET title = excluded.title, key_figure = excluded.key_figure',
    ).bind(id, user.sub, strategy, title, urlParams, keyFigure, now).run();
    const canonical = await env.DB.prepare('SELECT id FROM saved_deals WHERE user_id = ? AND strategy = ? AND url_params = ?')
      .bind(user.sub, strategy, urlParams)
      .first<{ id: string }>();
    const dealId = canonical?.id ?? id;
    // Idempotent per property+strategy: re-save updates the deal and adds a new
    // verdict snapshot, KEEPING its stage/history. The internal cap check is a
    // backstop for the tiny check-then-write race (self-heals on the next save).
    const r = await upsertPipelineDeal(env.DB, { id: dealId, userId: user.sub, postcodeSector }, payload);
    if (r === 'at-cap') return json({ error: LIVE_CAP_MESSAGE }, 409);
    return json({ ok: true, id: dealId, updated: r === 'updated', pipeline: true });
  }

  // ---- flag OFF: exactly today's behaviour (the flat saved-deals list) ----
  if (existing) {
    await env.DB.prepare('UPDATE saved_deals SET title = ?, key_figure = ? WHERE id = ?')
      .bind(title, keyFigure, existing.id)
      .run();
    return json({ ok: true, id: existing.id, updated: true });
  }
  const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM saved_deals WHERE user_id = ?')
    .bind(user.sub)
    .first<{ n: number }>();
  if (!canSaveAnotherDeal(countRow?.n ?? 0)) {
    return json(
      { error: `You've hit the ${MAX_DEALS_PER_USER}-deal limit — delete a few old ones on My deals to make room.` },
      409,
    );
  }
  await env.DB.prepare(
    'INSERT INTO saved_deals (id, user_id, strategy, title, url_params, key_figure, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, strategy, url_params) DO UPDATE SET title = excluded.title, key_figure = excluded.key_figure',
  )
    .bind(crypto.randomUUID(), user.sub, strategy, title, urlParams, keyFigure, now)
    .run();
  // the row that actually exists (ours, or a raced winner's) carries the id
  const saved = await env.DB.prepare('SELECT id FROM saved_deals WHERE user_id = ? AND strategy = ? AND url_params = ?')
    .bind(user.sub, strategy, urlParams)
    .first<{ id: string }>();
  return json({ ok: true, id: saved?.id ?? null, updated: false });
}

async function handleListDeals(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);

  // ---- P3: the pipeline board (only when the flag is on) ----
  if (siteConfig.features.dealPipeline) {
    // One row per deal, joined to saved_deals ONLY for its url_params (the analyser
    // link) — every deal has a matching saved_deals row (P2 dual-write; deleted
    // together). headline_figure is the board card's figure; key_figure is the
    // honest fallback for migrated/older deals that predate it.
    const rows = await env.DB.prepare(
      `SELECT d.id, d.strategy, d.title, d.stage, d.current_score, d.status,
              d.headline_figure, d.verdict_line, d.is_auction, d.updated_at, s.url_params, s.key_figure,
              COALESCE((SELECT MAX(h.at) FROM deal_stage_history h WHERE h.deal_id = d.id), d.created_at) AS stage_since
         FROM deals d JOIN saved_deals s ON s.id = d.id
        WHERE d.user_id = ?
        ORDER BY d.updated_at DESC`,
    )
      .bind(user.sub)
      .all<{
        id: string; strategy: string; title: string; stage: string; current_score: number | null;
        status: string; headline_figure: string | null; verdict_line: string | null; is_auction: number; updated_at: string;
        url_params: string; key_figure: string; stage_since: string;
      }>();
    // Coerce the SQLite 0/1 auction flag to a real boolean for the client.
    const deals = rows.results.map((r) => ({ ...r, is_auction: r.is_auction === 1 }));
    // liveCount comes from the SAME counter the 100-cap enforces (countLiveDeals over
    // the deals table), NOT a recount of the joined rows — so the board's "N of 100"
    // can never disagree with an at-cap 409 at save time.
    const liveCount = await countLiveDeals(env.DB, user.sub);
    return json({ pipeline: true, deals, liveCount, cap: MAX_LIVE_DEALS });
  }

  // ---- flag OFF: exactly today's flat saved-deals list ----
  const rows = await env.DB.prepare(
    'SELECT id, strategy, title, url_params, key_figure, created_at FROM saved_deals WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(user.sub)
    .all<{ id: string; strategy: string; title: string; url_params: string; key_figure: string; created_at: string }>();
  return json({ deals: rows.results, max: MAX_DEALS_PER_USER });
}

async function handleDeleteDeal(request: Request, env: Env, dealId: string): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  // Ownership enforced in the WHERE — deleting someone else's id is a no-op 404.
  const owned = await env.DB.prepare('SELECT id FROM saved_deals WHERE id = ? AND user_id = ?')
    .bind(dealId, user.sub)
    .first<{ id: string }>();
  if (!owned) return json({ error: 'not found' }, 404);
  await env.DB.prepare('DELETE FROM saved_deals WHERE id = ? AND user_id = ?').bind(dealId, user.sub).run();
  // Keep the pipeline in lock-step: the deal shares saved_deals' id, so remove it (and
  // its history/facts/verdicts) too. Done REGARDLESS of the flag — a migrated deal (from
  // the 0005 backfill) exists in `deals` even while the pipeline UI is off, so gating this
  // would orphan a status='live' row that no flag-off API surfaces, yet countLiveDeals
  // (the cap) still counts, permanently leaking a slot and hiding the row from the board.
  // Deleting it changes NO flag-off response (they all read saved_deals only); it's a
  // no-op when there is no such pipeline deal.
  await deleteDeal(env.DB, user.sub, dealId);
  return json({ ok: true });
}

/** P4: move a deal to another progress stage (skipping allowed — it's the user's own
 * money). Writes deal_stage_history + updates the card's stage/status. Pipeline-only. */
async function handleMoveDeal(request: Request, env: Env, dealId: string): Promise<Response> {
  if (!siteConfig.features.dealPipeline) return json({ error: 'not found' }, 404);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  let body: { stage?: string };
  try {
    body = (await request.json()) as { stage?: string };
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const toStage = String(body?.stage ?? '');
  // Only progress stages here — parking/killing goes through /dead (it needs a reason).
  if (!isStage(toStage) || toStage === DEAD_STAGE.key) return json({ error: 'bad request' }, 400);
  const deal = await getOwnedDeal(env.DB, user.sub, dealId);
  if (!deal) return json({ error: 'not found' }, 404);
  if (deal.stage !== toStage) await moveStage(env.DB, dealId, deal.stage, toStage);
  return json({ ok: true, stage: toStage, status: statusForStage(toStage) });
}

/** P4: park/kill a deal with a one-chip reason (P9 builds the full graveyard). */
async function handleParkDeal(request: Request, env: Env, dealId: string): Promise<Response> {
  if (!siteConfig.features.dealPipeline) return json({ error: 'not found' }, 404);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  let body: { reason?: string };
  try {
    body = (await request.json()) as { reason?: string };
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const reason = String(body?.reason ?? '').slice(0, 40).trim();
  const deal = await getOwnedDeal(env.DB, user.sub, dealId);
  if (!deal) return json({ error: 'not found' }, 404);
  await markDead(env.DB, dealId, deal.stage, reason);
  return json({ ok: true, stage: DEAD_STAGE.key, status: 'dead' });
}

/**
 * Cron: retry pending Kit pushes with backoff. Subscribes fail-terminal after
 * MAX_ATTEMPTS (logged for wrangler tail; an ops surface is logged future
 * work); unsubscribes retry forever. LIMIT 100 so rows inside their backoff
 * window can't starve ready ones (volume is one row per consent event).
 */
async function processOutbox(env: Env, nowMs = Date.now()): Promise<void> {
  const pending = await env.DB.prepare(
    "SELECT id, email, first_name, action, attempts, last_attempt, created_at FROM kit_outbox WHERE status = 'pending' ORDER BY created_at LIMIT 100",
  ).all<OutboxRow>();
  for (const row of pending.results) {
    if (row.attempts >= MAX_ATTEMPTS && row.action !== 'unsubscribe') {
      console.error(`kit outbox row permanently failed: action=${row.action}`);
      await env.DB.prepare("UPDATE kit_outbox SET status = 'failed' WHERE id = ?").bind(row.id).run();
      continue;
    }
    if (!shouldAttempt(row, nowMs)) continue;
    await attemptKitRow(env, row, nowMs);
  }
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
    if (pathname === '/api/deals' && method === 'POST') return handleSaveDeal(request, env);
    if (pathname === '/api/deals' && method === 'GET') return handleListDeals(request, env);
    {
      const m = /^\/api\/deals\/([0-9a-f-]{36})$/.exec(pathname);
      if (m && method === 'DELETE') return handleDeleteDeal(request, env, m[1]);
      const mv = /^\/api\/deals\/([0-9a-f-]{36})\/stage$/.exec(pathname);
      if (mv && method === 'POST') return handleMoveDeal(request, env, mv[1]);
      const pk = /^\/api\/deals\/([0-9a-f-]{36})\/dead$/.exec(pathname);
      if (pk && method === 'POST') return handleParkDeal(request, env, pk[1]);
    }

    if (pathname.startsWith('/auth/') || pathname.startsWith('/api/')) {
      return json({ error: 'not found' }, 404);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: unknown, env: Env): Promise<void> {
    await processOutbox(env);
  },
};
