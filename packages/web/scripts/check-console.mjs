/**
 * THE CONSOLE GATE — what a BROWSER does with what we send.
 *
 *   node scripts/check-console.mjs [baseUrl]
 *
 * WHY THIS EXISTS. Every gate before it checked what the SERVER sends: the
 * bytes of the HTML, the words on the page, the size of a box. None of them
 * listened to the browser. So a Content-Security-Policy that blocked every
 * listing photograph and every floor plan passed twice — the server was sending
 * exactly what it meant to, and the only evidence of the fault was a console
 * line nobody was reading.
 *
 * This loads EVERY page type in real Chrome and fails on ANY of:
 *   - an uncaught exception;
 *   - a Content-Security-Policy refusal (always a fault, never noise);
 *   - a console error that is not on the short, reasoned allowlist below;
 *   - a request that fails outright to our OWN origin.
 *
 * The allowlist is deliberately tiny and each entry says why. Growing it is how
 * this gate would rot into the last one, so anything added here needs a reason
 * a person would accept out loud.
 */
import { chromium } from 'playwright-core';
import { chromeArgs } from './lib/chrome.mjs';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, dirname } from 'node:path';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(WEB, 'dist');
const B = process.argv[2] ?? process.env.BASE ?? 'https://proplaunch.ai';
if (process.env.CI === 'true' && process.argv[2] === undefined && process.env.BASE === undefined) {
  console.error('check-console: refusing to measure the deployed site in CI. Pass the local base URL.');
  process.exit(2);
}
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * EXPECTED, with the reason. Anything not here fails the gate.
 *  - the seen-set is per person, so signed out it is a 401 BY DESIGN; the page
 *    handles it and falls back to this device's own localStorage.
 */
const EXPECTED = [
  { match: /refurb-cues\/seen/, why: 'signed-out seen-set is a 401 by design' },
];

/**
 * THE LOCAL SERVER HAS NO WORKER. It serves dist, so every /api/* route 404s
 * here and would 200 in production. That is a limit of the local run, not a
 * fault, and it is stated rather than hidden: against a real origin these are
 * NOT excused, so a genuinely broken API route still fails this gate.
 */
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(B);
const excusedLocally = (text) => LOCAL && /\/api\//.test(text);

/**
 * THE MAP'S ASSETS ARE ABSOLUTE URLS, pointing at the deployed origin. Served
 * from localhost they are therefore cross-origin, and `connect-src 'self'`
 * refuses them — on production they are 'self' and load, which is why the map
 * works there and is verified working there.
 *
 * Excused ONLY when running locally AND the blocked address is the deployed
 * origin. A refusal of any other address, or the same refusal against
 * production, still fails: the point of this gate is that a policy fault is
 * visible, and an excuse that swallowed those would undo it.
 */
const DEPLOYED = 'https://proplaunch.ai';
const localAbsoluteAsset = (text) => LOCAL && text.includes(DEPLOYED);

/** Every built page, found rather than listed — a new page is covered free. */
function builtPages(dir = DIST, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // ASSET directories only. `area-data` was in this list and is a real page
      // — the one that fetches police, environment, planning and Land Registry
      // data, i.e. the page that exercises four of the connect-src origins. It
      // was the only page this gate never opened.
      if (['_astro', 'map', 'brand', 'fonts'].includes(name)) continue;
      builtPages(full, out);
    } else if (name === 'index.html') {
      const rel = relative(DIST, dir).replace(/\\/g, '/');
      out.push(rel === '' ? '/' : `/${rel}/`);
    }
  }
  return out;
}

/** A deal on the analysers, so the page does its real work rather than idling. */
const DEAL = 'ph=https%3A%2F%2Fmedia.rightmove.co.uk%2Fproperty-photo%2Fd0997424f%2F91604028%2Fd0997424f09721ef340eb299b00b0dfd.jpeg&postcode=SA1+6HW&price=75000&type=S&beds=3&area=70&rent=650&gdv=120000&arv=120000&roomRent=450&rooms=5&refurbCost=15000';
const AREA = 'pc=SA1+6HW';
/** Pages that render nothing without parameters are loaded WITH them, or the
 *  gate opens an empty shell and calls it clean. /comparables is the only page
 *  that mounts the map, and the map is why worker-src, blob: and the R2 origin
 *  are in the policy at all. */
const withDeal = (p) => {
  if (/\/analyser\/$/.test(p)) return `${p}?${DEAL}`;
  if (p === '/comparables/') return `${p}?postcode=SA1+6HW&view=map`;
  if (p === '/area-data/') return `${p}?${AREA}`;
  return p;
};

const pages = builtPages().sort();
const browser = await chromium.launch({ executablePath: CHROME, args: chromeArgs() });
const fails = [];

for (const [vpName, viewport, isMobile] of [['desktop', { width: 1440, height: 900 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile });
  for (const path of pages) {
    const page = await ctx.newPage();
    const noise = [];
    const say = (kind, text) => {
      if (EXPECTED.some((e) => e.match.test(text))) return;
      // The local excuse covers MISSING ROUTES only. It used to drop anything
      // whose text mentioned /api/, which would have swallowed a real TypeError
      // thrown in a fetch handler, or a connect-src refusal on an /api path —
      // the same "narrowed to a substring rather than closed to a case" blind
      // spot that let a broken policy through in the first place.
      if (kind.startsWith('HTTP') && excusedLocally(text)) return;
      noise.push(`${kind}: ${text.slice(0, 150)}`);
    };
    page.on('pageerror', (e) => say('threw', String(e.message ?? e)));
    page.on('console', (m) => {
      const t = m.text();
      if (/Content Security Policy/.test(t)) {
        if (localAbsoluteAsset(t)) return;
        return say('BLOCKED BY OUR OWN CSP', t);
      }
      // the response hook above names these properly; the bare line says nothing
      if (/Failed to load resource/.test(t)) return;
      // the map reporting the same cross-origin refusal in its own words
      if (localAbsoluteAsset(t)) return;
      if (m.type() === 'error') say('console error', t);
    });
    page.on('requestfailed', (r) => {
      // only our own origin: a portal or third party refusing us is their answer
      if (r.url().startsWith(B)) say('request failed', `${r.url()} — ${r.failure()?.errorText ?? '?'}`);
    });
    // A bare "Failed to load resource: 404" in the console names nothing, which
    // is useless to whoever has to fix it. Name the URL.
    page.on('response', (r) => {
      if (!r.url().startsWith(B)) return;
      if (r.status() >= 400) say(`HTTP ${r.status()}`, r.url().replace(B, ''));
    });

    try {
      await page.goto(`${B}${withDeal(path)}`, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(/analyser\/$/.test(path) ? 8000 : 2500);
    } catch (err) {
      say('navigation', String(err).slice(0, 120));
    }

    if (noise.length > 0) {
      console.log(`${path} [${vpName}]`);
      for (const n of [...new Set(noise)].slice(0, 4)) { console.log(`  ✗ ${n}`); fails.push(`${path} [${vpName}] ${n}`); }
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();

if (fails.length > 0) {
  console.error(`\nCONSOLE GATE: ${fails.length} problem(s) — the browser complained and nobody was listening.`);
  process.exit(1);
}
const scope = LOCAL
  ? ' (local run: no Worker, so /api is not exercised, and the map\'s absolute asset URLs are cross-origin here)'
  : '';
console.log(`\nCONSOLE GATE: ALL PASSED — ${pages.length} pages x 2 widths, not one console error.${scope}`);
