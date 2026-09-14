/**
 * EVERY INPUT MUST DO SOMETHING (M4).
 *
 *   node scripts/check-inputs.mjs [baseUrl]
 *
 * WHY THIS EXISTS. A "Refurb needed: None / Light / Moderate / Heavy" dropdown
 * shipped and sat on the page for weeks converting to nothing at all. Every
 * test passed, because every test checked that the dropdown RENDERED and that
 * its options were right. None asserted that choosing one changed a number.
 *
 * So this changes each input in turn and looks at the page. If the page is
 * byte-identical afterwards, the input is either dead or hiding its effect, and
 * either way a person turning that dial and seeing nothing has been lied to.
 *
 * It restores each value before moving on, so one finding cannot mask the next.
 */
import { chromium } from 'playwright-core';
import { chromeArgs } from './lib/chrome.mjs';

const B = process.argv[2] ?? process.env.BASE ?? 'https://proplaunch.ai';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** A complete deal on every strategy, so a verdict exists to be moved. */
const DEAL = 'postcode=SA1+6HW&price=95000&type=T&beds=3&baths=1&area=80&paon=12'
  + '&rent=800&gdv=145000&arv=145000&refurbCost=18000&roomRent=450&rooms=5';

const PAGES = [
  ['/buy-to-let/analyser/', 'btl'],
  ['/flip/analyser/', 'flip'],
  ['/brrrr/analyser/', 'brrrr'],
  ['/hmo/analyser/', 'hmo'],
];

/**
 * Inputs whose job is NOT to move a number, with the reason. Each one is a
 * claim someone can check, not a way to make the gate quiet.
 */
const NOT_EXPECTED_TO_MOVE_NUMBERS = {
  'f-paon': 'the house number identifies the property for lookups and the saved deal',
  'f-saon': 'the flat/unit, same — it narrows a lookup, it is not an input to any sum',
  // The valuation card says this out loud: "Beds, baths, garden and parking are
  // context only." They are recorded with the deal and shown back; no sum reads
  // them. Listed here so that is a claim someone can check, not an assumption.
  'f-age': 'context only — recorded with the deal, read by no calculation',
  'f-garden': 'context only — the valuation card says so on screen',
  'f-parking': 'context only — the valuation card says so on screen',
};

/**
 * Inputs that only bite under a condition, and what to set first. Verified by
 * hand: opCostPctSelf moved HMO's ROI from 41.8% to 22.4% once management was
 * self, and is correctly inert on agent. Without the prerequisite this gate
 * would report a working input as dead, which is how a gate loses its authority.
 */
const PREREQUISITE = {
  'sf-opCostPctSelf': { id: 'sf-mgmt', value: 'self' },
  'sf-opCostPctAgent': { id: 'sf-mgmt', value: 'agent' },
};

const browser = await chromium.launch({ executablePath: CHROME, args: chromeArgs() });
const dead = [];
const moved = [];

/**
 * A FRESH PAGE FOR EVERY INPUT.
 *
 * Restoring a value in place is not enough: ticking a refurb row switches the
 * section into itemised mode and writes a total that supersedes the typed
 * figure, so every input measured AFTER it was measured in a different product.
 * That is how this gate first reported Flip's contingency as dead when a direct
 * test showed it moving the score from 7.2 to 1.7. A gate that contaminates its
 * own measurements will be argued with, and it will deserve it.
 */
const settle = async (page, path) => {
  await page.goto(`${B}${path}?${DEAL}`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => (document.querySelector('.analyser')?.innerText ?? '').length > 1200,
    { timeout: 30000 },
  ).catch(() => {});
  /**
   * OPEN THE REFURB BREAKDOWN BEFORE MEASURING ANYTHING.
   *
   * The fingerprint below is `innerText`, which by definition skips anything
   * inside a `hidden` element. The refurb breakdown is a collapsed disclosure,
   * so an input whose effect is drawn INSIDE it — the duration runway, which is
   * not repeated outside — measured as changing nothing at all, and the gate
   * reported two live fields as dead (DM1). The row tick boxes hid the problem:
   * their effect lands on the refurb TOTAL, which sits outside the disclosure.
   *
   * A gate that measures a collapsed page is measuring the wrong page.
   */
  await page.evaluate(() => {
    const toggle = document.querySelector('.refurb-toggle');
    if (toggle instanceof HTMLElement && toggle.getAttribute('aria-expanded') === 'false') toggle.click();
  });
  await page.waitForTimeout(2500);
};

