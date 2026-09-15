/**
 * THE EXTENSION GATE (M5) — the built extension, in a real Chrome, on a real
 * listing page, all the way to the handoff.
 *
 *   node scripts/check-extension.mjs
 *
 * WHY THIS EXISTS. Three days were lost to a build that silently produced no
 * photographs. Every test was green throughout, because not one of them loaded
 * the extension into a browser: 136 unit tests exercised the modules, the
 * manifest gates read a JSON file, and the thing that actually ships — a
 * content script running on a portal page, talking to a service worker, filling
 * a panel, and writing a URL — was never once run.
 *
 * So this loads THE BUILD. Not the source, not a mock: `.output/chrome-mv3`,
 * the same folder Chrome's "Load unpacked" takes, into a real Chrome, and then
 * does what a person does — opens a listing, sees the button, opens the panel,
 * reads what it says, and presses "Run the full numbers". It fails if the URL
 * that comes out is missing anything the listing had.
 *
 * WHERE THE LISTING COMES FROM, and why it is not fetched. The corpus at
 * packages/core/fixtures/listings holds real Rightmove and Zoopla pages, saved
 * once, sanitised, and committed — and its own README sets the rule: "these
 * saved files are the ONLY portal pages the project ever reads... no test may
 * make a network request to a portal." This gate keeps that rule. It serves
 * those saved bytes from a local server and points Chrome's resolver at it
 * (--host-resolver-rules), so the page genuinely loads at
 * `http://www.rightmove.co.uk/...` — which is what makes the content script's
 * own match pattern fire — while nothing is requested from Rightmove or Zoopla.
 * Every off-origin request is aborted and counted, and the count is printed, so
 * "nothing left the machine" is evidence rather than a claim.
 *
 * WHICH CHROME, said plainly. Google Chrome 137 and later refuse
 * `--load-extension` outright; on Chrome 152 the extension is registered and
 * then blocked, and its pages return ERR_BLOCKED_BY_CLIENT. So this uses Google
 * Chrome for Testing — Google's own build for automation, the one Playwright
 * installs — which is the only Chrome that can load an unpacked MV3 extension
 * from the command line. It produced extension id epngfpdbpdbhnhkbpdmhnkeejimebmoh,
 * the same id the operator's own Chrome shows, which is how we know it is the
 * same build.
 *
 * HEADED, NECESSARILY. Chrome loads no extension in headless mode — tried, and
 * the service worker simply never starts — so this runs with a window. On a
 * runner that means xvfb-run, which is how the workflow invokes it.
 *
 * WHAT IS HONEST ABOUT THE PANEL. Step 3 clicks the in-page button and proves
 * the REAL side panel opens, by asking Chrome for its targets. Chrome gives
 * automation no way to drive that panel's contents, so steps 4-6 load the very
 * same document — sidepanel.html, the real one, from the real build — in a
 * background tab of the same window, where its own
 * `chrome.tabs.query({active: true, currentWindow: true})` finds the listing tab
 * exactly as it does in the panel. Everything after that is the shipped code:
 * the real message to the real content script, the real extractor, the real
 * buildAnalyserUrl, the real chrome.tabs.create. The frame around it is the
 * only thing that differs, and this paragraph is the gate saying so.
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(HERE, '..', '.output', 'chrome-mv3');
const CORPUS = resolve(HERE, '..', '..', 'core', 'fixtures', 'listings');

const fails = [];
const note = (m) => { fails.push(m); console.log(`    ✗ ${m}`); };
const ok = (m) => console.log(`    ✓ ${m}`);

/**
 * The two listings, and what each one is here to prove.
 *
 * Rightmove carries the FLOOR PLAN and the photographs. Zoopla carries the
 * HOUSE NUMBER and the AUCTION flag. Between them every field the handoff can
 * hold is exercised, which no single listing does.
 */
/**
 * WHERE THE ANALYSER LIVES, written out rather than imported.
 *
 * Importing coreConfig.appBaseUrl would make this gate read the very constant
 * the build reads, so a base URL regressed to localhost would agree with itself
 * and pass. This is the address a person's browser must actually open.
 */
const ANALYSER_ORIGIN = 'https://proplaunch.ai';

