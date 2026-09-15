/**
 * S1 — THE SEARCH CONSOLE MONITOR.
 *
 * Pulls impressions, clicks, average position and indexation from the Search
 * Console API, appends them to a history file committed to the repository, and
 * exits non-zero when something has fallen off a cliff — at which point the
 * workflow opens an issue assigned to the operator, exactly as the health check
 * does. A console nobody opens is worth nothing; this comes and finds him.
 *
 * WHAT "A CLIFF" MEANS IS NOT DECIDED HERE. The thresholds and the comparison
 * are in src/config/searchConsole.ts, so they can be tuned without touching
 * this file, and the comparison is a pure function with its own tests — the
 * half of a monitor most likely to be silently wrong is the half that decides
 * whether to shout.
 *
 * NO CREDENTIAL, NO PRETENCE. Without GOOGLE_SEARCH_CONSOLE_KEY it reports that
 * it cannot run and exits 0. It does not invent numbers, and it does not fail
 * the workflow for a credential the operator has not created yet.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSign } from 'node:crypto';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const HISTORY = join(WEB, 'docs', 'search-history.json');
const SITE = process.env.SEARCH_CONSOLE_SITE ?? 'sc-domain:proplaunch.ai';
const KEY = process.env.GOOGLE_SEARCH_CONSOLE_KEY ?? '';

const { findCliffs, SEARCH_MONITOR } = await import('../src/config/searchConsole.ts')
  .catch(async () => import('../dist-config/searchConsole.js'));

if (KEY.trim() === '') {
  console.log('No GOOGLE_SEARCH_CONSOLE_KEY — the monitor cannot run.');
  console.log('This is not a failure: the credential has not been created yet.');
  console.log('See docs/HANDOVER.md section 4 for the one thing that unblocks it.');
  process.exit(0);
}

/** A Google service-account access token, signed locally. No SDK, no install. */
async function accessToken(creds) {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claim)}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(creds.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${sig}`,
    }),
  });
  if (!res.ok) throw new Error(`token: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); };

let creds;
try { creds = JSON.parse(KEY); } catch { console.error('GOOGLE_SEARCH_CONSOLE_KEY is not valid JSON'); process.exit(1); }

const token = await accessToken(creds);
const auth = { authorization: `Bearer ${token}` };

/* ── the daily numbers ─────────────────────────────────────────────────── */
const q = await fetch(
  `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
  {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      startDate: daysAgo(SEARCH_MONITOR.historyDays),
      endDate: daysAgo(0),
      dimensions: ['date'],
      rowLimit: 25000,
    }),
  },
);
if (!q.ok) { console.error(`searchAnalytics: ${q.status} ${(await q.text()).slice(0, 300)}`); process.exit(1); }
const rows = (await q.json()).rows ?? [];

/* ── indexation, best effort ───────────────────────────────────────────── */
let indexed = null;
try {
  const i = await fetch(
    `https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`,
    { method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ inspectionUrl: 'https://proplaunch.ai/', siteUrl: SITE }) },
  );
  if (i.ok) {
    const verdict = (await i.json())?.inspectionResult?.indexStatusResult?.verdict;
    // The inspection API answers for ONE url. It is a liveness signal for the
    // homepage, not a site-wide count — the count needs the Sitemaps API below.
    indexed = verdict === 'PASS' ? 1 : 0;
  }
} catch { /* non-fatal */ }

try {
  const s = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/sitemaps`,
    { headers: auth },
  );
  if (s.ok) {
    const maps = (await s.json()).sitemap ?? [];
    const submitted = maps.flatMap((m) => m.contents ?? []).reduce((n, c) => n + Number(c.submitted ?? 0), 0);
    const idx = maps.flatMap((m) => m.contents ?? []).reduce((n, c) => n + Number(c.indexed ?? 0), 0);
    if (submitted > 0) indexed = idx > 0 ? idx : indexed;
    console.log(`sitemaps: ${maps.length} submitted, ${submitted} urls, ${idx} reported indexed`);
  }
} catch { /* non-fatal */ }

/* ── merge into history, newest wins ───────────────────────────────────── */
mkdirSync(dirname(HISTORY), { recursive: true });
const prev = existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, 'utf8')) : [];
const byDay = new Map(prev.map((r) => [r.day, r]));
for (const r of rows) {
  byDay.set(r.keys[0], {
    day: r.keys[0],
    impressions: Math.round(r.impressions ?? 0),
    clicks: Math.round(r.clicks ?? 0),
    position: Number((r.position ?? 0).toFixed(2)),
    indexed: byDay.get(r.keys[0])?.indexed ?? null,
  });
}
const today = iso(new Date());
if (indexed !== null) {
  const t = byDay.get(today) ?? { day: today, impressions: 0, clicks: 0, position: 0, indexed: null };
  byDay.set(today, { ...t, indexed });
}
const history = [...byDay.values()]
  .sort((a, b) => a.day.localeCompare(b.day))
  .slice(-SEARCH_MONITOR.historyDays);
writeFileSync(HISTORY, `${JSON.stringify(history, null, 1)}\n`);
console.log(`history: ${history.length} days → docs/search-history.json`);

/* ── has anything fallen off a cliff? ──────────────────────────────────── */
const verdicts = findCliffs(history);
for (const v of verdicts) console.log(`  ${v.fell ? '✗' : '·'} ${v.id}: ${v.detail}`);
const fell = verdicts.filter((v) => v.fell);
if (fell.length > 0) {
  console.log(`\n::error::${fell.length} search signal(s) fell off a cliff`);
  writeFileSync(join(WEB, 'docs', '.search-alert.json'), JSON.stringify(fell, null, 1));
  process.exit(2);
}
console.log('\nnothing fell off a cliff.');
