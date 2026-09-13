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

/**
 * A handoff exactly as the extension builds one: the listing's photographs and
 * its floor plan as ADDRESSES on the portal's own server. Both features are
 * built on the browser being allowed to render these, and both shipped with a
 * Content-Security-Policy that blocked them — which is not a crash, not a
 * console error the page can see, and invisible to every test that does not
 * load a real portal URL in a real browser. So the gate loads one.
 */
const PORTAL = {
  ph: ['https://media.rightmove.co.uk/92k/91234/1/a_max_476x358.jpeg',
       'https://media.rightmove.co.uk/92k/91234/1/b_max_476x358.jpeg'].join(' '),
  fp: 'https://media.rightmove.co.uk/92k/91234/1/flp_max_600x600.jpeg',
};
const withPortalImages = (path) =>
  `${path}&ph=${encodeURIComponent(PORTAL.ph)}&fp=${encodeURIComponent(PORTAL.fp)}`;

/** The same real deals the copy gate uses, so both gates see one product. */
const PAGES = [
  [withPortalImages('/buy-to-let/analyser?postcode=SA1+6HW&price=75000&type=S&rent=650'), 'btl'],
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
    const blocked = new Set();
    page.on('pageerror', (e) => thrown.push(String(e.message ?? e)));
    page.on('console', (m) => {
      const t = m.text();
      // A CSP refusal is its own class of fault: the page is fine, the feature
      // is simply not allowed to happen. Collected separately so it is named.
      if (/Content Security Policy/.test(t)) { blocked.add((t.match(/'(https?:\/\/[^']+)'/) ?? [])[1] ?? t.slice(0, 90)); return; }
      if (m.type() === 'error' && !/Failed to load resource/.test(t)) thrown.push(t);
    });

    await page.goto(`${B}${path}`, { waitUntil: 'load' });
    // Let the sold-price fetch settle, success or failure — the sections below
    // it render either way, and a gate that measures mid-flight measures noise.
    await page.waitForTimeout(6000);
    console.log(`${where}`);

    if (thrown.length > 0) note(where, `threw: ${thrown[0].slice(0, 160)}`);
    for (const b of [...blocked].slice(0, 3)) note(where, `blocked by our own Content-Security-Policy: ${b}`);

    /**
     * THE CAROUSEL IS WIRED TO THE PORTAL. The URLs above are synthetic, so
     * they 404 — that is the portal's answer and not a fault of ours, and the
     * carousel correctly says "That photo would not load". What must NOT happen
     * is the request never leaving the browser, which is what a CSP refusal
     * looks like and is exactly how this shipped: no photos, no floor plan
     * backdrop, and the only explanation in a console nobody reads.
     *
     * So the signal that matters is the CSP REFUSAL collected above, which is
     * emitted whether or not the URL exists, and which caught this exact fault
     * on the deployed site before it was fixed. "Would not load" on a synthetic
     * URL is not asserted, because a 404 is the portal's answer, not ours.
     */
    if (/ph=/.test(path)) {
      const wired = await page.evaluate(() => document.querySelectorAll('.rc-photo, .rc-failed').length);
      if (wired === 0) note(where, 'the photo carousel rendered no image at all');
    }

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
        // A media element is not an empty box: an <img> has no text by nature,
        // and one whose src 404s is the remote server's answer, not our layout.
        if (/^(IMG|SVG|CANVAS|VIDEO|IFRAME|INPUT|SELECT|TEXTAREA|HR|BR)$/.test(el.tagName)) continue;
        if (el.querySelector('img,svg,canvas,video,input,button,select,textarea,a')) continue;
        found.push({ tag: el.tagName, cls: (el.className ?? '').toString().slice(0, 50), w: Math.round(r.width), h: Math.round(r.height) });
      }
      // report the OUTERMOST only — a blank card full of blank children is one bug
      return found.filter((f, i) => !found.some((g, j) => j !== i && g.w >= f.w && g.h >= f.h && g !== f && found.indexOf(g) < i));
    }, MIN_EMPTY_AREA);
    for (const e of empties.slice(0, 3)) {
      note(where, `empty box ${e.w}x${e.h} <${e.tag} class="${e.cls}"> — renders nothing`);
    }

    // ---- 2b. the strip's icon, MEASURED -------------------------------------
    // It is a 16px marker in the desktop rail and must not appear in the phone's
    // horizontal strip, where it eats the width the labels need. The stylesheet
    // says so; this is the browser agreeing.
    const icon = await page.evaluate(() => {
      const el = document.querySelector('.chip-icon');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { display: cs.display, w: Math.round(el.getBoundingClientRect().width) };
    });
    if (icon === null) note(where, 'the section strip rendered no chip icon at all');
    else if (vpName === 'phone' && icon.display !== 'none') {
      note(where, `chip icon is ${icon.display} at 390px — it belongs to the desktop rail only`);
    } else if (vpName === 'desktop' && (icon.display === 'none' || icon.w !== 16)) {
      note(where, `chip icon is ${icon.display} at ${icon.w}px in the rail — expected block at 16px`);
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
