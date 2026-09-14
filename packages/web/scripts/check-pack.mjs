/**
 * THE DEAL PACK GATE (DP1) — a real pack, rendered in a real browser.
 *
 *   npm run pack-gate -w packages/web
 *
 * WHY THIS EXISTS. Everything else about the pack is checked in pieces: the
 * engine has unit tests, the document has render tests, the stylesheet has
 * assertions. None of that opens a pack. A document whose whole job is to come
 * out of a printer as six clean A4 sheets with somebody's own colour on it
 * cannot be signed off from a string comparison, and "it renders" is not the
 * claim — "an investor could read this" is.
 *
 * WHAT IT WALKS, end to end, as a person does it:
 *   sign in → save a BRRRR deal from the analyser → press the pack button on
 *   its card → complete the one-off declaration → set a business name, a logo
 *   and an accent colour → build the pack → read every page → print it.
 *
 * WHAT IT THEN ASSERTS IS TRUE OF THE THING ON SCREEN, not of the source:
 *   • six A4 sheets, measured in the browser's own layout, not in the CSS;
 *   • the accent is the COMPUTED colour of the rule under the headings;
 *   • no image anywhere has a source that is not a data URI — so no portal
 *     photograph and no agent's floor plan is in the document;
 *   • no request left the page for a portal host while the pack was built;
 *   • the Deal Score and the verdict this very deal was given are nowhere in
 *     the rendered text;
 *   • the locked sections are on the page with their boxes disabled, and
 *     forcing the boxes off does not take them out of the document;
 *   • under print emulation the builder's controls are gone and the sheets
 *     are still there.
 *
 * IT USES THE SAME LOCAL-WORKER DESIGN AS THE SIGNED-IN GATE, for the same
 * reasons and with the same limits — see scripts/check-signed-in.mjs, which
 * explains at length why signing in through `/auth/dev-login` on a local
 * Worker is the only honest way to walk the signed-in half of this product.
 * Its own database, in a temporary directory, thrown away at the end.
 */
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH ?? undefined;
const PORT = Number(process.env.PORT ?? 8791);
const SHOTS = process.env.PACK_SHOTS ?? join(WEB, 'docs', 'screens', 'pack');

const fails = [];
const note = (m) => { fails.push(m); console.log(`    ✗ ${m}`); };
const ok = (m) => console.log(`    ✓ ${m}`);

/** A Welsh BRRRR: bought under the local typical price, refurbished, refinanced. */
const DEAL = {
  postcode: 'SA1 6HW', price: '120000', beds: '3', baths: '1', area: '82', paon: '12',
  type: 'T', rent: '1100', arv: '200000', refurbCost: '35000',
  // A ticked scope, so the plan page and the duration runway are walked too —
  // a deal with a typed total alone leaves that page saying "nothing ticked",
  // which proves nothing about the half of it that matters.
  rfList: '1', rfKitchen: '8000', rfBathroom: '4500', rfRewire: '5500',
  rfPlastering: '6000', rfDecoration: '3500', rfFlooring: '3500', rfOther: '4000',
};
const ON_BOARD = /Terraced · SA1 6HW · £120,000/;

/** What the sourcer types about themselves, once. */
const DECLARATION = {
  businessName: 'Hillside Property Partners',
  hmrcAml: 'XZML00000123',
  redressScheme: 'The Property Ombudsman',
  redressNumber: 'T12345',
  ico: 'ZB123456',
  piInsurer: 'Hiscox',
  piExpiry: '30 June 2027',
};
const ACCENT = '#8a1f4b';
/** A 1×1 PNG. Their logo, and the only image bytes this product ever stores. */
const LOGO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

if (!existsSync(join(WEB, 'dist', 'index.html'))) {
  console.error('No build at packages/web/dist. The Worker serves the built pages.\nRun: npm run build -w packages/web');
  process.exit(1);
}

