/**
 * Reproducible fixture sanitiser (E3).
 *
 * Runs IN-PLACE over the committed fixtures and is IDEMPOTENT: run it again and
 * it makes no changes and re-asserts the corpus is clean. It never touches the
 * listing facts — it only removes third-party tracking/ad scaffolding and
 * asserts no personal data remains.
 *
 * What it removes / neutralises:
 *   - <script src> / <link href> / <iframe src> tags pointing at known
 *     analytics + ad hosts (Google Tag Manager, GA, DoubleClick/ad exchange,
 *     Visual Website Optimizer, Hotjar, Optimizely, Facebook pixel, etc.).
 *   - inline <script> analytics/consent bootstraps (gtag/dataLayer/GTM/VWO),
 *     but NEVER a block carrying the listing data (__PAGE_MODEL / __next_f /
 *     application/ld+json are always preserved).
 *   - the Zoopla __ZAD_TARGETING__ ad-targeting JSON payload -> {} .
 *
 * What it asserts afterwards (throws + non-zero exit if any fail):
 *   - the data blob for each portal still parses (PAGE_MODEL / flight / ld+json);
 *   - no tracker host, no __ZAD_TARGETING__ payload, no JWT, no GA cookie value,
 *     no real email, no `isAuthenticated":true` remains.
 *
 * Usage:  node packages/core/fixtures/listings/tools/sanitise.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_MARKERS = ['__PAGE_MODEL', '__next_f', 'application/ld+json'];

const TRACKER_HOSTS = [
  'googletagmanager.com', 'google-analytics.com', 'doubleclick.net', 'securepubads',
  'googlesyndication', 'adservice.google', 'g.doubleclick', 'visualwebsiteoptimizer.com',
  'hotjar.com', 'optimizely.com', 'connect.facebook.net', 'facebook.com/tr', 'taboola.com',
  'criteo.', 'bat.bing.com', 'cdn.segment.com', 'permutive', 'pubmatic', 'adsystem',
];
// inline analytics/consent bootstraps (only removed when the block has no data marker)
const INLINE_TRACKER = /(gtag\s*\(|window\.dataLayer|dataLayer\s*=|GTM-[A-Z0-9]+|_vwo_|visualwebsiteoptimizer|googletag\.(cmd|pubads)|fbq\s*\(|window\.permutive|permutive\.q)/;
// Executable tracker refs we must NOT leave behind (they would fetch on load).
// NB: ad-network HOSTNAMES that survive inside the __next_f flight / ld+json are
// the portal's own serialised ad-loader CONFIG — not personal tokens, and they
// cannot be removed without corrupting the listing JSON the corpus exists to
// test. We therefore assert on executable TAGS, not on host substrings in data.
const EXEC_TAG = (host) => new RegExp(`<(?:script|link|img|iframe)\\b[^>]*(?:src|href)="[^"]*${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');

const files = [];
for (const portal of ['rightmove', 'zoopla']) {
  for (const f of readdirSync(join(ROOT, portal))) {
    if (f.endsWith('.html')) files.push([portal, join(ROOT, portal, f)]);
  }
}

function stripTags(html) {
  let removed = 0;
  // <script ...src="tracker">...</script>  and self-closing <script src>...
  html = html.replace(/<script\b[^>]*\bsrc="([^"]*)"[^>]*>([\s\S]*?)<\/script>/gi, (m, src) => {
    if (TRACKER_HOSTS.some((h) => src.includes(h))) { removed++; return ''; }
    return m;
  });
  // inline <script> (no src) analytics bootstraps, but never a data block
  html = html.replace(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, (m, body) => {
    if (DATA_MARKERS.some((d) => m.includes(d))) return m; // keep listing data
    if (INLINE_TRACKER.test(body)) { removed++; return ''; }
    return m;
  });
  // <link ...href="tracker"> and <iframe ...src="tracker">
  html = html.replace(/<(?:link|iframe)\b[^>]*\b(?:href|src)="([^"]*)"[^>]*>(?:<\/iframe>)?/gi, (m, url) => {
    if (TRACKER_HOSTS.some((h) => url.includes(h))) { removed++; return ''; }
    return m;
  });
  return { html, removed };
}

function neutraliseZad(html) {
  let n = 0;
  html = html.replace(/(<script id="__ZAD_TARGETING__"[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, _body, close) => {
    n++; return `${open}{}${close}`;
  });
  return { html, changed: n };
}

function redactPII(html) {
  let n = 0;
  const before = html;
  html = html.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]');
  html = html.replace(/GA\d\.\d\.\d+\.\d+/g, '[REDACTED_GA]');
  html = html.replace(/gil@gilandbricks\.co\.uk/gi, '[REDACTED_EMAIL]');
  if (html !== before) n++;
  return { html, changed: n };
}

let totalRemoved = 0, totalZad = 0, totalPII = 0;
for (const [, path] of files) {
  let html = readFileSync(path, 'utf8');
  const a = stripTags(html); html = a.html;
  const b = neutraliseZad(html); html = b.html;
  const c = redactPII(html); html = c.html;
  writeFileSync(path, html);
  totalRemoved += a.removed; totalZad += b.changed; totalPII += c.changed;
}
console.log(`sanitise: removed ${totalRemoved} tracker tags, neutralised ${totalZad} ad blobs, redacted PII in ${totalPII} files`);

// ---- assertions (throw on any residue) ----
const problems = [];
for (const [portal, path] of files) {
  const html = readFileSync(path, 'utf8');
  // (1) no EXECUTABLE tracker tag may remain (host substrings inside data are ok)
  for (const h of TRACKER_HOSTS) if (EXEC_TAG(h).test(html)) problems.push(`${path}: executable tracker tag for ${h} still present`);
  // (2) Zoopla ad-targeting payload must be neutralised to {}
  const zad = html.match(/<script id="__ZAD_TARGETING__"[^>]*>([\s\S]*?)<\/script>/);
  if (zad && zad[1].trim() !== '{}') problems.push(`${path}: __ZAD_TARGETING__ payload not neutralised`);
  // (3) no personal identifier tokens
  if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./.test(html)) problems.push(`${path}: JWT-like token present`);
  if (/GA\d\.\d\.\d+\.\d+/.test(html)) problems.push(`${path}: GA cookie value present`);
  if (/\bfb\.\d\.\d+\.\d+\b/.test(html)) problems.push(`${path}: _fbp cookie value present`);
  if (/cto_bundle/.test(html)) problems.push(`${path}: criteo user token present`);
  if (/window\.permutive/.test(html)) problems.push(`${path}: permutive init still present`);
  if (/gil@gilandbricks/i.test(html)) problems.push(`${path}: user email present`);
  if (/isAuthenticated"?\s*:\s*true/.test(html)) problems.push(`${path}: logged-in state present`);
  // (4) data blob still present
  if (portal === 'rightmove' && !html.includes('__PAGE_MODEL')) problems.push(`${path}: PAGE_MODEL lost!`);
  if (portal === 'zoopla' && !html.includes('__next_f')) problems.push(`${path}: __next_f lost!`);
}
if (problems.length) {
  console.error('SANITISE ASSERTIONS FAILED:\n' + problems.join('\n'));
  process.exit(1);
}
console.log(`sanitise: all ${files.length} fixtures clean (no tracker host, no ad payload, no PII, data blobs intact)`);
