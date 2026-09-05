/**
 * The copy length gate, measured in a REAL BROWSER (N5). copy.test.ts checks
 * the source; this checks what a person actually sees on every surface, with
 * the analysis rendered. Run it against anything:
 *   node scripts/check-copy-length.mjs [baseUrl]     — exits non-zero on a fail.
 *
 * Rule: no visible explanatory block over 30 words. Not counted: anything
 * inside a collapsed <details> (the show-the-maths home), the footer's licence
 * attributions, and the Deal Score's "what's holding it back" line, which names
 * the binding number and is exempt by CLAUDE.md's copy rules.
 */
import { chromium } from 'playwright-core';
const B = process.argv[2] ?? process.env.BASE ?? 'https://gil-bricks-app.gil-782.workers.dev';
const MAX_WORDS = 30;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const mk = async () => (await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage());
// every VISIBLE paragraph on every surface, measured in the browser
const PAGES = [
  ['/buy-to-let/analyser?postcode=SA1+6HW&price=75000&type=S&rent=650', 'btl'],
  ['/flip/analyser?postcode=SA1+6HW&price=75000&type=S&refurbCost=15000&gdv=120000', 'flip'],
  ['/brrrr/analyser?postcode=SA1+6HW&price=75000&type=S&rent=650&refurbCost=15000&arv=110000', 'brrrr'],
  ['/hmo/analyser?postcode=CF37+1HR&price=150000&type=T&roomRent=450&refurbCost=20000', 'hmo'],
  ['/area-data?pc=SA1+6HW', 'area'],
  ['/comparables?postcode=SA1+6HW', 'comps'],
  ['/deals', 'deals'],
  ['/bridging-finance', 'bridging'],
  ['/tools', 'tools'],
  ['/tools/equity', 'equity'],
  ['/tools/stamp-duty', 'stamp'],
  ['/tools/rental-yield', 'yield'],
  ['/extension', 'extension'],
  ['/start', 'start'],
  ['/account', 'account'],
  ['/', 'home'],
];
let worst = [];
for (const [path, name] of PAGES) {
  const page = await mk();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  await page.goto(B + path, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);
  const long = await page.evaluate(() => {
    const count = (t) => (t.trim().match(/[A-Za-z0-9£%.,'’·—-]+/g) || []).length;
    const out = [];
    for (const el of document.querySelectorAll('p, li, .hint, .field-hint, .state-h, .context-note, span.hint')) {
      if (el.closest('details:not([open])') || el.closest('footer') || el.closest('[hidden]')) continue;
      if (el.classList.contains('binding-note')) continue; // the verdict's own line — exempt
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const t = (el.innerText || '').trim();
      if (count(t) > 30) out.push({ words: count(t), text: t.slice(0, 90), cls: el.className.toString().slice(0, 24) });
    }
    return out;
  });
  console.log(name, long.length === 0 ? 'no visible block over 30 words' : JSON.stringify(long), 'errs', errs.length ? errs : 0);
  worst = worst.concat(long);
  await page.context().close();
}
await browser.close();
if (worst.length > 0) {
  console.log(`\nCOPY LENGTH: FAILED — ${worst.length} visible block(s) over ${MAX_WORDS} words`);
  process.exit(1);
}
console.log('\nCOPY LENGTH: ALL PASSED — nothing visible runs over 30 words');