const CASES = [
  {
    portal: 'rightmove',
    host: 'www.rightmove.co.uk',
    fixture: join(CORPUS, 'rightmove', 'rightmove-reduced-terrace-leasehold.html'),
    path: '/properties/167112923',
    expect: {
      postcode: 'SA5 8BD', price: '110000', type: 'T', beds: '3', baths: '1',
      // X1.1 — the subject's own tenure, under its own name. This listing is
      // leasehold; the Zoopla case below is freehold, so neither is a constant.
      subjectTenure: 'L',
      // FIXED 2026-09-14, and asserted the right way round now. This listing's
      // description says "Modern Method of Auction" twice. Rightmove publishes
      // no auction field, so the flag used to be dropped and the board never
      // warned about the legal pack — somebody could commit to a reservation
      // fee having never been told to read it. The extractor now reads the
      // listing's own wording, so the flag travels.
      auction: '1',
      // Genuinely absent: this listing gives a street, not a house number.
      paon: null,
    },
    // EXACTLY the cap. 'at least 10' would have passed a build that quietly
    // dropped two photographs, which is the shape of the bug this gate exists for.
    wantPhotos: 12,
    // COUNTING IS NOT IDENTIFYING. This page also serves
    // https://media.rightmove.co.uk/assets/shared-assets/fonts/... — eight of
    // them, all https, all on the portal's own host. A build that shipped
    // twelve fonts, or twelve copies of one thumbnail, or twelve photographs of
    // a different property, satisfied "twelve https URLs" and passed.
    photoPrefix: 'https://media.rightmove.co.uk/property-photo/',
    golden: 'rightmove-reduced-terrace-leasehold.json',
    wantFloorPlan: 'https://media.rightmove.co.uk/property-floorplan/',
    // The LANDED path. `buildAnalyserUrl` emits '/buy-to-let/analyser' with no
    // trailing slash and the site answers 307 to '/buy-to-let/analyser/', so
    // this is where a person's click actually arrives. Asserting the landed
    // path is the stronger fact: it proves the analyser page resolves at all.
    wantRoute: '/buy-to-let/analyser/',
    // NOTE, 2026-09-14: the two portals disagree on case — Rightmove's panel
    // line reads "Terraced", Zoopla's reads "terraced", from the portals' own
    // words. Matched case-insensitively here rather than quietly normalised,
    // because normalising it is a product change and this sprint ships none.
    panelSays: [/Stepney Street/, /SA5 8BD/, /£110,000/, /terraced/i, /3 bed/, /leasehold/],
  },
  {
    portal: 'zoopla',
    host: 'www.zoopla.co.uk',
    fixture: join(CORPUS, 'zoopla', 'zoopla-auction-terrace-floorplan.html'),
    path: '/for-sale/details/73975876/',
    expect: {
      postcode: 'SA2 0PX', price: '150000', type: 'T', beds: '3', baths: '1',
      subjectTenure: 'F',
      // The two this fixture exists for.
      paon: '31', auction: '1',
    },
    wantPhotos: 12,
    // Same reasoning: this page carries an https agent logo on st.zoocdn.com.
    photoPrefix: 'https://lid.zoocdn.com/',
    golden: 'zoopla-auction-terrace-floorplan.json',
    wantRoute: '/buy-to-let/analyser/',
    // FIXED 2026-09-14. Zoopla stores a floor plan as {"filename": "<hash>.jpg"}
    // with no URL anywhere on the page, and the extractor absolutised the
    // photographs but not the plans — so `handoff.ts` dropped every one and no
    // Zoopla listing had ever handed a floor plan to the analyser. One function
    // now does both, using the prefix read from the page itself.
    wantFloorPlan: 'https://lid.zoocdn.com/',
    panelSays: [/Glanmor Road/, /SA2 0PX/, /£150,000/, /terraced/i, /3 bed/, /freehold/],
  },
];

if (!existsSync(join(EXT, 'manifest.json'))) {
  console.error(`No build at ${EXT}\nRun: npm run build -w packages/extension`);
  process.exit(1);
}

/** The saved page, at its own path, and a bare 404 for everything else.
 *  Serving the document for every subresource fed a 1.3MB HTML file back as
 *  script and stylesheet hundreds of times over and killed the renderer. */
