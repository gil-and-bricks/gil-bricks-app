/**
 * THE RENDER GATE — does the page actually put something on the screen?
 *
 *   node scripts/check-render.mjs [baseUrl]   — exits non-zero on a fail.
 *
 * WHY THIS EXISTS. 2,170 unit tests were green while the floor plan tool was a
 * screen-filling black rectangle with every control pushed below the fold, and
 * while a stalled fetch left two blank cards under the refurb section with no
 * words in them. Neither is a crash, so nothing threw; both are LAYOUT, which
 * nothing was looking at.
 *
 * The copy gate does open these pages in a real browser — but only at 390x844.
 * The floor plan bug was `aspect-ratio: 4/5` on a surface that is the full width
 * of its card: 487px tall on a phone and fine, 1048px tall on a desktop and
 * unusable. A gate that only ever looks at one width cannot see a fault that
 * grows with the viewport. So this one runs at BOTH.
 *
 * What it asserts, on every analyser, at both widths:
 *   1. nothing threw;
 *   2. no BIG EMPTY BOX — a bordered or filled box over 200x200 with no text,
 *      no image and no control anywhere inside it. That is the shape of every
 *      "it renders nothing" report this project has had;
 *   3. no loading placeholder is still on screen once the page has settled;
 *   4. the floor plan opens, its surface fits the viewport, and its controls
 *      are reachable without hunting below a wall of black.
 */
import { chromium } from 'playwright-core';

const B = process.argv[2] ?? process.env.BASE ?? 'https://gil-bricks-app.gil-782.workers.dev';
if (process.env.CI === 'true' && process.argv[2] === undefined && process.env.BASE === undefined) {
  console.error('check-render: refusing to measure the deployed site in CI. Pass the local base URL.');
  process.exit(2);
}
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** The same real deals the copy gate uses, so both gates see one product. */
const PAGES = [
  ['/buy-to-let/analyser?postcode=SA1+6HW&price=75000&type=S&rent=650', 'btl'],
  ['/flip/analyser?postcode=SA1+6HW&price=75000&type=S&refurbCost=15000&gdv=120000', 'flip'],
  ['/brrrr/analyser?postcode=SA1+6HW&price=75000&type=S&rent=650&refurbCost=15000&arv=110000', 'brrrr'],
  ['/hmo/analyser?postcode=SA1+6HW&price=75000&type=S&rooms=5&roomRent=450', 'hmo'],
];

/** Desktop FIRST: it is the width the floor plan fault needed to show itself. */
const VIEWPORTS = [
  ['desktop', { width: 1440, height: 900 }, false],
  ['phone', { width: 390, height: 844 }, true],
];

/** A box over this many square pixels with nothing in it is a bug, not a layout. */
const MIN_EMPTY_AREA = 200 * 200;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const fails = [];
const note = (where, msg) => { fails.push(`${where}: ${msg}`); console.log(`  ✗ ${msg}`); };

for (const [vpName, viewport, isMobile] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, deviceScaleFactor: isMobile ? 2 : 1 });
  for (const [path, name] of PAGES) {
    const where = `${name}/${vpName}`;
    const page = await ctx.newPage();
    const thrown = [];
    page.on('pageerror', (e) => thrown.push(String(e.message ?? e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) thrown.push(m.text()); });

    await page.goto(`${B}${path}`, { waitUntil: 'load' });
    // Let the sold-price fetch settle, success or failure — the sections below
    // it render either way, and a gate that measures mid-flight measures noise.
    await page.waitForTimeout(6000);
    console.log(`${where}`);

    if (thrown.length > 0) note(where, `threw: ${thrown[0].slice(0, 160)}`);

    // ---- 2. big empty boxes ------------------------------------------------
    const empties = await page.evaluate((minArea) => {
      const vis = (el) => {
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05;
      };
      const boxy = (cs) => cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0;
      const found = [];
      for (const el of document.querySelectorAll('body *')) {
        if (!vis(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width * r.height < minArea) continue;
        if (!boxy(getComputedStyle(el))) continue;
        if ((el.innerText ?? '').trim() !== '') continue;
        if (el.querySelector('img,svg,canvas,video,input,button,select,textarea,a')) continue;
        found.push({ tag: el.tagName, cls: (el.className ?? '').toString().slice(0, 50), w: Math.round(r.width), h: Math.round(r.height) });
      }
      // report the OUTERMOST only — a blank card full of blank children is one bug
      return found.filter((f, i) => !found.some((g, j) => j !== i && g.w >= f.w && g.h >= f.h && g !== f && found.indexOf(g) < i));
    }, MIN_EMPTY_AREA);
    for (const e of empties.slice(0, 3)) {
      note(where, `empty box ${e.w}x${e.h} <${e.tag} class="${e.cls}"> — renders nothing`);
    }

    // ---- 3. stuck loading placeholders -------------------------------------
    const skeletons = await page.evaluate(() => document.querySelectorAll('.skeleton').length);
    if (skeletons > 0) note(where, `${skeletons} loading placeholders still on screen after 6s`);

    // ---- 4. the floor plan tool --------------------------------------------
    const opened = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /reconfigure|draw|trace/i.test(x.textContent ?? ''));
      if (!b) return false;
      b.click();
      return true;
    });
    if (!opened) {
      note(where, 'the floor plan section never appeared — the page did not finish rendering');
    } else {
      await page.waitForTimeout(900);
      const fp = await page.evaluate(() => {
        const s = document.querySelector('.tp-surface');
        const chrome = document.querySelector('.tp-chrome');
        if (!s) return { missing: true };
        const sr = s.getBoundingClientRect();
        return {
          h: Math.round(sr.height),
          w: Math.round(sr.width),
          vh: innerHeight,
          controls: chrome ? chrome.querySelectorAll('button').length : 0,
        };
      });
      if (fp.missing) note(where, 'the tracing surface did not render after opening the floor plan');
      else {
        // The surface may not eat the screen: the controls live under it, and a
        // surface taller than the viewport is how "black screen, dead controls"
        // gets reported.
        if (fp.h > fp.vh * 0.75) note(where, `floor plan surface is ${fp.h}px tall in a ${fp.vh}px viewport — its controls are below the fold`);
        if (fp.controls < 3) note(where, `floor plan shows ${fp.controls} controls — the tool is not usable`);
      }
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();

if (fails.length > 0) {
  console.error(`\nRENDER GATE: ${fails.length} problem(s) — the page does not render what it should.`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nRENDER GATE: ALL PASSED — every analyser renders, at both widths, and the floor plan is usable.');
