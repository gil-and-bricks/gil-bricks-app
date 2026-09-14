/**
 * THE SIGNED-IN GATE (M5) — the half of the product nothing had ever walked.
 *
 *   npm run signed-in-gate -w packages/web
 *
 * WHY THIS EXISTS. Save a deal, reopen it from the pipeline, add a fact, watch
 * it re-score, park it, bring it back. That is half the product and not one
 * browser had ever done it. The M4 journey gate could only knock on those doors
 * and check they were locked, because production has no test account.
 *
 * ── HOW THE ACCOUNT PROBLEM WAS SOLVED, and why this way ────────────────────
 *
 * Three options were open. This one is the third.
 *
 *  1. A REAL ACCOUNT ON PRODUCTION. Sign-in is Google OAuth, so driving it
 *     means typing a real Google password into a browser under automation, and
 *     keeping that password somewhere a CI runner can read it. That is a
 *     credential I should never handle and a standing risk to a real person's
 *     Google account. Refused.
 *
 *  2. A BACK DOOR ON PRODUCTION — a token, a magic header, a test-only user.
 *     Every version of that weakens the real auth for everybody, permanently,
 *     to make a test convenient. Refused.
 *
 *  3. THE REAL WORKER, RUN LOCALLY, SIGNED IN THROUGH THE DOOR THAT ALREADY
 *     EXISTS. `/auth/dev-login` is not new and is not a hole opened for this:
 *     it has been in src/worker/dev.ts since the board was built, and it is
 *     refused twice over off this machine — it needs `env.DEV_LOGIN === 'on'`,
 *     which lives only in .dev.vars and which `wrangler deploy` never uploads,
 *     AND a localhost request host. Either failing gives a bare 404, exactly as
 *     if the route did not exist. This gate boots the real Worker with the real
 *     routes over a real D1 with the real migrations, signs in through that
 *     door, and walks the board. Nothing is added to production, and nothing
 *     about production's auth changes.
 *
 * WHAT THAT BUYS AND WHAT IT DOES NOT. It proves the CODE works — routing,
 * session, D1 schema, the board's own JavaScript, every button. It does NOT
 * prove the DEPLOYMENT works: a Cloudflare setting, a missing secret or a bad
 * migration on the remote database would not show up here. That gap is real and
 * is why step 0 exists — it asks PRODUCTION whether the dev door is shut, so
 * the one claim this design rests on is observed rather than assumed.
 *
 * ITS OWN DATABASE. `--persist-to` points at a fresh temporary directory, so
 * the gate never reads or writes the operator's own local board.
 *
 * ABOUT .dev.vars, corrected. An earlier version of this note claimed the gate
 * "does not read .dev.vars". That was wrong: `wrangler dev` loads that file by
 * itself whenever it is present, so on the operator's machine its values are in
 * the process. What IS true, and was checked rather than assumed — booting with
 * `--var DEV_LOGIN:DEFINITELY_NOT_ON` against a .dev.vars that says `on` gives a
 * 404 — is that `--var` WINS. So every credential this gate depends on is the
 * obvious fake passed on the command line, and on a runner, where no .dev.vars
 * exists, there is nothing else to load.
 */
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROD = process.env.PROD_BASE ?? 'https://gil-bricks-app.gil-782.workers.dev';
const CHROME = process.env.CHROME_PATH ?? undefined;
const PORT = Number(process.env.PORT ?? 8788);

const fails = [];
const note = (m) => { fails.push(m); console.log(`    ✗ ${m}`); };
const ok = (m) => console.log(`    ✓ ${m}`);

/**
 * ONE DEAL PER WIDTH, and not the same one twice.
 *
 * Saving is idempotent on the deal's own key, so running both widths against
 * one postcode meant the phone inherited the desktop's refurb fact and its
 * "add a refurb figure" chip had already become an evidenced one. The phone
 * then looked broken when it was simply further along. A width gets its own
 * property, so each walks a deal from the beginning.
 */
