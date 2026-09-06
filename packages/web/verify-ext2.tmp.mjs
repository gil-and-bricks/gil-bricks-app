/** P10 re-verification after the review fixes: the deadline is announced ONCE,
 *  the options page carries the switch, and everything else still holds. */
import { chromium } from 'playwright-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EXT = new URL('../extension/.output/chrome-mv3', import.meta.url).pathname;
const BASE = 'http://localhost:8787';
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'gb-ext2-')), {
  executablePath: process.env.CFT, headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run',
    '--disable-features=DisableLoadExtensionCommandLineSwitch', '--enable-unsafe-extension-debugging'],
});
const log = (...a) => console.log(...a);
const wake = await ctx.newPage();
await wake.goto('https://www.rightmove.co.uk/', { waitUntil: 'domcontentloaded' }).catch(() => {});
let sw = ctx.serviceWorkers()[0];
for (let i = 0; i < 30 && !sw; i++) { await wake.waitForTimeout(500); sw = ctx.serviceWorkers()[0]; }
const extId = new URL(sw.url()).host;
const inWorker = (fn) => sw.evaluate(fn);
await inWorker(() => {
  globalThis.__notes = [];
  chrome.notifications.create = (id, opts, cb) => { globalThis.__notes.push(opts); if (cb) cb(id); };
});
const notes = () => inWorker(() => globalThis.__notes.map((n) => n.message));
const badge = () => inWorker(() => chrome.action.getBadgeText({}));
const runCheck = async () => {
  await inWorker(() => chrome.storage.local.set({ 'gb:reminders': false }));
  await wake.waitForTimeout(350);
  await inWorker(() => chrome.storage.local.set({ 'gb:reminders': true }));
  await wake.waitForTimeout(1200);
};
const page = await ctx.newPage();
await page.goto(`${BASE}/auth/dev-login`, { waitUntil: 'domcontentloaded' });
await page.goto(`${BASE}/dev/seed`, { waitUntil: 'domcontentloaded' });
const set = await page.evaluate(async (b) => {
  const board = await (await fetch(`${b}/api/deals`)).json();
  const deal = board.deals.filter((d) => d.status === 'live').find((d) => d.stage === 'offer-in');
  const day = new Date(Date.now() + 20 * 3600_000).toISOString().slice(0, 10);
  await fetch(`${b}/api/deals/${deal.id}/date`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ date_key: 'chase_date', value: day }) });
  return { title: deal.title, day };
}, BASE);
log('dated:', JSON.stringify(set));

await runCheck();
log('badge:', JSON.stringify(await badge()), '| notifications:', (await notes()).length);
log('  ', JSON.stringify(await notes()));

log('\n--- the NEXT day, same uncleared date (the P10 review fix) ---');
await inWorker(() => chrome.storage.local.set({ 'gb:lastNotified': '1999-01-01' })); // pretend a day passed
await runCheck();
await inWorker(() => chrome.storage.local.set({ 'gb:lastNotified': '1999-01-02' }));
await runCheck();
log('notifications after two more days:', (await notes()).length, '(must still be 1)');
log('remembered deadlines:', JSON.stringify(await inWorker(() => chrome.storage.local.get('gb:notifiedKeys'))));

log('\n--- a DIFFERENT deadline is still worth saying ---');
const second = await page.evaluate(async (b) => {
  const board = await (await fetch(`${b}/api/deals`)).json();
  const deal = board.deals.filter((d) => d.status === 'live').find((d) => d.stage === 'nearly-there');
  const day = new Date(Date.now() + 10 * 3600_000).toISOString().slice(0, 10);
  await fetch(`${b}/api/deals/${deal.id}/date`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ date_key: 'exchange_date', value: day }) });
  return deal.title;
}, BASE);
await inWorker(() => chrome.storage.local.set({ 'gb:lastNotified': '1999-01-03' }));
await runCheck();
log('after a new deadline on', second, '→', (await notes()).length, 'notifications');
log('  ', JSON.stringify(await notes()));

log('\n--- the options page ---');
const opts = await ctx.newPage();
await opts.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'domcontentloaded' });
await opts.waitForTimeout(600);
log('page says:', (await opts.textContent('#app'))?.replace(/\s+/g, ' ').slice(0, 120));
const box = opts.locator('#reminders');
log('switch checked:', await box.isChecked(), '| label:', await opts.locator('label[for="reminders"]').textContent());
log('described by:', await opts.locator(`#${await box.getAttribute('aria-describedby')}`).textContent());
await box.focus();
log('focused:', await opts.evaluate(() => document.activeElement?.id));
await opts.keyboard.press('Space');
await opts.waitForTimeout(700);
log('after Space — checked:', await box.isChecked(), '| said:', (await opts.locator('.saved').textContent())?.trim());
log('badge now:', JSON.stringify(await badge()), '(off means silent)');
await opts.keyboard.press('Space');
await opts.waitForTimeout(900);
log('after Space again — checked:', await box.isChecked(), '| badge:', JSON.stringify(await badge()));
await opts.screenshot({ path: '/private/tmp/claude-502/-Users-gillenlighten-gil-bricks-app/ff25b48f-88b6-439d-988a-d21c817704c5/scratchpad/options.png' });
await ctx.close();