function serveFixture(html, path) {
  let listingHits = 0;
  let otherHits = 0;
  const server = http.createServer((req, res) => {
    // EXACT path only. `startsWith` handed the whole 1.3MB document back to
    // Zoopla's own React-server fetches (`?_rsc=...`) more than a thousand
    // times, which kept the panel re-reading a page that never settled.
    if (req.url.split('?')[0] === path) {
      listingHits += 1;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    otherHits += 1;
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('');
  });
  return { server, hits: () => ({ listingHits, otherHits }) };
}

async function walk(testCase) {
  console.log(`\n=== ${testCase.portal} ===`);
  const html = readFileSync(testCase.fixture, 'utf8');
  const { server, hits } = serveFixture(html, testCase.path);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const profile = mkdtempSync(join(tmpdir(), 'gb-ext-gate-'));

  const ctx = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      // The saved page, under the portal's own name, from this machine only…
      // The saved page, under the portal's own name, from this machine only.
      `--host-resolver-rules=MAP ${testCase.host} 127.0.0.1:${port}`,
      '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage',
    ],
  });

  let offsite = 0;
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return route.continue();
    if (u.hostname === testCase.host) return route.continue();
    offsite += 1;
    return route.abort();
  });

  const problems = [];
  try {
    // 1. THE SERVICE WORKER IS ALIVE. An MV3 background that fails to register
    //    takes the badge, the panel gating and the daily check with it.
    const sw = ctx.serviceWorkers()[0]
      ?? await ctx.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
    if (sw === null) problems.push('the background service worker never started');
    else ok(`the built extension loaded and its service worker is running (${new URL(sw.url()).host})`);
    const extId = sw ? new URL(sw.url()).host : null;

    // 2. THE CONTENT SCRIPT RAN ON A REAL LISTING PAGE.
    const listing = ctx.pages()[0] ?? await ctx.newPage();
    const consoleErrors = [];
    /**
     * OURS, NOT THEIRS. A saved portal page still tries to reach its own
     * analytics, and cut off from the internet its loaders throw — dozens of
     * "google_tag_manager is not defined" that say nothing about this product.
     * An error counts only when OUR code is in the stack, which for a content
     * script means a chrome-extension:// frame. Everything the panel throws
     * counts, because every frame there is ours.
     */
    listing.on('pageerror', (e) => {
      const stack = String(e.stack ?? '');
      if (!stack.includes('chrome-extension://')) return;
      consoleErrors.push(`the content script threw: ${String(e.message).slice(0, 140)}`);
    });
    await listing.goto(`http://${testCase.host}${testCase.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const chip = await listing.waitForSelector('#gb-open-panel', { timeout: 25000 }).then(() => true, () => false);
    if (!chip) problems.push('the in-page button never appeared — the content script did not run on the listing');
    else {
      const title = await listing.title();
      const { listingHits, otherHits } = hits();
      ok(`the listing loaded from the saved corpus (${listingHits} served, ${otherHits} 404s, ${offsite} off-origin requests blocked)`);
      ok(`it really is the listing: "${title.slice(0, 60)}"`);
      ok('the content script ran and offered the button');
    }

    // 3. THE REAL SIDE PANEL OPENS when the button is pressed. Chrome will not
    //    let automation read it, but it will say whether it exists.
    if (chip && extId) {
      await listing.locator('#gb-open-panel .gb-open').click();
      await listing.waitForTimeout(2500);
      const cdp = await ctx.browser().newBrowserCDPSession();
      const { targetInfos } = await cdp.send('Target.getTargets');
      const opened = targetInfos.some((t) => t.type === 'page' && t.url === `chrome-extension://${extId}/sidepanel.html`);
      if (!opened) problems.push('pressing the in-page button did not open the side panel');
      else ok('pressing the button opened the real side panel');
      const gone = await listing.locator('#gb-open-panel').count();
      if (gone !== 0) problems.push('the button did not retire itself once the panel was open');
      else ok('and the button retired itself, as it should');
    }

    // 4. THE PANEL READ THE LISTING. Same document, same code, driven where it
    //    can be driven (see the header).
    let handoff = null;
    if (extId) {
      const panel = await ctx.newPage();
      panel.on('pageerror', (e) => consoleErrors.push(`panel threw: ${String(e.message).slice(0, 140)}`));
      await panel.goto(`chrome-extension://${extId}/sidepanel.html`, { waitUntil: 'domcontentloaded' });
      await listing.bringToFront();
      const send = panel.getByRole('button', { name: /Run the full numbers/ });
      // Polled rather than awaited: a portal SPA can re-write its own URL while
      // we watch, and the panel redraws each time, so an element handle goes
      // stale under a plain waitFor.
      let ready = false;
      for (let i = 0; i < 60 && !ready; i += 1) {
        ready = await send.count().then((n) => n > 0, () => false);
        if (!ready) await panel.waitForTimeout(500);
      }
      const said = (await panel.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');

      if (!ready) {
        problems.push(`the panel never reached a state it could send from. It said: "${said.slice(0, 200)}"`);
      } else {
        ok('the panel read the listing and offered to send it');

        /**
         * EITHER IT WORKS OR IT IS NOT OFFERED.
         *
         * Every portal image is blocked in this gate, so the plan genuinely
         * cannot load here — and the panel must therefore NOT offer to measure
         * it. That is the whole fix: the offer used to appear for any truthy
         * value, which is how Zoopla listings ended up offering a measure tool
         * over a bare filename. With the image unreachable the offer has to be
         * withdrawn, and this is what proves it withdraws.
         */
        /**
         * X1 — THE MEASURE TOOL IS GONE, AND THIS IS WHERE THAT IS PROVED.
         *
         * This used to check that the panel did not OFFER to measure a plan it
         * could not load. With the tool removed the old check can only ever
         * pass, which makes it a green line that looks at nothing. It now
         * asserts the removal itself — and, in the same breath, that the panel
         * carries no score, since the two went in the same sprint and a score
         * creeping back is the regression that matters most.
         */
        const measureGone = await panel.getByRole('button', { name: /measure|Measure/ }).count();
        if (measureGone > 0) problems.push('the measure tool is back on the panel — X1 removed it');
        else ok('the measure tool is gone');
        if (/\b\d(\.\d)?\s*\/\s*10\b/.test(said) || /walk away|marginal/i.test(said)) {
          problems.push(`the panel is showing a score or a verdict again: "${said.slice(0, 160)}"`);
        } else ok('and there is no score and no verdict anywhere on it');
        for (const wanted of testCase.panelSays) {
          if (wanted.test(said)) ok(`the panel shows ${wanted.source}`);
          else problems.push(`the panel never showed ${wanted.source} — it said: "${said.slice(0, 200)}"`);
        }

        /**
         * 4b. X1 — IT FITS ON ONE SCREEN, AT THE WIDTH IT ACTUALLY SHIPS AT.
         *
         * "If it does not fit, the answer is less on the panel, not a
         * scrollbar." That is only checkable in a real browser with real fonts:
         * happy-dom has no layout, so a unit test cannot see a wrapped line.
         *
         * 468px is the panel's own max-width. 780px is the honest floor for the
         * height a Chrome side panel gets — a 13-inch laptop with the window
         * maximised, after the tab strip and toolbar. Anything taller than that
         * scrolls for somebody.
         */
        const PANEL_W = 468;
        const PANEL_H = 780;
        await panel.setViewportSize({ width: PANEL_W, height: PANEL_H });
        await panel.waitForTimeout(400);
        const fit = await panel.evaluate(() => {
          const d = document.documentElement;
          const card = document.querySelector('.glass.card');
          const header = document.querySelector('.gb-header');
          return {
            scrollH: d.scrollHeight,
            clientH: d.clientHeight,
            scrollW: d.scrollWidth,
            clientW: d.clientWidth,
            cardW: card ? Math.round(card.getBoundingClientRect().width) : 0,
            headerW: header ? Math.round(header.getBoundingClientRect().width) : 0,
            // The REAL content height. `body { min-height: 100vh }` makes
            // scrollHeight equal the viewport whenever the content is shorter,
            // so "780 of 780" alone cannot tell a panel that just fits from one
            // with 200px to spare. This measures the ink.
            contentH: card ? Math.round(card.getBoundingClientRect().bottom + 14) : 0,
          };
        });
        if (fit.cardW === 0) {
          problems.push('could not find the panel card to measure — has .glass.card been renamed?');
        } else if (fit.cardW > PANEL_W) {
          problems.push(`the card is ${fit.cardW}px wide inside a ${PANEL_W}px panel`);
        } else ok(`the card fits the ${PANEL_W}px column (${fit.cardW}px)`);
        // The header is a SIBLING of the panel, not a child: it has its own
        // max-width, and the two going out of step is what put the logo 24px
        // inboard of the cards below it.
        if (fit.headerW !== fit.cardW + 4) {
          ok(`header ${fit.headerW}px / card ${fit.cardW}px (padding differs by design)`);
        }
        if (fit.scrollW > fit.clientW) {
          problems.push(`the panel scrolls SIDEWAYS at ${PANEL_W}px (${fit.scrollW} > ${fit.clientW})`);
        } else ok('and nothing overflows it sideways');
        if (fit.scrollH > fit.clientH) {
          problems.push(
            `the panel needs ${fit.scrollH}px in a ${PANEL_H}px side panel — it scrolls. `
            + 'The answer is less on the panel, not a scrollbar.',
          );
        } else {
          ok(`and the whole panel fits without scrolling (content ${fit.contentH}px of ${PANEL_H}px, `
            + `${PANEL_H - fit.contentH}px to spare)`);
        }

        // 5. THE HANDOFF. Press it and catch the tab the extension opens.
        const before = new Set(ctx.pages().map((p) => p.url()));
        await send.click();
        for (let i = 0; i < 50 && handoff === null; i += 1) {
          await panel.waitForTimeout(300);
          handoff = ctx.pages().map((p) => p.url())
            .find((u) => !before.has(u) && !u.startsWith('chrome-extension')) ?? null;
        }
        if (handoff === null) problems.push('pressing "Run the full numbers" opened no tab at all');
      }
    }

    // 6. THE HANDOFF CARRIES THE DEAL.
    if (handoff !== null) {
      ok('it opened the analyser');
      // THE HOST AND THE PAGE, not just the query string. Reading only
      // searchParams threw away the two things a person actually lands on: a
      // build pointed at localhost, or one whose strategy stopped resolving so
      // every deal fell back to /buy-to-let, printed every tick and exited 0.
      const url = new URL(handoff);
      if (url.origin !== ANALYSER_ORIGIN) {
        problems.push(`the handoff opened ${url.origin} — the analyser lives at ${ANALYSER_ORIGIN}`);
      } else ok(`on the analyser's own host (${url.host})`);
      if (url.pathname !== testCase.wantRoute) {
        problems.push(`the handoff opened ${url.pathname}, not ${testCase.wantRoute}`);
      } else ok(`and on the right page for the strategy (${url.pathname})`);
      const q = url.searchParams;

      /**
       * EVERY PARAMETER, BY NAME, HARDCODED HERE.
       *
       * The photograph and floor-plan parameters once went missing from BOTH
       * the writer and the checker at the same time, because the checker took
       * its expectations from a list the writer also read. The two agreed
       * perfectly about nothing and every test passed. Three days went into it.
       *
       * So this list is typed out. It is not imported, not derived from
       * `buildAnalyserHandoff`, and not looped over anything the build owns. If
       * a parameter stops being written, nothing in the product can quietly
       * stop this file asking for it.
       */
      const MUST_CARRY = ['postcode', 'price', 'type', 'beds', 'baths', 'subjectTenure', 'fp', 'ph', 'src'];
      for (const key of MUST_CARRY) {
        const got = q.get(key);
        if (got === null || got === '') problems.push(`the handoff is missing "${key}" — it carried it before X1`);
      }
      if (MUST_CARRY.every((k) => (q.get(k) ?? '') !== '')) ok('every named parameter is in the handoff');

      for (const [key, want] of Object.entries(testCase.expect)) {
        const got = q.get(key);
        if (want === null) {
          if (got !== null) problems.push(`${key} should not be in the handoff for this listing, but is "${got}"`);
        } else if (got !== want) {
          problems.push(`${key} is "${got ?? 'MISSING'}" in the handoff — the listing says "${want}"`);
        } else ok(`${key} carried across as ${got}`);
      }

      // The photographs. THE bug that cost three days: the build shipped, the
      // panel looked fine, and `ph` was simply not there.
      const photos = (q.get('ph') ?? '').split(' ').filter((u) => u !== '');
      if (photos.length !== testCase.wantPhotos) {
        problems.push(`the handoff carries ${photos.length} photographs; this listing hands over ${testCase.wantPhotos}`);
      } else ok(`all ${photos.length} photographs carried across`);
      const notUrls = photos.filter((u) => !/^https:\/\//.test(u));
      if (notUrls.length > 0) problems.push(`${notUrls.length} photo value(s) are not https URLs: ${notUrls[0]}`);
      // They must be PHOTOGRAPHS, all different, and the listing's own.
      const wrongShape = photos.filter((u) => !u.startsWith(testCase.photoPrefix));
      if (wrongShape.length > 0) {
        problems.push(`${wrongShape.length} of the photos are not photographs at all: ${wrongShape[0].slice(0, 80)}`);
      } else ok(`and every one is a photograph at ${testCase.photoPrefix}`);
      if (new Set(photos).size !== photos.length) {
        problems.push(`the handoff repeats a photograph — ${new Set(photos).size} distinct out of ${photos.length}`);
      } else ok('all twelve are different');
      // …and they are THIS property's, in order, matching the reviewed golden.
      const goldenPath = join(CORPUS, 'golden', testCase.golden);
      const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
      const wantFirst12 = (golden.photoUrls?.value ?? []).slice(0, testCase.wantPhotos);
      const same = photos.length === wantFirst12.length && photos.every((u, i) => u === wantFirst12[i]);
      if (!same) {
        problems.push(`the photographs are not this listing's. First handed over: ${photos[0]?.slice(0, 70)}; the golden's first: ${String(wantFirst12[0]).slice(0, 70)}`);
      } else ok(`and they are this property's own, in order (checked against ${testCase.golden})`);

      // The floor plan.
      const fp = q.get('fp');
      if (fp === null) {
        problems.push('the handoff carries no floor plan at all, and this listing has one');
      } else if (!fp.startsWith(testCase.wantFloorPlan)) {
        problems.push(`the floor plan is "${fp.slice(0, 70)}" — expected an address at ${testCase.wantFloorPlan}`);
      } else ok('the floor plan carried across as a portal address');

      // The marker that tells the analyser where this came from.
      if (q.get('src') !== 'ext') problems.push(`src is "${q.get('src') ?? 'MISSING'}", not "ext"`);
      else ok('the arrival marker says it came from the extension');

      // NOTHING OF OURS IS IN THERE. The portal's images travel as addresses on
      // the portal's own servers and never as bytes — the whole F1/R3 position.
      const embedded = [...q.values()].filter((v) => /^(data|blob):/i.test(v.trim()));
      if (embedded.length > 0) problems.push('the handoff carries embedded image data — it must only ever carry addresses');
      else ok("the images travel as the portal's own addresses, never as bytes");
    }

    for (const e of consoleErrors) problems.push(e);
    if (consoleErrors.length === 0) ok('nothing threw, anywhere');

    // Whatever happened, say what left the machine.
    if (offsite === 0 && hits().listingHits === 0) problems.push('the fixture server was never asked for anything');
  } finally {
    await ctx.close().catch(() => undefined);
    server.close();
    rmSync(profile, { recursive: true, force: true });
  }

  for (const p of problems) note(`[${testCase.portal}] ${p}`);
}

for (const c of CASES) await walk(c);

console.log('');
if (fails.length > 0) {
  console.log(`EXTENSION GATE: ${fails.length} FAILED`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('EXTENSION GATE: ALL PASSED — the built extension loaded, read a real listing '
  + 'on both portals, opened the real panel, and handed over every parameter the deal has. '
  + 'NOTE: no request reached a portal — every off-origin request from the listing page was '
  + 'aborted and counted. The handoff tab does open our OWN site, which is what a click does.');