const state = mkdtempSync(join(tmpdir(), 'gb-pack-'));
const FAKE = [
  /**
   * THE HOSTNAME THE LOCAL WORKER THINKS IT IS SERVING.
   *
   * WITHOUT THIS THE DEV DOOR IS SHUT AND THE GATE CANNOT SIGN IN. wrangler
   * takes the hostname a locally-run Worker sees from the first `routes` entry
   * in wrangler.jsonc, so the moment the product got its own domain (DM1) the
   * Worker booted here started seeing `http://proplaunch.ai/...` instead of
   * `http://localhost:PORT/...` — on a server reachable only on localhost.
   *
   * `isDevEnv` (worker/dev.ts) requires a localhost host, and that requirement
   * is exactly what keeps /auth/dev-login inert in production. So every
   * dev-only route began answering a bare 404 and this gate could not sign in.
   * The guard was right; the boot was wrong.
   *
   * `--local-upstream` is the local-mode knob for precisely this. The long
   * version of this note is in check-signed-in.mjs, which hit it first.
   */
  '--local-upstream', 'localhost',
  '--var', 'DEV_LOGIN:on',
  '--var', 'JWT_SECRET:gate-only-not-a-real-secret',
  '--var', 'GOOGLE_CLIENT_SECRET:not-a-real-secret',
  '--var', 'TURNSTILE_SECRET:not-a-real-secret',
  '--var', 'KIT_API_KEY:not-a-real-key',
];

console.log('\n=== bringing up the real Worker on its own database ===');
execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'gil-bricks-db', '--local', '--persist-to', state],
  { cwd: WEB, stdio: 'pipe' });
ok('every migration applied to a fresh database');

const worker = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', state, ...FAKE],
  { cwd: WEB, stdio: ['ignore', 'pipe', 'pipe'] });
const B = `http://localhost:${PORT}`;
let workerLog = '';
worker.stdout.on('data', (d) => { workerLog += d; });
worker.stderr.on('data', (d) => { workerLog += d; });