const DEALS = {
  desktop: { postcode: 'SA1 6HW', price: '95000', beds: '3', baths: '1', area: '80', paon: '12', rent: '800' },
  phone: { postcode: 'SA2 7DX', price: '99000', beds: '3', baths: '1', area: '82', paon: '14', rent: '825' },
};
const queryFor = (w) => new URLSearchParams({ ...DEALS[w], type: 'T' }).toString();
/** What the board will show for it — the line a person would look for. */
const onBoardFor = (w) => new RegExp(`Terraced · ${DEALS[w].postcode} · £${Number(DEALS[w].price).toLocaleString('en-GB')}`);

if (!existsSync(join(WEB, 'dist', 'index.html'))) {
  console.error('No build at packages/web/dist. The Worker serves the built pages.\nRun: npm run build -w packages/web');
  process.exit(1);
}

/* ── 0. THE CLAIM THIS WHOLE DESIGN RESTS ON, asked of production ───────────
 * Everything above is only acceptable if the dev door really is shut out
 * there. So ask. Not by reading dev.ts — by knocking. */
console.log('\n=== the dev door, asked of production ===');
try {
  for (const path of ['/auth/dev-login', '/dev/seed', '/dev/seed/clear', '/dev/preview']) {
    const res = await fetch(`${PROD}${path}`, { redirect: 'manual' });
    if (res.status !== 404) {
      note(`${PROD}${path} answered ${res.status}, not 404 — the dev door is OPEN in production`);
    } else ok(`${path} is a bare 404 in production`);
    const cookie = res.headers.get('set-cookie') ?? '';
    if (/session/i.test(cookie)) note(`${path} set a session cookie in production`);
  }
} catch (e) {
  note(`could not reach production to check the dev door: ${String(e.message).slice(0, 100)}`);
}

