/**
 * THE JOURNEY GATE (M4) — the product walked the way a person walks it.
 *
 *   node scripts/check-journey.mjs [baseUrl]
 *
 * WHY THIS EXISTS. Four bugs in three days all shipped having passed their
 * tests, and they share one shape: tests that verify INTENT rather than observe
 * BEHAVIOUR. A round-trip whose two sides read the same list. A policy gate
 * whose server sent no policy. A layout gate that only ever looked at one
 * width. A dropdown nothing asserted was wired to anything.
 *
 * So this one does not read the source, does not count occurrences, and does
 * not build its expectation from the constant under test. It opens the live
 * site, arrives the way the extension delivers a deal, and then does what a
 * person does — looks, types, switches, checks the number moved — failing on
 * anything the person would notice.
 *
 * WHAT IT CANNOT DO, said out loud rather than quietly skipped: the second half
 * of the journey — save the deal, reopen it from the pipeline, add a fact, watch
 * it re-score, park it, bring it back — all require a signed-in session, and
 * production has no test account by design. Those steps are asserted here only
 * as far as an anonymous visitor can see them: that they refuse correctly. The
 * rest is a declared gap, not a covered one.
 */
import { chromium } from 'playwright-core';

const B = process.argv[2] ?? process.env.BASE ?? 'https://gil-bricks-app.gil-782.workers.dev';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const PHOTOS = [
  'https://media.rightmove.co.uk/property-photo/d0997424f/91604028/d0997424f09721ef340eb299b00b0dfd.jpeg',
  'https://media.rightmove.co.uk/property-photo/e161dbd49/91604028/e161dbd49b16ca6b5ce14ca8ca3a4b62.jpeg',
].join(' ');
const PLAN = 'https://media.rightmove.co.uk/property-floorplan/9196cc0ea/91604028/9196cc0eabc1c5dd4b2f0ab6d1ea2f1d.jpeg';

/** A handoff exactly as the extension builds one. */
const ARRIVAL = new URLSearchParams({
  postcode: 'SA1 6HW', price: '95000', type: 'T', beds: '3', baths: '1', area: '80', paon: '12',
  rent: '800', ph: PHOTOS, fp: PLAN,
  // M6 — the flag the board's legal-pack warning depends on. It is metadata,
  // not a form field, which is exactly the shape that used to be discarded on
  // the first write.
  auction: '1',
}).toString();

const fails = [];
const note = (step, msg) => { fails.push(`${step}: ${msg}`); console.log(`    ✗ ${msg}`); };
const ok = (msg) => console.log(`    ✓ ${msg}`);

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

