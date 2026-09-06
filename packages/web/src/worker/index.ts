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
import { features } from '../config/features';
import { BRIDGING_RULES, BROKER, brokerReady } from '../config/bridging';
import { captureReady, KIT_FIELDS } from '../config/capture';
import { qualify, isComplete, loanAmount, phoneDigits, type Enquiry } from '../lib/bridging';
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
import { ackChainRisk, ackChange, boardRows, boardWindow, dealCounts, listDeathsFor, listFactsFor, terminalPage, canAddLiveDeal, openDeath, reviveDeal, toDealFact, setDealDate, stampStaleness, countLiveDeals, deleteDeal, deleteFact, foldFactsIntoParams, getOwnedDeal, listChanges, scoreHistory, listFacts, markDead, moveStage, parseAnalyserDeal, parseSoldEvidence, recordFact, recordVerdict, setDealScore, upsertPipelineDeal, type FactChange, type FactVerdict } from './lib/pipeline';
import { BOARD_PAGE, DAILY_CRON, DEAD_STAGE, DEAL_DATE_KEYS, isFactType, isStage, LIVE_CAP_MESSAGE, MAX_LIVE_DEALS, PARK_REASON_KEYS, URGENCY, statusForStage } from '../config/pipeline';
import { datesOn, rankUrgent } from '../lib/deals/urgency';
import { handleDevLogin, handleDevSeed, handleDevSeedClear } from './dev';

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  DB: D1Database;
  JWT_SECRET: string;
  GOOGLE_CLIENT_SECRET: string;
  TURNSTILE_SECRET: string;
  KIT_API_KEY: string;
  /** DEV-ONLY gate. Set ONLY in .dev.vars (never deployed); undefined in production,
   * which disables /auth/dev-login and /dev/seed entirely. See worker/dev.ts. */
  DEV_LOGIN?: string;
}

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** Only a slug in the registry can be saved (T1). */

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

/** A deliberately plain address check: one @, a dot in the domain, no spaces. */
function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(v) && v.length <= 254;
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
    // ONLY the consent actions supersede each other — a pending bridging
    // notification is a different thing and must still be delivered.
    // An UNSUBSCRIBE also retires a pending tool lead (T3): someone who has
    // just withdrawn must not then be emailed a breakdown by a queued row.
    env.DB.prepare(
      action === 'unsubscribe'
        ? "UPDATE kit_outbox SET status = 'superseded' WHERE email = ? AND status = 'pending' AND (action IN ('subscribe','unsubscribe') OR action LIKE 'lead-%')"
        : "UPDATE kit_outbox SET status = 'superseded' WHERE email = ? AND status = 'pending' AND action IN ('subscribe','unsubscribe')",
    ).bind(email),
    env.DB.prepare(
      "INSERT INTO kit_outbox (id, user_id, email, first_name, action, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
    ).bind(id, userId, email, firstName, action, now),
  ]);
  await attemptKitRow(env, { id, email, first_name: firstName, action, attempts: 0 });
}