for (const [path, name] of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await settle(page, path);

  const ids = await page.evaluate(() => [...document.querySelectorAll(
    '#sec-property input, #sec-property select, #sec-inputs input, #sec-inputs select, .assumptions input, .assumptions select, #sec-refurb input',
  )].filter((e) => e.id !== '' && !e.disabled).map((e) => e.id));

  for (const id of ids) {
    await settle(page, path);                    // nothing before it can colour it
    const pre = PREREQUISITE[id];
    if (pre !== undefined) {
      await page.evaluate((p) => {
        const el = document.getElementById(p.id);
        if (el === null) return;
        el.value = p.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, pre);
      await page.waitForTimeout(1200);
    }

    const result = await page.evaluate(async (elId) => {
      const fingerprint = () => (document.querySelector('.analyser')?.innerText ?? '').replace(/\s+/g, ' ');
      const el = document.getElementById(elId);
      if (el === null) return { skip: 'gone' };
      const before = fingerprint();
      const was = el.value;

      const fire = (v) => {
        if (el.tagName === 'SELECT') {
          el.value = v;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      // A TICK BOX IS TOGGLED, NOT TYPED INTO. Setting .value on a checkbox
      // changes nothing a user could ever cause, so it would report every tick
      // box in the product as dead — a false alarm that buries the real ones.
      if (el.type === 'checkbox' || el.type === 'radio') {
        const wasChecked = el.checked;
        el.checked = !wasChecked;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 1200));
        const afterTick = fingerprint();
        el.checked = wasChecked;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 900));
        return { changed: before !== afterTick, was: wasChecked ? 'ticked' : 'unticked', next: wasChecked ? 'unticked' : 'ticked' };
      }

      let next;
      if (el.tagName === 'SELECT') {
        const other = [...el.options].map((o) => o.value).find((v) => v !== was);
        if (other === undefined) return { skip: 'only one option' };
        next = other;
      } else {
        // A BIG change, not a nudge. A 1.7x step left Flip's contingency looking
        // dead because the score is shown to one decimal and 10% to 24% did not
        // move it; 10% to 40% moved 7.2 to 7.0. A gate that a rounding rule can
        // silence is a gate that will call a working input dead and be ignored.
        const n = Number(String(was).replace(/[^0-9.]/g, ''));
        next = Number.isFinite(n) && n > 0 ? String(Math.round(n * 5) + 100) : '1234';
      }
      fire(next);
      await new Promise((r) => setTimeout(r, 1200));
      const after = fingerprint();
      fire(was);                                   // put it back before the next one
      await new Promise((r) => setTimeout(r, 900));
      return { changed: before !== after, was, next };
    }, id);

    if (result.skip !== undefined) continue;
    const entry = `${name}/${id}`;
    if (result.changed) moved.push(entry);
    else dead.push({ entry, id, was: result.was, next: result.next });
  }
  await page.close();
}
await browser.close();

console.log(`\n${moved.length} inputs move the page. ${dead.length} do not.\n`);
const unexplained = dead.filter((d) => NOT_EXPECTED_TO_MOVE_NUMBERS[d.id] === undefined);
for (const d of dead) {
  const why = NOT_EXPECTED_TO_MOVE_NUMBERS[d.id];
  console.log(`  ${why === undefined ? '✗' : '·'} ${d.entry.padEnd(24)} ${d.was} → ${d.next}${why === undefined ? '' : `   (expected: ${why})`}`);
}

if (unexplained.length > 0) {
  console.error(`\nINPUT GATE: ${unexplained.length} input(s) change nothing on the page and have no reason recorded.`);
  console.error('Either they are dead, or their effect is hidden. Both are a lie to whoever turns the dial.');
  process.exit(1);
}
console.log('\nINPUT GATE: ALL PASSED — every input either moves the page or has a written reason not to.');