for (const [vpName, viewport, isMobile] of [['desktop', { width: 1440, height: 900 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  console.log(`\n=== ${vpName} ===`);
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile });
  const page = await ctx.newPage();

  // Anything the browser complains about, anywhere in the journey.
  const noise = [];
  page.on('pageerror', (e) => noise.push(`threw: ${String(e.message).slice(0, 120)}`));
  page.on('console', (m) => {
    const t = m.text();
    if (/Content Security Policy/.test(t)) noise.push(`CSP refusal: ${t.slice(0, 120)}`);
    else if (m.type() === 'error' && !/refurb-cues\/seen/.test(t) && !/Failed to load resource/.test(t)) noise.push(`console: ${t.slice(0, 120)}`);
  });

  const params = async () => page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)));
  const analyser = async () => page.evaluate(() => (document.querySelector('.analyser')?.innerText ?? '').replace(/\s+/g, ' '));
  const score = async () => page.evaluate(() => ((document.querySelector('.analyser')?.innerText ?? '').match(/(\d\.\d)\s*\/10/) ?? [])[1] ?? null);

  // ---- 1. ARRIVE ----------------------------------------------------------
  console.log('  1. arrive from a handoff');
  await page.goto(`${B}/buy-to-let/analyser/?${ARRIVAL}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  const arrived = await params();
  if (!('ph' in arrived) || !('fp' in arrived)) note('arrive', 'the handoff lost ph/fp before anything was touched');
  else ok('the link still carries the photos and the plan');
  if (arrived.auction !== '1') note('arrive', 'the auction flag was gone before anything was touched');
  else ok('the deal arrived flagged as an auction');

  // SCROLL TO IT FIRST, because a person does. The photo is lazy-loaded, so on a
  // 390px screen it sits below the fold and has honestly not been asked for yet;
  // measuring it there would report working lazy-loading as a broken image.
  await page.evaluate(() => document.querySelector('.rc-photo')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(2500);
  const photo = await page.evaluate(() => {
    const i = document.querySelector('.rc-photo');
    return i === null ? null : { loaded: i.complete && i.naturalWidth > 0, w: i.naturalWidth };
  });
  if (photo === null) note('arrive', 'no photo element rendered at all');
  else if (!photo.loaded) note('arrive', 'the listing photo did not load');
  else ok(`the listing photo renders (${photo.w}px wide)`);

  // ---- 2. THE FLOOR PLAN --------------------------------------------------
  console.log('  2. open the floor plan');
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /reconfigure/i.test(x.textContent ?? ''));
    if (b === undefined) return false;
    b.click();
    return true;
  });
  if (!opened) note('floorplan', 'no way to open the floor plan');
  else {
    await page.waitForTimeout(2500);
    const fp = await page.evaluate(() => {
      const s = document.querySelector('.tp-surface');
      const imgs = [...document.querySelectorAll('#sec-floorplan svg image')].map((i) => i.getAttribute('href') ?? '');
      return { surface: s !== null, h: s === null ? 0 : Math.round(s.getBoundingClientRect().height),
               vh: window.innerHeight, backdrop: imgs.some((h) => h !== ''), controls: document.querySelectorAll('.tp-chrome button').length };
    });
    if (!fp.surface) note('floorplan', 'no tracing surface');
    else if (!fp.backdrop) note('floorplan', 'the agent’s plan was sent but nothing was painted — a black box');
    else if (fp.h > fp.vh * 0.8) note('floorplan', `the surface is ${fp.h}px in a ${fp.vh}px viewport — its controls are below the fold`);
    else if (fp.controls < 3) note('floorplan', `only ${fp.controls} controls — the tool is not usable`);
    else ok(`the plan is painted, ${fp.h}px tall, ${fp.controls} controls on screen`);
  }

  // ---- 3. THE EPC LOOKUP --------------------------------------------------
  console.log('  3. run the EPC lookup');
  const epc = await page.evaluate(async () => {
    const res = await fetch('/api/epc?postcode=SA16HW&paon=12', { credentials: 'same-origin' });
    return { status: res.status, body: (await res.text()).slice(0, 120) };
  });
  if (epc.status !== 200) note('epc', `the lookup answered ${epc.status}`);
  else ok(`the lookup answers: ${epc.body}`);

  // ---- 4. EDIT SOMETHING THAT SHOULD MOVE THE NUMBER ----------------------
  console.log('  4. edit an input');
  const before = await score();
  await page.evaluate(() => {
    const el = document.querySelector('#sf-rent');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(el, '1600');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(3000);
  const afterEdit = await score();
  if (before !== null && before === afterEdit) note('edit', `doubling the rent left the score at ${before} — a number that should have moved did not`);
  else ok(`the score moved ${before} → ${afterEdit}`);

  const kept = await params();
  const lost = Object.keys(arrived).filter((k) => !(k in kept));
  if (lost.length > 0) note('edit', `editing lost: ${lost.join(', ')}`);
  else ok('nothing the deal arrived with was lost by editing');
  // Named rather than derived: the board warns about the legal pack off this
  // one, and a list-driven check goes quiet the moment the list changes.
  if (kept.auction !== '1') note('edit', 'editing lost the AUCTION FLAG — the board would not warn about the legal pack');
  else ok('and the auction flag is still there after the edit');

  // ---- 5. AND ONE THAT SHOULD NOT -----------------------------------------
  console.log('  5. edit something that should change nothing');
  const heldBefore = await score();
  await page.evaluate(() => {
    const el = document.querySelector('#f-garden');
    if (el === null) return;
    el.value = el.value === 'yes' ? 'none' : 'yes';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(2500);
  const heldAfter = await score();
  if (heldBefore !== heldAfter) note('hold', `changing a context-only field moved the score ${heldBefore} → ${heldAfter}`);
  else ok(`the score held at ${heldAfter}, as a context-only field should leave it`);

  // ---- 6. CHANGE STRATEGY -------------------------------------------------
  console.log('  6. change strategy');
  await page.goto(`${B}/flip/analyser/?${ARRIVAL}&gdv=145000&refurbCost=18000`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  const onFlip = await params();
  if (!('ph' in onFlip) || !('fp' in onFlip)) note('strategy', 'the photos did not survive the strategy change');
  else ok('the deal arrives intact on another strategy');
  const flipText = await analyser();
  if (!/verdict/i.test(flipText)) note('strategy', 'the flip page rendered no verdict section');
  else ok('the other strategy renders its own verdict');

  // ---- 7. EVERY SECTION HAS SOMETHING IN IT -------------------------------
  console.log('  7. no section renders empty');
  const empties = await page.evaluate(() => [...document.querySelectorAll('.analyser > section')]
    .filter((s) => (s.innerText ?? '').trim().length < 20)
    .map((s) => s.id || (s.querySelector('h2')?.textContent ?? '(unnamed)')));
  if (empties.length > 0) note('sections', `empty: ${empties.join(', ')}`);
  else ok('every section on the page has content');

  // ---- 8. THE SIGNED-IN HALF, as far as anonymous can see -----------------
  console.log('  8. the signed-in half (anonymous can only see the refusals)');
  const guarded = await page.evaluate(async () => {
    const out = {};
    for (const [name, path, method] of [['save a deal', '/api/deals', 'POST'], ['the pipeline', '/api/attention', 'GET'], ['delete the account', '/api/account/delete', 'POST']]) {
      const res = await fetch(path, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
      out[name] = res.status;
    }
    return out;
  });
  for (const [name, status] of Object.entries(guarded)) {
    if (status !== 401 && status !== 403) note('auth', `${name} answered ${status} to an anonymous caller — it should refuse`);
    else ok(`${name} refuses an anonymous caller (${status})`);
  }
  console.log('    · not covered here: saving, reopening from the pipeline, adding a fact, re-scoring,');
  console.log('      parking and restoring — all need a session, and production has no test account.');

  // ---- the browser's own complaints, across the whole journey -------------
  for (const n of [...new Set(noise)].slice(0, 5)) note('console', n);
  if (noise.length === 0) ok('the browser complained about nothing, start to finish');

  await page.close();
  await ctx.close();
}
await browser.close();

if (fails.length > 0) {
  console.error(`\nJOURNEY GATE: ${fails.length} problem(s) on the walk a person takes.`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nJOURNEY GATE: ALL PASSED — arrival, photos, plan, lookup, edit, hold, strategy change, sections, refusals. Both widths.');