/** One push attempt for a queued row; updates its status. Never throws. */
async function attemptKitRow(
  env: Env,
  row: { id: string; email: string; first_name: string; action: string; attempts: number; fields_json?: string | null },
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

/**
 * Who is signed in? A signed-out visitor is a normal answer, not an error, so
 * this returns 200 with `user: null` rather than a 401 that every public page
 * would log to the console (T1). The client treats a 401 the same way, so an
 * older cached bundle keeps working.
 */
async function handleMe(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ user: null }, 200);
  const row = await env.DB.prepare('SELECT marketing_consent FROM users WHERE id = ?')
    .bind(user.sub)
    .first<{ marketing_consent: number }>();
  if (!row) {
    // Session outlived the account (deleted) — treat as signed out.
    return json({ user: null }, 200, { 'Set-Cookie': clearSessionCookie() });
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
    // A tool lead from this address predates any account (user_id NULL) and
    // carries their figures — "delete everything" has to mean it too (T3).
    env.DB.prepare("DELETE FROM kit_outbox WHERE email = ? AND action LIKE 'lead-%'").bind(user.email),
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
    // F1: a bridging enquiry is personal data too — deleting the account
    // deletes it, exactly as the privacy policy says.
    env.DB.prepare('DELETE FROM bridging_enquiries WHERE user_id = ?').bind(user.sub),
    // T1: nothing writes tool_saves since T2 removed the save, but any row
    // from that window is account data — "delete everything" still means it.
    env.DB.prepare('DELETE FROM tool_saves WHERE user_id = ?').bind(user.sub),
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
  const byParams = await env.DB.prepare('SELECT id FROM saved_deals WHERE user_id = ? AND strategy = ? AND url_params = ?')
    .bind(user.sub, strategy, urlParams)
    .first<{ id: string }>();
  // P5.1 — IDENTITY BY ID WHEN THE ANALYSER WAS OPENED FROM A DEAL. The board's
  // card link carries `deal=<id>`; the analyser sends it back. A deal opened from
  // the board and saved again is the SAME deal even though its numbers changed —
  // and after a fact the numbers ALWAYS differ, so without this the board grew a
  // stale twin. The id must be the signed-in user's own deal, under the same
  // strategy, or it is ignored entirely.
  const claimedId = typeof (body as { deal_id?: unknown }).deal_id === 'string'
    ? String((body as { deal_id?: unknown }).deal_id) : '';
  // A LIVE deal only. A re-save must never quietly rewrite one that has been
  // parked or bought: that record is the story of a decision already made, and
  // the numbers it died on are the evidence for it (P6 review).
  const claimed = /^[0-9a-f-]{36}$/.test(claimedId)
    ? await env.DB.prepare(
      `SELECT s.id, s.url_params FROM saved_deals s JOIN deals d ON d.id = s.id
        WHERE s.id = ? AND s.user_id = ? AND s.strategy = ? AND d.status = 'live'`,
    )
      .bind(claimedId, user.sub, strategy)
      .first<{ id: string; url_params: string }>()
    : null;
  // ...and only while it is still the SAME PROPERTY. Someone can open a deal and
  // then type a different address into the analyser; saving that must make a new
  // deal, not overwrite the one they came from. The postcode is the check.
  const partOf = (params: string, key: string): string =>
    (new URLSearchParams(params).get(key) ?? '').toUpperCase().replace(/\s+/g, '');
  /**
   * The same property, or a different one? (P7)
   *
   * A postcode covers about fifteen addresses, so the postcode alone cannot
   * identify a property — and an id that cannot POSITIVELY identify a deal must
   * never overwrite one. So: the postcode must match, BOTH sides must name the
   * building (and the flat, where either does), and those names must match.
   *
   * A deal with no house number therefore saves as a NEW deal rather than
   * landing on one we only think it is. The analyser already has the field
   * (SubjectForm's "House number or name"), so the fix is one box away, and the
   * cost of being wrong here is somebody's deal.
   */
  const samePlace = (a: string, b: string): boolean => {
    if (partOf(a, 'postcode') === '' || partOf(a, 'postcode') !== partOf(b, 'postcode')) return false;
    // Neither names the property: we cannot tell these two apart, so we do not pretend to.
    if (partOf(a, 'paon') === '' || partOf(b, 'paon') === '') return false;
    if (partOf(a, 'paon') !== partOf(b, 'paon')) return false;
    // The FLAT must match where both name one. Where one is silent it is not
    // ambiguity — there is no flat-number input on the analyser at all, so the
    // only way to arrive here is our own form having dropped it, and refusing
    // would fork a deal we can name the building and the id of (P7 review).
    const flatA = partOf(a, 'saon');
    const flatB = partOf(b, 'saon');
    return flatA === '' || flatB === '' || flatA === flatB;
  };
  const owned = claimed !== null && samePlace(claimed.url_params, urlParams) ? claimed : null;
  // If some OTHER saved deal already holds these exact params, that row is this
  // property under these numbers — merge onto it rather than breaking the unique
  // index. Otherwise the deal we were opened from wins.
  const existing = byParams ?? owned;

  // ---- P2: save into the deal PIPELINE (only when the flag is on) ----
  if (features.dealPipeline) {
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
    if (byParams === null && owned !== null) {
      // Same deal, new numbers: move the row's params rather than inserting a
      // second one. The deal keeps its id, and so its stage and its whole history.
      //
      // A save with NOTHING COMPUTED does not move them: it would redefine what
      // the deal's numbers are while the facts on top still apply to the old
      // ones, and it folds nothing in to make that safe (P7 review).
      await (payload.score === null
        ? env.DB.prepare('UPDATE saved_deals SET title = ?, key_figure = ? WHERE id = ? AND user_id = ?')
          .bind(title, keyFigure, owned.id, user.sub).run()
        : env.DB.prepare('UPDATE saved_deals SET url_params = ?, title = ?, key_figure = ? WHERE id = ? AND user_id = ?')
          .bind(urlParams, title, keyFigure, owned.id, user.sub).run());
    } else {
      await env.DB.prepare(
        'INSERT INTO saved_deals (id, user_id, strategy, title, url_params, key_figure, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, strategy, url_params) DO UPDATE SET title = excluded.title, key_figure = excluded.key_figure',
      ).bind(id, user.sub, strategy, title, urlParams, keyFigure, now).run();
    }
    const canonical = await env.DB.prepare('SELECT id FROM saved_deals WHERE user_id = ? AND strategy = ? AND url_params = ?')
      .bind(user.sub, strategy, urlParams)
      .first<{ id: string }>();
    const dealId = canonical?.id ?? id;
    // Idempotent per property+strategy: re-save updates the deal and adds a new
    // verdict snapshot, KEEPING its stage/history. The internal cap check is a
    // backstop for the tiny check-then-write race (self-heals on the next save).
    const r = await upsertPipelineDeal(env.DB, { id: dealId, userId: user.sub, postcodeSector }, payload);
    if (r === 'at-cap') return json({ error: LIVE_CAP_MESSAGE }, 409);
    // The page was opened from this deal WITH its facts applied, and those numbers
    // have just been saved as the deal's own. Fold the corrections in so nothing
    // is counted twice — see foldFactsIntoParams.
    // ONLY when we actually saved onto the deal we were opened from, and only
    // when there was a real verdict to save: a page with nothing computed put
    // nothing into these numbers, so it can fold nothing in (P6 review).
    let folded = 0;
    if (features.dealFacts && owned !== null && dealId === owned.id && owned.url_params !== urlParams && payload.score !== null) {
      // Only the facts that were on the page when it opened — one entered since,
      // in another tab, was never in these numbers and must keep applying.
      const asOfRaw = (body as { facts_as_of?: unknown }).facts_as_of;
      // An EMPTY string is not a bound — it is "no window given". Treating it as
      // one silently folded nothing, leaving a fact applying to numbers that
      // already contained it (P7 review).
      const asOf = typeof asOfRaw === 'string' && asOfRaw.trim() !== '' ? asOfRaw.slice(0, 40) : undefined;
      const stmts = await foldFactsIntoParams(env.DB, dealId, strategy, asOf);
      if (stmts.length > 0) {
        await env.DB.batch(stmts);
        folded = stmts.length;
      }
    }
    return json({ ok: true, id: dealId, updated: r === 'updated', pipeline: true, foldedFacts: folded });
  }

  // ---- flag OFF: exactly today's behaviour (the flat saved-deals list) ----
  // Identity by PARAMS only here. The flat list has no board to open a deal from,
  // so `deal_id` means nothing to it — honouring it would report "updated" while
  // leaving the stored numbers untouched.
  if (byParams) {
    await env.DB.prepare('UPDATE saved_deals SET title = ?, key_figure = ? WHERE id = ?')
      .bind(title, keyFigure, byParams.id)
      .run();
    return json({ ok: true, id: byParams.id, updated: true });
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
  if (features.dealPipeline) {
    // One row per deal, joined to saved_deals ONLY for its url_params (the analyser
    // link) — every deal has a matching saved_deals row (P2 dual-write; deleted
    // together). headline_figure is the board card's figure; key_figure is the
    // honest fallback for migrated/older deals that predate it.
    // P11 — every LIVE deal (bounded by the cap) plus a WINDOW of the bought and
    // the killed, which are kept for ever. The counts beside them are counted in
    // the database, so a window can never make a number wrong.
    const board = await boardWindow(env.DB, user.sub);
    // Coerce the SQLite 0/1 auction flag to a real boolean for the client.
    const deals = board.rows.map((r) => ({ ...r, is_auction: r.is_auction === 1 }));
    const liveCount = board.counts.live;
    // P5: the facts travel with the board so the browser can apply them and
    // re-score with core — the server never scores anything itself.
    const factRows = features.dealFacts ? await listFactsFor(env.DB, user.sub, deals.map((d) => d.id)) : [];
    const facts = factRows.map(toDealFact);
    // P6: the changes nobody has seen yet travel with the board, so an
    // announcement survives a reload exactly as it survives a closed tab.
    const changes = features.verdictChanges ? await listChanges(env.DB, user.sub) : [];
    // P9: the deaths, so the graveyard shows the card as it died rather than the
    // deal as it is now. The snapshot is parsed on the client, which is where it
    // is read; a row we cannot read shows as a headstone with no card.
    const deaths = features.dealGraveyard
      ? await listDeathsFor(env.DB, user.sub, deals.filter((d) => d.status === 'dead').map((d) => d.id))
      : [];
    return json({
      pipeline: true, deals, facts, changes, deaths, liveCount, cap: MAX_LIVE_DEALS,
      counts: board.counts, more: board.more,
    });
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



/**
 * T3 — a tool lead: the person saw their answer, then asked for it by email.
 *
 * THE ANSWER WAS NEVER GATED. This runs only after they have it, only if they
 * ticked the box, and only for a tool whose Kit tag and automation are real —
 * `captureReady` refuses anything else rather than promising an email nobody
 * set up. Two ways in: a signed-in person (the sign-in IS the human check) or a
 * typed address, which must pass Turnstile.
 *
 * D1 first, Kit second, and the app itself never sends the email.
 */
async function handleToolLead(request: Request, env: Env): Promise<Response> {
  if (!features.toolsSection || !features.toolCapture) return json({ error: 'not found' }, 404);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const str = (k: string): string => (typeof body[k] === 'string' ? (body[k] as string).trim() : '');
  const tool = str('tool');
  if (!captureReady(tool)) return json({ error: 'not offered' }, 404);
  // No pre-ticked boxes anywhere, and no row without one.
  if (body.consent !== true) return json({ error: 'consent required' }, 400);

  const user = await currentUser(request, env);
  const typed = str('email');
  let email: string;
  let firstName: string;
  if (typed !== '') {
    // They typed one, so that is the address — being signed in does not
    // override "use another email". A typed address always passes the check.
    if (!isEmail(typed)) return json({ error: 'bad email' }, 400);
    const human = await verifyTurnstile(str('turnstile'), env.TURNSTILE_SECRET, request.headers.get('CF-Connecting-IP'));
    if (!human) return json({ error: 'human check failed' }, 403);
    email = typed.toLowerCase();
    // Never blank an existing Kit subscriber's name: send one only if we have it.
    firstName = user && user.email.toLowerCase() === email ? (user.name.split(' ')[0] ?? '') : '';
  } else {
    if (!user) return json({ error: 'bad email' }, 400);
    // Signed in with no typing: we already have the address, and the sign-in
    // is the human check.
    email = user.email;
    firstName = user.name.split(' ')[0] ?? '';
  }

  // Their own figures, exactly as the page showed them. Capped so a crafted
  // body cannot post an essay into Kit.
  const fields: Record<string, string> = {
    [KIT_FIELDS.headline]: str('headline').slice(0, 200),
    [KIT_FIELDS.detail]: str('detail').slice(0, 400),
    [KIT_FIELDS.maths]: str('maths').slice(0, 600),
  };
  // The consent line promises "occasional property emails", so for someone with
  // an account this IS their marketing consent and the account has to say so —
  // otherwise deleting the account would never tell Kit to unsubscribe them.
  if (user && user.email.toLowerCase() === email) {
    await env.DB.prepare(
      'UPDATE users SET marketing_consent = 1, consent_ts = ?, consent_version = ? WHERE id = ? AND marketing_consent = 0',
    ).bind(new Date().toISOString(), siteConfig.consentVersion, user.sub).run();
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const action = `lead-${tool}`;
  await env.DB.prepare(
    "INSERT INTO kit_outbox (id, user_id, email, first_name, action, status, created_at, fields_json) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
  ).bind(id, user?.sub ?? null, email, firstName, action, now, JSON.stringify(fields)).run();
  // one inline attempt so the common case is instant; failure waits for the cron
  await attemptKitRow(env, { id, email, first_name: firstName, action, attempts: 0, fields_json: JSON.stringify(fields) });
  return json({ queued: true });
}

/**
 * F1 — a bridging enquiry. Sign-in gated (we already have their name and
 * email, so we never ask), Turnstile-checked, and QUALIFIED SERVER-SIDE with
 * the same pure rules the browser used, so nothing can be talked past by
 * editing the page. D1 is written FIRST and is the source of truth: if Kit is
 * unreachable the row still exists, the outbox retries, and the person still
 * gets an honest answer.
 *
 * This is an INTRODUCTION, never advice and never a decision about anyone's
 * finance (CLAUDE.md → "Bridging finance page").
 */
async function handleBridgingEnquiry(request: Request, env: Env): Promise<Response> {
  if (!features.bridgingFinance) return json({ error: 'not found' }, 404);
  // The form does not render until the broker is real, so the endpoint must not
  // accept a phone number either — no collection without somewhere to send it.
  if (!brokerReady()) return json({ error: 'not open' }, 404);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const str = (k: string): string => (typeof body[k] === 'string' ? (body[k] as string).trim() : '');
  const human = await verifyTurnstile(str('turnstile'), env.TURNSTILE_SECRET, request.headers.get('CF-Connecting-IP'));
  if (!human) return json({ error: 'human check failed' }, 403);

  const enquiry: Enquiry = {
    loan: str('loan'),
    deposit: str('deposit') as Enquiry['deposit'],
    property: str('property') as Enquiry['property'],
    entity: str('entity') as Enquiry['entity'],
    exit: str('exit') as Enquiry['exit'],
    story: str('story'),
    timing: str('timing') as Enquiry['timing'],
    credit: str('credit') as Enquiry['credit'],
    phone: str('phone'),
    consent: body.consent === true,
  };
  // The same completeness rules the form showed — enforced again here.
  if (!isComplete(enquiry)) return json({ error: 'incomplete' }, 400);

  const decision = qualify(enquiry);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const firstName = user.name.split(' ')[0] ?? '';

  // D1 FIRST: the enquiry is safe before Kit is touched at all.
  await env.DB.prepare(
    `INSERT INTO bridging_enquiries (id, user_id, email, first_name, phone, loan, deposit_band, property_state,
      entity, exit_route, story, timing, credit, outcome, reasons, consent_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id, user.sub, user.email, firstName, phoneDigits(enquiry.phone), loanAmount(enquiry.loan),
      enquiry.deposit, enquiry.property, enquiry.entity, enquiry.exit, enquiry.story.slice(0, 4000),
      enquiry.timing, enquiry.credit, decision.outcome, decision.reasons.join(','), now, now,
    )
    .run();

  // Then the outbox row Kit acts on — the app itself sends no email, ever.
  const action = decision.outcome === 'qualified' ? 'bridging-qualified' : 'bridging-not-yet';
  await env.DB.prepare(
    "INSERT INTO kit_outbox (id, user_id, email, first_name, action, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
  ).bind(crypto.randomUUID(), user.sub, user.email, firstName, action, now).run();
  // one inline attempt so the common case is instant; failure just waits for the cron
  const row = await env.DB.prepare(
    "SELECT id, email, first_name, action, attempts FROM kit_outbox WHERE action = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(action, user.sub).first<{ id: string; email: string; first_name: string; action: string; attempts: number }>();
  if (row) await attemptKitRow(env, row);

  // the reasons are stable keys; the page turns them into one line each
  return json({ outcome: decision.outcome, reasons: decision.reasons });
}

/** P4: move a deal to another progress stage (skipping allowed — it's the user's own
 * money). Writes deal_stage_history + updates the card's stage/status. Pipeline-only. */
async function handleMoveDeal(request: Request, env: Env, dealId: string): Promise<Response> {
  if (!features.dealPipeline) return json({ error: 'not found' }, 404);
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

/** P4.1/P4.2: backfill a deal's score (analyser computed it on open for a deal that
 * had none). Targets the deal by id — verdict fields only, never creates. */
async function handleScoreDeal(request: Request, env: Env, dealId: string): Promise<Response> {
  if (!features.dealPipeline) return json({ error: 'not found' }, 404);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  let body: { score?: number; verdict_line?: string; headline_figure?: string; criteria_json?: string; evidence_json?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const score = typeof body?.score === 'number' && Number.isFinite(body.score) ? body.score : null;
  if (score === null) return json({ error: 'bad request' }, 400);
  const verdictLine = String(body?.verdict_line ?? '').slice(0, 160).trim();
  const headlineFigure = String(body?.headline_figure ?? '').slice(0, 60).trim();
  const ok = await setDealScore(env.DB, user.sub, dealId, score, verdictLine, headlineFigure);
  if (!ok) return json({ error: 'not found' }, 404);
  // P5: EVERY re-score leaves a snapshot behind — the score, what it was judged
  // against and the evidence at that moment. P6 reads this history, so it has to
  // be complete from the very first fact.
  const v = readFactVerdict(body as Record<string, unknown>);
  if (v === 'bad' || v === undefined) return json({ error: 'bad request' }, 400);
  // P5.1: whoever scored it says what sold evidence it rested on, so the next
  // re-score uses the same band instead of quietly losing the component.
  const b2 = body as { sold_evidence?: unknown };
  if (typeof b2.sold_evidence === 'string') {
    await env.DB.prepare('UPDATE deals SET sold_evidence = ? WHERE id = ? AND user_id = ?')
      .bind(parseSoldEvidence(b2.sold_evidence), dealId, user.sub).run();
  }
  await recordVerdict(env.DB, dealId, { score, criteriaJson: v.criteriaJson, evidenceJson: v.evidenceJson });
  return json({ ok: true });
}

/**
 * P5 — a fact arrives. The deal learns something: a builder's quote, a survey
 * finding, a down-valuation. The SERVER only stores it; the browser re-scores
 * with @gil-bricks/core and posts the new verdict back, so there is exactly one
 * pathway into the maths.
 */

/**
 * The re-score a fact carries with it (P5). The BROWSER runs @gil-bricks/core and
 * sends what it got; the server stores it beside the fact in one batch, so a card
 * can never show a score the database does not hold. Invalid JSON is refused
 * rather than stored — a snapshot P6 cannot parse is worse than no snapshot.
 */
function readFactVerdict(body: Record<string, unknown>): FactVerdict | undefined | 'bad' {
  if (body.score === undefined || body.score === null) return undefined;
  const score = typeof body.score === 'number' && Number.isFinite(body.score) ? body.score : null;
  if (score === null || score < 0 || score > 10) return 'bad';
  const json = (v: unknown): string | null => {
    if (typeof v !== 'string' || v.length > 4000) return null;
    try {
      JSON.parse(v);
      return v;
    } catch {
      return null;
    }
  };
  const criteriaJson = json(body.criteria_json) ?? '{}';
  const evidenceJson = json(body.evidence_json) ?? '{}';
  return {
    score,
    verdictLine: String(body.verdict_line ?? '').slice(0, 160).trim(),
    headlineFigure: String(body.headline_figure ?? '').slice(0, 60).trim(),
    criteriaJson,
    evidenceJson,
  };
}

/**
 * The verdict CHANGE a fact caused (P6). The browser decided it was worth saying
 * — it has both scores and the rules from config — and sends the facts of it.
 * The server stores those facts, never a finished sentence: the wording lives in
 * config so it can be reworded later, for old changes too.
 */
function readFactChange(body: Record<string, unknown>): FactChange | undefined | 'bad' {
  const raw = body.change;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') return 'bad';
  const c = raw as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const from = num(c.from_score);
  const to = num(c.to_score);
  if (from === null || to === null || from < 0 || from > 10 || to < 0 || to > 10) return 'bad';
  const previous = num(c.previous_value);
  return {
    fromScore: from,
    toScore: to,
    previousValue: previous !== null && previous >= 0 ? previous : null,
    toVerdictLine: String(c.to_verdict_line ?? '').slice(0, 200).trim(),
  };
}

async function handleAddFact(request: Request, env: Env, dealId: string): Promise<Response> {
  if (!features.dealPipeline || !features.dealFacts) return json({ error: 'not found' }, 404);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  const owned = await getOwnedDeal(env.DB, user.sub, dealId);
  if (!owned) return json({ error: 'not found' }, 404);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const factType = typeof body.fact_type === 'string' ? body.fact_type : '';
  if (!isFactType(factType)) return json({ error: 'unknown fact type' }, 400);
  const raw = body.value;
  const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : null;
  if (value !== null && (value < 0 || value > 100_000_000)) return json({ error: 'bad request' }, 400);
  const note = String(body.note ?? '').slice(0, 200).trim();
  const verdict = readFactVerdict(body);
  if (verdict === 'bad') return json({ error: 'bad request' }, 400);
  const change = features.verdictChanges ? readFactChange(body) : undefined;
  if (change === 'bad') return json({ error: 'bad request' }, 400);
  const changeId = change ? crypto.randomUUID() : null;
  const { id, enteredAt } = await recordFact(
    env.DB, dealId, factType, JSON.stringify({ value, note: note === '' ? null : note }), verdict,
    change && changeId ? { id: changeId, value, change } : undefined,
  );
  return json({ id, changeId, entered_at: enteredAt });
}

/** P5 — remove a fact entered wrongly. The browser re-scores without it. */
async function handleDeleteFact(request: Request, env: Env, dealId: string, factId: string): Promise<Response> {
  if (!features.dealPipeline || !features.dealFacts) return json({ error: 'not found' }, 404);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  // The score the deal goes back to travels with the delete, so removing a fact
  // and putting the score back are one write, not two.
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* no body is fine: a fact that moved nothing needs no re-score */
  }
  const verdict = readFactVerdict(body);
  if (verdict === 'bad') return json({ error: 'bad request' }, 400);
  const ok = await deleteFact(env.DB, user.sub, dealId, factId, verdict);
  return ok ? json({ ok: true }) : json({ error: 'not found' }, 404);
}

/**
 * P8 — a date the person set on a deal: a chase, an auction, an exchange. Only
 * the three configured columns, only a plain ISO day, and clearing it is the
 * same call with an empty value. The app never sets one itself.
 */
async function handleSetDate(request: Request, env: Env, dealId: string): Promise<Response> {
  if (!features.dealPipeline || !features.dealDates) return json({ error: 'not found' }, 404);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const column = typeof body.date_key === 'string' ? body.date_key : '';
  if (!DEAL_DATE_KEYS.includes(column)) return json({ error: 'bad request' }, 400);
  const raw = typeof body.value === 'string' ? body.value.trim() : '';
  // A plain day, or nothing. Never a timestamp, never a free string.
  if (raw !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return json({ error: 'bad request' }, 400);
  // A day that does not exist (2026-02-31) parses fine and rolls over, so the
  // only honest check is that it comes back as the same day (P8 review).
  if (raw !== '') {
    const parsed = new Date(`${raw}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
      return json({ error: 'bad request' }, 400);
    }
  }
  const ok = await setDealDate(env.DB, user.sub, dealId, column, raw === '' ? null : raw);
  return ok ? json({ ok: true, date_key: column, value: raw }) : json({ error: 'not found' }, 404);
}

/** P6: the person has seen the change. It stops showing, and P8 stops ranking it. */
async function handleAckChange(request: Request, env: Env, dealId: string, changeId: string): Promise<Response> {
  if (!features.dealPipeline || !features.verdictChanges) return json({ error: 'not found' }, 404);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  const ok = await ackChange(env.DB, user.sub, dealId, changeId);
  return ok ? json({ ok: true }) : json({ error: 'not found' }, 404);
}

/**
 * WHAT NEEDS YOU, FOR A SURFACE THAT IS NOT THE BOARD (P10).
 *
 * The extension's daily badge asks this once a day. It answers with the SAME
 * ranking the board runs — `rankUrgent` from src/lib/deals/urgency.ts, over the
 * same rows, facts and changes — so the badge and the board can never disagree,
 * and there is no second idea of "urgent" anywhere in the product.
 *
 * `critical` is the one tier that earns an interruption (URGENCY.critical): a
 * dated deadline that is nearly here. Everything else is a number on a badge.
 * Signed out is a 401 with no body: the extension shows nothing at all rather
 * than a stale count.
 */
async function handleAttention(request: Request, env: Env): Promise<Response> {
  if (!features.dealPipeline) return json({ error: 'not found' }, 404);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  const rows = await boardRows(env.DB, user.sub);
  const deals = rows.map((r) => ({ ...r, is_auction: r.is_auction === 1 }));
  const facts = features.dealFacts ? (await listFacts(env.DB, user.sub)).map(toDealFact) : [];
  const changes = features.verdictChanges ? await listChanges(env.DB, user.sub) : [];
  const now = Date.now();
  const ranked = rankUrgent({ deals, facts, changes, now });
  // EVERY deadline that qualifies, in the board's own order. The extension
  // announces the first it has not already announced: a date left uncleared must
  // not fire a notification every morning for ever, and must not silence a NEW
  // deadline behind it either (P10 review). Capped — this is a nudge, not a feed.
  const deadlines = ranked
    .filter((u) => u.reason === URGENCY.critical)
    .map((u) => {
      // WHICH deadline it is, as a plain day, so it is one identifiable thing.
      // STILL AHEAD, and inside the window: the board is right to keep nagging
      // about a date you missed, but a date that has already passed is not
      // time-critical and must never buy an interruption (P10 review). This is
      // exactly what the store paperwork promises: inside the next 48 hours.
      const due = datesOn(u.deal)
        .filter((d) => d.at >= now && d.at - now <= URGENCY.deadlineWithinHours * 3_600_000)
        .sort((a, b) => a.at - b.at)[0];
      // The line is the board's own sentence, in the operator's voice — the
      // extension never writes one of its own.
      return due ? { dealId: u.deal.id, text: u.text, due: new Date(due.at).toISOString().slice(0, 10) } : null;
    })
    .filter((d): d is { dealId: string; text: string; due: string } => d !== null)
    .slice(0, URGENCY.criticalMax);
  return json({ count: ranked.length, critical: deadlines[0] ?? null, deadlines });
}

/**
 * P11 — the next page of the deals kept for ever: the killed (the graveyard) or
 * the bought. The board loads a window of each; this is "show me more of them".
 * The cursor is the last row you already hold, so nothing repeats and nothing is
 * skipped when a deal changes while you are reading.
 */
async function handleTerminalPage(request: Request, env: Env, url: URL, status: 'dead' | 'done'): Promise<Response> {
  if (!features.dealPipeline) return json({ error: 'not found' }, 404);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  const updatedAt = url.searchParams.get('before') ?? '';
  const id = url.searchParams.get('beforeId') ?? '';
  const cursor = updatedAt !== '' && id !== '' ? { updatedAt, id } : undefined;
  const page = await terminalPage(env.DB, user.sub, status, BOARD_PAGE.more, cursor);
  const deals = page.rows.map((r) => ({ ...r, is_auction: r.is_auction === 1 }));
  const deaths = status === 'dead' && features.dealGraveyard
    ? await listDeathsFor(env.DB, user.sub, deals.map((d) => d.id))
    : [];
  // The facts on THESE deals too, so a card that arrives late knows what it has
  // learned — the same page, the same facts.
  const factRows = features.dealFacts ? await listFactsFor(env.DB, user.sub, deals.map((d) => d.id)) : [];
  return json({ deals, deaths, facts: factRows.map(toDealFact), more: page.more, counts: await dealCounts(env.DB, user.sub) });
}

/**
 * P11: the chain-risk card has been read on this deal. Once set, it stays set.
 */
async function handleChainAck(request: Request, env: Env, dealId: string): Promise<Response> {
  if (!features.dealPipeline || !features.chainRisk) return json({ error: 'not found' }, 404);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  const ok = await ackChainRisk(env.DB, user.sub, dealId);
  return ok ? json({ ok: true }) : json({ error: 'not found' }, 404);
}

/** P6: the score at each evidence step, from the snapshots P5 has been writing. */
async function handleDealHistory(request: Request, env: Env, dealId: string): Promise<Response> {
  if (!features.dealPipeline || !features.verdictChanges) return json({ error: 'not found' }, 404);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  const points = await scoreHistory(env.DB, user.sub, dealId);
  return json({ points });
}

/**
 * P4 kill, P9 capture: one reason CHIP (a stable key, validated against config)
 * and an optional one line. The snapshot of the card as it died is frozen
 * server-side by markDead, so every death is captured the same way — whether it
 * came from the park chip or the change line's one-tap kill.
 */
async function handleParkDeal(request: Request, env: Env, dealId: string): Promise<Response> {
  if (!features.dealPipeline) return json({ error: 'not found' }, 404);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  let body: { reason_key?: string; note?: string };
  try {
    body = (await request.json()) as { reason_key?: string; note?: string };
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const reasonKey = String(body?.reason_key ?? '').trim();
  if (!PARK_REASON_KEYS.includes(reasonKey)) return json({ error: 'bad request' }, 400);
  // The note is the operator's own words and is never required. With the
  // graveyard off there is nowhere to type one, so none is stored.
  const note = features.dealGraveyard ? String(body?.note ?? '').slice(0, 200).trim() : '';
  const deal = await getOwnedDeal(env.DB, user.sub, dealId);
  if (!deal) return json({ error: 'not found' }, 404);
  // Already dead — from another tab, or a retry. Hand back the death it HAS
  // rather than writing a second one: the first snapshot is the true one, and a
  // failure here would only make the screen disagree with the database (review).
  if (deal.status === 'dead') {
    const held = await openDeath(env.DB, dealId);
    return json({ ok: true, stage: DEAD_STAGE.key, status: 'dead', death: held });
  }
  const death = await markDead(env.DB, dealId, deal.stage, reasonKey, note);
  return json({ ok: true, stage: DEAD_STAGE.key, status: 'dead', death });
}

/**
 * P9: a dead deal comes back. It returns to the stage it died at, the death is
 * kept and marked revived, and the re-score against TODAY's rules travels with
 * the call (computed by the browser with @gil-bricks/core, like every other
 * re-score). A full board refuses: a revived deal is a live deal again.
 */
async function handleReviveDeal(request: Request, env: Env, dealId: string): Promise<Response> {
  if (!features.dealPipeline || !features.dealGraveyard) return json({ error: 'not found' }, 404);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not signed in' }, 401);
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* no body is fine: a deal that cannot be scored comes back unscored */
  }
  const verdict = readFactVerdict(body);
  if (verdict === 'bad') return json({ error: 'bad request' }, 400);
  const res = await reviveDeal(env.DB, user.sub, dealId, verdict);
  if (res.atCap) return json({ error: 'at cap', message: LIVE_CAP_MESSAGE }, 409);
  return res.ok ? json({ ok: true, stage: res.stage, status: 'live' }) : json({ error: 'not found' }, 404);
}

/**
 * Cron: retry pending Kit pushes with backoff. Subscribes fail-terminal after
 * MAX_ATTEMPTS (logged for wrangler tail; an ops surface is logged future
 * work); unsubscribes retry forever. LIMIT 100 so rows inside their backoff
 * window can't starve ready ones (volume is one row per consent event).
 */
/** Days a delivered lead's figures are kept before the row is pruned (T3). */
const LEAD_RETENTION_DAYS = 90;

async function processOutbox(env: Env, nowMs = Date.now()): Promise<void> {
  // A tool lead carries someone's own figures and, on the typed path, an
  // address with no account behind it. Once Kit has it (or it has given up),
  // there is no reason to keep it — so it is pruned, not kept for ever.
  await env.DB.prepare(
    "DELETE FROM kit_outbox WHERE action LIKE 'lead-%' AND status IN ('sent','failed','superseded') AND created_at < ?",
  ).bind(new Date(nowMs - LEAD_RETENTION_DAYS * 86400_000).toISOString()).run();
  const pending = await env.DB.prepare(
    "SELECT id, email, first_name, action, attempts, last_attempt, created_at, fields_json FROM kit_outbox WHERE status = 'pending' ORDER BY created_at LIMIT 100",
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
    // DEV-ONLY routes (inert in production — see worker/dev.ts).
    if (pathname === '/auth/dev-login' && method === 'GET') return handleDevLogin(request, env);
    if (pathname === '/dev/seed' && method === 'GET') return handleDevSeed(request, env);
    if (pathname === '/dev/seed/clear' && method === 'GET') return handleDevSeedClear(request, env);
    if (pathname === '/api/me' && method === 'GET') return handleMe(request, env);
    if (pathname === '/api/consent' && method === 'POST') return handleConsent(request, env);
    if (pathname === '/api/account/delete' && method === 'POST') return handleDeleteAccount(request, env);
    if (pathname === '/api/tools/lead' && method === 'POST') return handleToolLead(request, env);
    if (pathname === '/api/bridging' && method === 'POST') return handleBridgingEnquiry(request, env);
    if (pathname === '/api/deals' && method === 'POST') return handleSaveDeal(request, env);
    if (pathname === '/api/deals' && method === 'GET') return handleListDeals(request, env);
    if (pathname === '/api/attention' && method === 'GET') return handleAttention(request, env);
    if (pathname === '/api/deals/dead' && method === 'GET') return handleTerminalPage(request, env, url, 'dead');
    if (pathname === '/api/deals/done' && method === 'GET') return handleTerminalPage(request, env, url, 'done');
    {
      const m = /^\/api\/deals\/([0-9a-f-]{36})$/.exec(pathname);
      if (m && method === 'DELETE') return handleDeleteDeal(request, env, m[1]);
      const mv = /^\/api\/deals\/([0-9a-f-]{36})\/stage$/.exec(pathname);
      if (mv && method === 'POST') return handleMoveDeal(request, env, mv[1]);
      const pk = /^\/api\/deals\/([0-9a-f-]{36})\/dead$/.exec(pathname);
      if (pk && method === 'POST') return handleParkDeal(request, env, pk[1]);
      const sc = /^\/api\/deals\/([0-9a-f-]{36})\/score$/.exec(pathname);
      if (sc && method === 'POST') return handleScoreDeal(request, env, sc[1]);
      const fa = /^\/api\/deals\/([0-9a-f-]{36})\/facts$/.exec(pathname);
      if (fa && method === 'POST') return handleAddFact(request, env, fa[1]);
      const fd = /^\/api\/deals\/([0-9a-f-]{36})\/facts\/([0-9a-f-]{36})$/.exec(pathname);
      if (fd && method === 'DELETE') return handleDeleteFact(request, env, fd[1], fd[2]);
      const ac = /^\/api\/deals\/([0-9a-f-]{36})\/changes\/([0-9a-f-]{36})\/ack$/.exec(pathname);
      if (ac && method === 'POST') return handleAckChange(request, env, ac[1], ac[2]);
      const hi = /^\/api\/deals\/([0-9a-f-]{36})\/history$/.exec(pathname);
      if (hi && method === 'GET') return handleDealHistory(request, env, hi[1]);
      const dt = /^\/api\/deals\/([0-9a-f-]{36})\/date$/.exec(pathname);
      if (dt && method === 'POST') return handleSetDate(request, env, dt[1]);
      const rv = /^\/api\/deals\/([0-9a-f-]{36})\/revive$/.exec(pathname);
      if (rv && method === 'POST') return handleReviveDeal(request, env, rv[1]);
      const ca = /^\/api\/deals\/([0-9a-f-]{36})\/chain-ack$/.exec(pathname);
      if (ca && method === 'POST') return handleChainAck(request, env, ca[1]);
    }

    if (pathname.startsWith('/auth/') || pathname.startsWith('/api/')) {
      return json({ error: 'not found' }, 404);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event: { cron?: string }, env: Env): Promise<void> {
    // The daily trigger only stamps staleness (P8): it computes, it never
    // notifies, and this app still sends no email of any kind. Every other
    // trigger is the Kit outbox safety net.
    if (event?.cron === DAILY_CRON) {
      // A failure here must never take the whole invocation down silently: it is
      // an index, and the board computes the same value on load regardless.
      try {
        if (features.dealPipeline) await stampStaleness(env.DB);
      } catch (err) {
        console.error(`daily staleness stamp failed: ${String(err)}`);
      }
      return;
    }
    await processOutbox(env);
  },
};