/* ── boot the real Worker over a throwaway database ─────────────────────── */
const state = mkdtempSync(join(tmpdir(), 'gb-signed-in-'));
const FAKE = [
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
    browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

    for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
      console.log(`\n=== ${name} ===`);
      const ctx = await browser.newContext({ viewport, isMobile: name === 'phone', hasTouch: name === 'phone' });
      const page = await ctx.newPage();
      page.setDefaultTimeout(20000);

      const noise = [];
      page.on('pageerror', (e) => noise.push(`threw: ${String(e.message).slice(0, 130)}`));
      page.on('console', (m) => {
        const t = m.text();
        if (/Content Security Policy/.test(t)) noise.push(`CSP refusal: ${t.slice(0, 130)}`);
        else if (m.type() === 'error' && !/Failed to load resource/.test(t)) noise.push(`console: ${t.slice(0, 130)}`);
      });

      // 1. SIGN IN.
      await page.goto(`${B}/auth/dev-login`, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(2500);
      if (!/\/deals/.test(page.url())) { note(`[${name}] signing in did not land on the board (${page.url()})`); await ctx.close(); continue; }
      ok('signed in and landed on the board');

      // 2. SAVE A DEAL from the analyser, the way a person does.
      const DEAL_QUERY = queryFor(name);
      const ON_BOARD = onBoardFor(name);
      await page.goto(`${B}/buy-to-let/analyser/?${DEAL_QUERY}`, { waitUntil: 'domcontentloaded' });
      const save = page.getByRole('button', { name: /^Save$/ }).first();
      const canSave = await save.waitFor({ timeout: 25000 }).then(() => true, () => false);
      if (!canSave) { note(`[${name}] the analyser offered no Save button`); await ctx.close(); continue; }
      await save.click();
      await page.waitForTimeout(2500);
      ok('saved the deal from the analyser');

      // 3. REOPEN IT FROM THE PIPELINE. Not the same page — a fresh load, so a
      //    deal that only ever lived in memory would not be found.
      await page.goto(`${B}/deals/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      const board = () => page.locator('body').innerText().then((t) => t.replace(/\s+/g, ' '));
      if (!ON_BOARD.test(await board())) {
        note(`[${name}] the saved deal is not on the board after a reload`);
        await ctx.close();
        continue;
      }
      ok('the deal is on the board after a full reload — it really was saved');

      // The card for OUR deal, not one of the demo rows beside it. `.deal-card`
      // is what DealBoard.tsx actually emits — found by looking at the page,
      // not by guessing at a tag name.
      const card = page.locator('.deal-card').filter({ hasText: ON_BOARD }).first();

      // 4. ADD A FACT and watch it RE-SCORE. The number before, the number
      //    after, and a failure if they are the same — the discipline the whole
      //    M4 audit was about.
      /**
       * TWO NUMBERS, not one. The deal score is rounded to one decimal and
       * blends several components, so a £45,000 refurb moves it only 7.3 → 7.2
       * — a gate watching that alone would pass on a product that had quietly
       * stopped applying the figure at all. The RETURN is the sharp signal:
       * the same fact takes it 7.2% → 2.9% and the cash needed £30,000 →
       * £75,000. Both are read, and both must move.
       */
      const readCard = async () => {
        const t = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
        // THE SCORE'S OWN ELEMENT, not the first decimal on the card. A regex
        // over the whole card would happily return the RETURN ("7.2% back on
        // the cash") when the score was missing entirely, and report a healthy
        // move between two numbers that were never the score. `.board-score` is
        // what DealBoard.tsx emits — checked, not guessed.
        const scoreText = await card.locator('.board-score strong').first().innerText().catch(() => '');
        return {
          text: t,
          score: /^\d{1,2}\.\d$/.test(scoreText.trim()) ? scoreText.trim() : null,
          roi: t.match(/([\d.]+)% back on the cash/)?.[1] ?? null,
        };
      };
      const scoreNow = async () => (await readCard()).score;
      const start = await readCard();
      const before = start.score;
      if (before === null) { note(`[${name}] no score is shown on the saved deal`); await ctx.close(); continue; }
      if (start.roi === null) note(`[${name}] the card shows no return figure at all`);
      ok(`the board scores it ${before}, on a return of ${start.roi ?? '?'}%`);

      const chip = card.locator('.ev-chip', { hasText: 'Refurb' }).first();
      if (await chip.count() === 0) { note(`[${name}] the deal offers no way to add a refurb figure`); await ctx.close(); continue; }
      // Scrolled to first: on a 390px board the chip sits below the fold, and a
      // click that never lands looks exactly like a control that does nothing.
      await chip.scrollIntoViewIfNeeded().catch(() => undefined);
      await chip.click();
      await page.waitForTimeout(1200);
      const valueBox = card.locator('input[id^="fact-value-"]').first();
      if (await valueBox.count() === 0) { note(`[${name}] the refurb chip opened no field to type in`); await ctx.close(); continue; }
      // A refurb big enough to move a £95,000 deal, and unmistakably ours.
      await valueBox.fill('45000');
      await card.getByRole('button', { name: /^Save$/ }).first().click();
      await page.waitForTimeout(2500);
      ok('added a refurb fact');

      // The product SAYS the answer changed, in words, before anything else.
      // A silent re-score would be a worse product even with the right number.
      const end = await readCard();
      if (!/THE ANSWER CHANGED/i.test(end.text)) {
        note(`[${name}] the score changed without the board saying so`);
      } else ok('the board announced that the answer changed');
      if (!end.text.includes('£45,000')) note(`[${name}] the card does not show the £45,000 that was entered`);
      else ok('and it names the figure that did it');

      if (end.score === before) {
        note(`[${name}] a £45,000 refurb left the score at ${before} — the fact changed nothing`);
      } else ok(`the score moved ${before} → ${end.score}`);
      if (end.roi === start.roi) {
        note(`[${name}] the return is still ${start.roi}% after a £45,000 refurb — the figure is not in the sum`);
      } else ok(`the return moved ${start.roi}% → ${end.roi}% — the figure really is in the sum`);
      const after = end.score;

      // Acknowledge it, the way a person clears the notice.
      const gotIt = card.getByRole('button', { name: /^Got it$/ });
      if (await gotIt.count() > 0) { await gotIt.first().click().catch(() => undefined); await page.waitForTimeout(1500); }

      // …and it survives a reload, which is the difference between a number on
      // a screen and a number in a database.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      const reloaded = await readCard();
      /**
       * THE WHOLE CARD, not just the score. Reading the score alone was not
       * enough: forcing the Worker to store `value: null` for every fact left
       * this check green, because the reloaded score comes from the deal's own
       * score column and not from the fact. The FIGURE and the RETURN are what
       * prove the fact itself survived the round trip.
       */
      if (reloaded.score !== after) note(`[${name}] the new score was ${after} but reads ${reloaded.score} after a reload`);
      else ok(`and it is still ${reloaded.score} after a reload`);
      if (!reloaded.text.includes('£45,000')) {
        note(`[${name}] after a reload the card no longer shows the £45,000 — the fact did not survive`);
      } else ok('the £45,000 is still on the card after a reload');
      if (reloaded.roi !== end.roi) {
        note(`[${name}] the return read ${end.roi}% before the reload and ${reloaded.roi}% after`);
      } else ok(`and the return is still ${reloaded.roi}%`);

      // 5. PARK IT.
      const park = card.getByRole('button', { name: /^Park$/ }).first();
      if (await park.count() === 0) { note(`[${name}] the deal offers no way to park it`); await ctx.close(); continue; }
      await park.scrollIntoViewIfNeeded().catch(() => undefined);
      await park.click();
      await page.waitForTimeout(1200);
      // Parking asks what happened, as a row of reasons — not a dropdown. Pick
      // one the way a person would; "Keep it" is the way out, so never that.
      const reason = card.getByRole('button', { name: /Numbers didn.t work/ }).first();
      if (await reason.count() === 0) {
        note(`[${name}] parking asked for a reason but offered none to give`);
        await ctx.close();
        continue;
      }
      await reason.click();
      await page.waitForTimeout(2500);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      /**
       * COUNTED, NOT SEARCHED. This first read the innerText of
       * `.board-live, main` — and `.board-live` does not exist anywhere in the
       * codebase, so it silently fell back to `main`, the whole page. It passed
       * only because the parked section happens to be COLLAPSED, which is a
       * coincidence, not a proof: the day that section renders open by default
       * the check would have started failing for no reason at all. It is the
       * very fault this sprint exists to remove, written into a new gate.
       *
       * So: count the live CARDS carrying this deal. Zero, or it is not parked.
       */
      const stillLive = await page.locator('.deal-card').filter({ hasText: ON_BOARD }).count();
      if (stillLive > 0) {
        note(`[${name}] the parked deal is still one of ${stillLive} live card(s) on the board`);
      } else ok('parked — its card left the live board');

      // 6. BRING IT BACK.
      const parkedToggle = page.locator('.board-parked-toggle').first();
      if (await parkedToggle.count() === 0) { note(`[${name}] there is no parked section to look in`); await ctx.close(); continue; }
      await parkedToggle.click();
      await page.waitForTimeout(1200);
      const parkedRow = page.locator('button', { hasText: /Bring it back/ })
        .filter({ hasText: DEALS[name].postcode }).first();
      if (await parkedRow.count() === 0) {
        note(`[${name}] the parked deal is not in "Deals you killed" either — it is nowhere`);
      } else {
        ok('it is in the parked list, where it should be');
        await parkedRow.click();
        await page.waitForTimeout(2500);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        if (!ON_BOARD.test(await board())) note(`[${name}] bringing it back did not restore it to the board`);
        else ok('brought it back, and a reload still shows it');
      }

      for (const n of noise) note(`[${name}] ${n}`);
      if (noise.length === 0) ok('nothing in the browser complained, all the way through');
      await ctx.close();
    }
  }
} finally {
  await browser?.close().catch(() => undefined);
  worker.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 800));
  worker.kill('SIGKILL');
  rmSync(state, { recursive: true, force: true });
}

console.log('');
if (fails.length > 0) {
  console.log(`SIGNED-IN GATE: ${fails.length} FAILED`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('SIGNED-IN GATE: ALL PASSED — signed in, saved a deal, reopened it from the '
  + 'pipeline, added a fact, watched it re-score, parked it and brought it back. Both widths. '
  + 'NOTE: against the real Worker running locally, not against the deployed site — the dev '
  + 'door is 404 in production, which step 0 asks rather than assumes.');