const up = await (async () => {
  for (let i = 0; i < 120; i += 1) {
    const alive = await fetch(`${B}/api/health`).then((r) => r.ok, () => false);
    if (alive) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
})();

let browser = null;
try {
  if (!up) {
    note(`the Worker never came up on ${B}\n${workerLog.slice(-800)}`);
  } else {
    ok(`the Worker is answering on ${B}`);

    /**
     * THE DEV DOOR, ASKED BEFORE A BROWSER IS EVEN LAUNCHED.
     *
     * Everything this gate does starts with signing in through /auth/dev-login,
     * and that route is guarded by `isDevEnv` — DEV_LOGIN set AND a localhost
     * host. When the guard refuses, the route answers a bare 404 exactly as if
     * it did not exist, the browser lands on a 404 page, and the only thing the
     * gate used to say was "signing in did not land on the board", which names
     * neither the cause nor the fix. That symptom cost an hour once (DM1).
     *
     * Asked here, with the two reasons it can fail spelled out.
     */
    const doorCode = await fetch(`${B}/auth/dev-login`, { redirect: 'manual' })
      .then((r) => r.status, () => 0);
    if (doorCode !== 302) {
      const seen = await fetch(`${B}/api/health`).then((r) => r.url, () => '');
      note([
        `the dev door is shut: GET /auth/dev-login answered ${doorCode}, expected 302.`,
        `    Nothing below can run. isDevEnv (worker/dev.ts) needs BOTH:`,
        `      1. DEV_LOGIN=on  — passed on the command line above, so this is rarely it;`,
        `      2. a localhost request host — and wrangler takes the host a LOCAL Worker`,
        `         sees from the first "routes" entry in wrangler.jsonc, not from --port.`,
        `    If wrangler.jsonc has a custom-domain route, boot with --local-upstream localhost`,
        `    (this script already does). Health check resolved as: ${seen || 'unknown'}`,
      ].join('\n'));
      throw new Error('dev door shut');
    }
    ok('the dev door is open on this local Worker (302 to the board)');
    mkdirSync(SHOTS, { recursive: true });
    browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, acceptDownloads: true });
    const page = await ctx.newPage();
    page.setDefaultTimeout(25000);

    const noise = [];
    page.on('pageerror', (e) => noise.push(`threw: ${String(e.message).slice(0, 140)}`));
    page.on('console', (m) => {
      const t = m.text();
      if (/Content Security Policy/.test(t)) noise.push(`CSP refusal: ${t.slice(0, 140)}`);
      else if (m.type() === 'error' && !/Failed to load resource/.test(t)) noise.push(`console: ${t.slice(0, 140)}`);
    });
    /** Every request the page makes, so "nothing was fetched" is observed. */
    const requested = [];
    page.on('request', (r) => requested.push(r.url()));

    /* ── 1. sign in, save the deal ──────────────────────────────────────── */
    console.log('\n=== a deal to make a pack from ===');
    await page.goto(`${B}/auth/dev-login`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(2500);
    if (!/\/deals/.test(page.url())) throw new Error(`signing in did not land on the board (${page.url()})`);
    ok('signed in');

    await page.goto(`${B}/brrrr/analyser/?${new URLSearchParams(DEAL)}`, { waitUntil: 'domcontentloaded' });
    const save = page.getByRole('button', { name: /^Save to pipeline$/ }).first();
    await save.waitFor({ timeout: 25000 });
    await save.click();
    await page.waitForTimeout(2500);
    ok('saved a BRRRR deal from the analyser');

    /** The score and verdict THIS deal was given. None of it may reach the pack. */
    await page.goto(`${B}/deals/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const card = page.locator('.deal-card').filter({ hasText: ON_BOARD }).first();
    if (!await card.count()) throw new Error('the saved deal is not on the board');
    const cardText = (await card.innerText()).replace(/\s+/g, ' ');
    // The board's own score element, not a regex over the whole card — a card
    // carries other numbers and one of them will eventually look like a score.
    const score = (await card.locator('.board-score strong').first().innerText().catch(() => '')).trim();
    const verdictLine = (await card.locator('.dc-verdict, .board-verdict, .dc-line').first().innerText().catch(() => '')).trim();
    ok(`the board scores it ${score || '(no score)'}/10${verdictLine ? ` — "${verdictLine.slice(0, 60)}"` : ''}`);

    /* ── 2. the pack button, and the declaration ────────────────────────── */
    console.log('\n=== the door to the pack ===');
    const packLink = card.locator('a.dc-pack').first();
    if (!await packLink.count()) throw new Error('the deal card offers no pack button');
    await packLink.click();
    await page.waitForTimeout(2500);
    // The site links without a trailing slash and the asset server redirects
    // to the directory form; either spelling is the pack for this deal.
    if (!/\/pack\/?\?deal=/.test(page.url())) throw new Error(`the pack button did not open a pack (${page.url()})`);
    ok('the card’s button opens /pack for that deal');

    const declareHeading = page.getByRole('heading', { name: /before you make a deal pack/i });
    if (!await declareHeading.count()) throw new Error('no declaration was asked for before the first pack');
    ok('the one-off declaration stands in front of the first pack');

    const make = page.getByRole('button', { name: /^Make the pack$/ });
    if (await make.count()) throw new Error('the builder is reachable before the declaration is done');
    ok('and nothing else on the page is reachable until it is done');

    for (const [key, value] of Object.entries(DECLARATION)) await page.fill(`#pk-d-${key}`, value);
    await page.screenshot({ path: join(SHOTS, '0-declaration.png'), fullPage: true });
    await page.check('#pk-d-confirm');
    await page.getByRole('button', { name: /confirm and continue/i }).click();
    await page.waitForTimeout(2000);
    ok('declaration saved');

    /* ── 3. the document is ALREADY THERE ───────────────────────────────── */
    console.log('\n=== one screen, and the pack is on it ===');
    const sheetsNow = await page.locator('.pk-page').count();
    if (sheetsNow < 3) note(`the composer opened with ${sheetsNow} sheets — the pack should render immediately`);
    else ok(`the pack renders on arrival, ${sheetsNow} sheets, with nothing to click through`);
    if (await page.getByRole('button', { name: /^Make the pack$/ }).count()) {
      note('there is still a "make the pack" step between the user and the document');
    } else ok('there is no build step and no final screen to get stuck on');

    /* ── 4. their branding, on the same screen ──────────────────────────── */
    await page.evaluate((hex) => {
      const el = document.querySelector('.pk-swatches input[type=color]');
      el.value = hex;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, ACCENT);
    await page.setInputFiles('#pk-logo', { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(LOGO, 'base64') });
    await page.waitForTimeout(800);
    ok('accent colour and logo set without leaving the screen');

    /* ── 4. the locked sections, on the builder ─────────────────────────── */
    const locked = ['basis', 'compliance', 'disclaimer'];
    for (const key of locked) {
      const box = page.locator(`#pk-s-${key}`);
      if (!await box.isChecked()) throw new Error(`the locked section "${key}" is not ticked`);
      if (!await box.isDisabled()) throw new Error(`the locked section "${key}" can be unticked`);
    }
    ok('the three locked sections are ticked and cannot be unticked');

    // A disabled box is a suggestion. Take the suggestion away and click.
    await page.evaluate((keys) => {
      for (const k of keys) {
        const el = document.querySelector(`#pk-s-${k}`);
        el.disabled = false;
        el.click();
      }
    }, locked);
    await page.waitForTimeout(400);
    for (const key of locked) {
      if (!await page.locator(`#pk-s-${key}`).isChecked()) throw new Error(`"${key}" came off when the disabling was removed`);
    }
    ok('and they stay on when the disabling is removed and they are clicked');

    // THEIR OWN PHOTOGRAPHS, added the way a person adds them. The pack has to
    // carry pictures for "no portal image" to mean anything.
    await page.setInputFiles('.pk-side input[type=file][accept="image/*"]', [
      { name: 'front.png', mimeType: 'image/png', buffer: Buffer.from(LOGO, 'base64') },
      { name: 'kitchen.png', mimeType: 'image/png', buffer: Buffer.from(LOGO, 'base64') },
    ]);
    await page.waitForTimeout(800);
    if (!/2 added/.test(await page.locator('.pk-side').last().innerText())) note('the photographs were not taken');
    else ok('two of their own photographs added');

    await page.screenshot({ path: join(SHOTS, '1-composer.png'), fullPage: true });

    /* ── 4b. the rail actually reorders ─────────────────────────────────── */
    const firstBefore = await page.locator('.pk-page').nth(1).innerText().catch(() => '');
    const down = page.getByRole('button', { name: /^Move The headline return down$/ });
    if (await down.count()) {
      await down.click();
      await page.waitForTimeout(800);
      const firstAfter = await page.locator('.pk-page').nth(1).innerText().catch(() => '');
      if (firstBefore === firstAfter) note('moving a section down changed nothing in the document');
      else ok('reordering the rail moves the page in the document, live');
      await page.getByRole('button', { name: /^Move The headline return up$/ }).click();
      await page.waitForTimeout(600);
    } else note('the rail offers no way to reorder with a keyboard');

    /* ── 5. the document ────────────────────────────────────────────────── */
    console.log('\n=== the pack itself ===');
    const before = requested.length;
    await page.waitForTimeout(1500);

    const sheets = page.locator('.pk-page');
    const count = await sheets.count();
    if (count < 5) note(`the pack rendered ${count} sheets — too few for a designed pack`);
    else ok(`${count} designed sheets`);

    /**
     * A4 at 96dpi is 793.7 × 1122.5 CSS pixels. Measured, not asserted in CSS.
     *
     * TOO TALL FAILS, NOT JUST TOO SHORT. The basis page's length depends on
     * how many figures the deal has, and a sheet that outgrows A4 spills onto
     * an extra physical page whose footer still says "6 of 6". That is exactly
     * how this was found.
     */
    // The composer scales the preview to fit its column. Measure the real
    // sheet, not the scaled one — reset the zoom for the measurement.
    await page.evaluate(() => { const el = document.querySelector('.pk-scale'); if (el) el.style.zoom = '1'; });
    await page.waitForTimeout(400);
    let a4 = true;
    for (let i = 0; i < count; i += 1) {
      const box = await sheets.nth(i).boundingBox();
      if (box === null || Math.abs(box.width - 793.7) > 2 || box.height < 1120 || box.height > 1124) {
        note(`sheet ${i + 1} measures ${Math.round(box.width)}×${Math.round(box.height)}, not A4 (793×1122)`);
        a4 = false;
      }
    }
    if (a4) ok('every sheet measures A4 in the browser’s own layout — none overflows');

    /** THEIR colour, computed — not the declaration in the stylesheet. */
    // The rule is a BORDER, not a filled box, and the page titles are
    // deliberately ink — a headline in a colour picked from a swatch is the one
    // place this could come out unreadable. Their colour carries the rule, the
    // eyebrow and the oversized section numeral, so those are what is measured.
    const accentSeen = await page.evaluate(() => {
      const rule = document.querySelector('.pk-rule');
      const eyebrow = document.querySelector('.pk-eyebrow');
      const num = document.querySelector('.pk-opener-num');
      return {
        rule: rule && getComputedStyle(rule).borderTopColor,
        heading: eyebrow && getComputedStyle(eyebrow).color,
        numeral: num && getComputedStyle(num).color,
      };
    });
    const EXPECT = 'rgb(138, 31, 75)';
    if (accentSeen.rule !== EXPECT) note(`the rule under the headings is ${accentSeen.rule}, not their accent`);
    else ok(`their accent is the computed colour of the rule (${accentSeen.rule})`);
    if (accentSeen.heading !== EXPECT) note(`the eyebrow is ${accentSeen.heading}, not their accent`);
    else ok('and of the eyebrow above each title');
    if (accentSeen.numeral !== EXPECT) note(`the section numeral is ${accentSeen.numeral}, not their accent`);
    else ok('and of the oversized section numeral');

    /* ── 6. nothing of the portal's is in it ────────────────────────────── */
    const images = await page.evaluate(() => [...document.querySelectorAll('.pk-pages img')].map((i) => i.getAttribute('src') ?? ''));
    const foreign = images.filter((s) => !s.startsWith('data:image/'));
    if (foreign.length) note(`the pack holds ${foreign.length} image(s) that are not ours: ${foreign[0].slice(0, 70)}`);
    else ok(`every image in the pack is ours (${images.length} of them, all data URIs)`);

    const portal = requested.slice(before).filter((u) => /rightmove|zoopla|zoocdn/i.test(u));
    if (portal.length) note(`building the pack fetched from a portal: ${portal[0].slice(0, 80)}`);
    else ok('building the pack fetched nothing from a portal');

    /* ── 7. no opinion of ours is in it ─────────────────────────────────── */
    const packText = (await page.locator('.pk-pages').innerText()).replace(/\s+/g, ' ');
    if (/deal score/i.test(packText)) note('the pack prints the words "Deal Score"');
    else ok('the pack never says "Deal Score"');
    if (score && new RegExp(`\\b${score}\\s*/\\s*10\\b`).test(packText)) note(`the pack prints the score ${score}/10`);
    else ok('the pack prints no score out of ten');
    if (verdictLine && packText.includes(verdictLine)) note('the pack prints the board’s verdict line');
    else ok('the pack prints no verdict line');

    /* ── 8. the locked sections really are on the page ──────────────────── */
    // Case-insensitive: the eyebrows above the locked blocks are set in small
    // caps, and innerText reports what is on the page, not what is in the source.
    const said = packText.toLowerCase();
    for (const phrase of [
      'where these figures came from', 'who prepared this', 'terms',
      DECLARATION.hmrcAml, DECLARATION.redressNumber, DECLARATION.ico,
      'information only', 'not financial, investment, tax or legal advice',
    ]) {
      if (!said.includes(phrase.toLowerCase())) note(`the pack never says "${phrase}"`);
    }
    ok('the basis, the registrations and the disclaimer are all in the document');

    const feet = await page.locator('.pk-foot-disclaimer').count();
    if (feet !== count) note(`the short disclaimer is on ${feet} sheets, not all ${count}`);
    else ok(`the short disclaimer is at the foot of all ${count}`);

    /* ── 9. page by page, and then printed ──────────────────────────────── */
    for (let i = 0; i < count; i += 1) {
      await sheets.nth(i).screenshot({ path: join(SHOTS, `page-${i + 1}.png`) });
    }
    ok(`every page photographed into ${SHOTS}`);

    /* ── NOTHING PRINTS OVER ITS OWN FOOTER ─────────────────────────────── */
    /**
     * THE FAULT THIS CATCHES HAS NOW HAPPENED TWICE.
     *
     * DP2: the area page carried three ideas and the third printed across the
     * disclaimer. DP3: giving every comparable a bar made each row taller, and
     * the sixth row — the subject property, the whole point of the page — came
     * down on top of the footer by 17px.
     *
     * Both were found by eye, which is not a method. This measures the deepest
     * rendered descendant in each page body against the top of that page's own
     * footer, so a change to type, spacing or row height that costs a page its
     * last line fails here instead of reaching an investor.
     */
    const bleeds = await page.evaluate(() => [...document.querySelectorAll('.pk-page')].map((pg, i) => {
      const body = pg.querySelector('.pk-page-body');
      const foot = pg.querySelector('.pk-foot');
      if (body === null || foot === null) return null;
      let deepest = body.getBoundingClientRect().top;
      for (const el of body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.bottom > deepest) deepest = r.bottom;
      }
      return { page: i + 1, over: +(deepest - foot.getBoundingClientRect().top).toFixed(1) };
    }).filter((x) => x !== null));
    const bleeding = bleeds.filter((b) => b.over > 0);
    if (bleeding.length > 0) throw new Error(`content prints over the footer on page(s) ${bleeding.map((b) => `${b.page} (+${b.over}px)`).join(', ')}`);
    ok(`no page prints over its own footer (tightest ${Math.max(...bleeds.map((b) => b.over)).toFixed(1)}px clear)`);

    /* ── NO PAGE IS BLANK ───────────────────────────────────────────────── */
    const thin = await page.evaluate(() => [...document.querySelectorAll('.pk-page')]
      .map((pg, i) => ({ page: i + 1, chars: (pg.innerText || '').replace(/\s+/g, ' ').trim().length }))
      .filter((p) => p.chars < 120));
    if (thin.length > 0) throw new Error(`near-empty page(s): ${thin.map((t) => `${t.page} (${t.chars} chars)`).join(', ')}`);
    ok('every page in the pack has content on it');

    /* ── the export: SHARING, not printing ──────────────────────────────── */
    /**
     * DP3 turned the export around. It was `window.print()` plus twelve words
     * telling the user how to drive their browser's print box; nobody prints a
     * deal pack. The primary action is now Share, which hands ONE self-contained
     * .html file to the phone's own share sheet — the only £0 route to WhatsApp
     * for a file, given the app may never send email.
     *
     * The share sheet itself is the operating system's and cannot be driven
     * from here, so what is measured is the half that is ours: that the file is
     * actually built, that it carries its own stylesheet, fonts and images, and
     * that it opens with no network. Print remains, demoted to a text link.
     */
    for (const [name, rx] of [['Share', /^Share$/], ['Save a copy', /^Save a copy$/], ['Print', /^Print$/]]) {
      if (!await page.getByRole('button', { name: rx }).count()) throw new Error(`no ${name} control on the builder`);
    }
    ok('Share is the primary action, with Save a copy and Print beside it');

    /* The real proof: press Save a copy and catch the download. */
    const saved = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
      page.getByRole('button', { name: /^Save a copy$/ }).click(),
    ]).then(([d]) => d);
    if (saved === null) throw new Error('Save a copy produced no file');
    const savedPath = join(SHOTS, 'shared-pack.html');
    await saved.saveAs(savedPath);
    const html = readFileSync(savedPath, 'utf8');
    if (!/^pack-|\.html$/.test(saved.suggestedFilename())) note(`filename is ${saved.suggestedFilename()}`);
    ok(`Save a copy produced ${saved.suggestedFilename()} (${Math.round(html.length / 1024)}KB)`);

    if (!html.includes('.pk-page')) throw new Error('the shared file carries no stylesheet');
    ok('the shared file carries the document stylesheet');
    if (!/@font-face/.test(html)) note('the shared file embeds no fonts — it will read in the system face');
    else ok('the shared file embeds its own fonts');
    const remote = [...html.matchAll(/(?:src|href)=["'](https?:\/\/[^"']+)/gi)].map((m) => m[1]);
    if (remote.length > 0) throw new Error(`the shared file fetches from the network: ${remote.slice(0, 3).join(', ')}`);
    ok('the shared file makes no network request — it opens offline');
    if (!/viewport/.test(html)) throw new Error('the shared file has no viewport meta — it will not fit a phone');
    ok('and it carries a viewport, so it fits a phone');

    /**
     * AND IT IS ACTUALLY ON THE SCREEN. Opened OFFLINE at 390px, because both
     * halves of that matter: offline proves it is genuinely self-contained, and
     * the geometry proves it is readable.
     *
     * THE LEFT EDGE IS CHECKED BECAUSE WIDTH ALONE LIED. The first version
     * centred the sheet, which placed its left edge at -201px before the scale
     * transform was applied; scrollWidth still read 390 and the sheet still
     * measured 390 wide, while the document sat half out of frame with its
     * address clipped mid-word. A measurement that cannot see that is not a
     * measurement of "opens properly on a phone".
     */
    const reader = await browser.newContext({ viewport: { width: 390, height: 844 }, offline: true });
    const rp = await reader.newPage();
    const rFailed = [];
    rp.on('requestfailed', (r) => rFailed.push(r.url()));
    await rp.goto(`file://${savedPath}`, { waitUntil: 'load' });
    await rp.waitForTimeout(2000);
    const fit = await rp.evaluate(() => {
      const first = document.querySelector('.pk-page');
      const r = first === null ? null : first.getBoundingClientRect();
      return {
        sheets: document.querySelectorAll('.pk-page').length,
        left: r === null ? null : Math.round(r.left),
        right: r === null ? null : Math.round(r.right),
        sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
        /* A REAL PIECE OF TEXT, not <body>. The document sets its type on `.pk`,
           so measuring the body reported the browser default — "Times" — on a
           file whose headings were rendering correctly in Montserrat all along.
           A font check that reads an element with no text in it checks nothing. */
        face: (() => {
          const h = document.querySelector('.pk-cover-address, .pk-title, .pk-display');
          return h === null ? null : getComputedStyle(h).fontFamily.split(',')[0].replace(/["']/g, '');
        })(),
      };
    });
    await rp.screenshot({ path: join(SHOTS, 'shared-on-phone.png') });
    await reader.close();
    if (rFailed.length > 0) throw new Error(`the shared file tried to fetch ${rFailed.length} thing(s) offline`);
    if (fit.sheets !== count) throw new Error(`the shared file has ${fit.sheets} sheets, the builder showed ${count}`);
    if (fit.sideways) throw new Error('the shared file scrolls sideways on a phone');
    if (fit.left === null || fit.left < -1 || fit.left > 4) throw new Error(`the shared file sits at x=${fit.left} on a phone — it is off the side of the screen`);
    if (fit.right === null || fit.right < 380) throw new Error(`the shared file is only ${fit.right}px wide on a 390px phone`);
    if (fit.face === null || /^(Times|serif|-apple-system|system-ui)$/i.test(fit.face)) {
      throw new Error(`the shared file fell back to ${fit.face ?? 'no'} type — its embedded fonts did not take`);
    }
    ok(`opened offline at 390px: ${fit.sheets} sheets, flush at x=${fit.left}, ${fit.right}px wide, set in ${fit.face}`);

    /* ── it composes on a phone, and works from a keyboard ──────────────── */
    const phone = await ctx.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto(page.url(), { waitUntil: 'domcontentloaded' });
    await phone.waitForTimeout(3000);
    const over = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 2) note(`at 390px the composer scrolls sideways by ${over}px`);
    else ok('the composer composes at 390px with no sideways scroll');
    const phoneSheets = await phone.locator('.pk-page').count();
    if (phoneSheets < 3) note(`at 390px the document rendered ${phoneSheets} sheets`);
    else ok(`and still shows the document (${phoneSheets} sheets)`);
    await phone.close();

    // Every control reachable and operable without a mouse: the rail's reorder
    // buttons are the keyboard path by design rather than a drag's afterthought.
    const reachable = await page.evaluate(() => {
      const sel = '.pk-composer button, .pk-composer input, .pk-composer textarea, .pk-composer a[href]';
      const all = [...document.querySelectorAll(sel)];
      const hidden = all.filter((el) => el.tabIndex < 0 || el.getAttribute('aria-hidden') === 'true');
      const unnamed = all.filter((el) => {
        const name = (el.getAttribute('aria-label') ?? '') + (el.textContent ?? '')
          + (el.id ? (document.querySelector(`label[for="${el.id}"]`)?.textContent ?? '') : '');
        return name.trim() === '';
      });
      return { total: all.length, hidden: hidden.length, unnamed: unnamed.length };
    });
    if (reachable.hidden > 0) note(`${reachable.hidden} composer control(s) cannot be tabbed to`);
    else ok(`all ${reachable.total} composer controls are keyboard reachable`);
    if (reachable.unnamed > 0) note(`${reachable.unnamed} composer control(s) have no accessible name`);
    else ok('and every one of them has an accessible name');

    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(400);
    const printed = await page.evaluate(() => {
      const shown = (el) => el !== null && getComputedStyle(el).display !== 'none';
      return {
        sheets: [...document.querySelectorAll('.pk-page')].filter(shown).length,
        controls: shown(document.querySelector('.pk-build-bar')),
        colour: getComputedStyle(document.querySelector('.pk-rule')).borderTopColor,
        adjust: getComputedStyle(document.querySelector('.pk-page')).printColorAdjust
          || getComputedStyle(document.querySelector('.pk-page')).webkitPrintColorAdjust,
      };
    });
    if (printed.sheets !== count) note(`printing shows ${printed.sheets} sheets, not ${count}`);
    else ok(`printing still shows all ${count} sheets`);
    if (printed.controls) note('the builder’s controls would print');
    else ok('the builder’s controls do not print');
    if (printed.colour !== EXPECT) note(`printing loses their accent (${printed.colour})`);
    else ok('their accent survives print emulation');
    if (printed.adjust !== 'exact') note(`print-color-adjust computes to "${printed.adjust}", not exact`);
    else ok('print-color-adjust computes to exact');

    await page.pdf({ path: join(SHOTS, 'pack.pdf'), format: 'A4', printBackground: true });
    ok('printed to A4 PDF');
    await page.emulateMedia({ media: 'screen' });

    if (noise.length) for (const n of noise) note(n);
    else ok('no page error and no CSP refusal anywhere in the walk');

    await ctx.close();
  }
} catch (err) {
  note(`the walk stopped: ${String(err.message).slice(0, 300)}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  worker.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 600));
  if (!worker.killed) worker.kill('SIGKILL');
  rmSync(state, { recursive: true, force: true });
}

console.log(`\n=== ${fails.length === 0 ? 'THE PACK GATE PASSES' : `${fails.length} PROBLEM(S)`} ===`);
for (const f of fails) console.log(` • ${f}`);
process.exit(fails.length === 0 ? 0 : 1);
