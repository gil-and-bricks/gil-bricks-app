/** P10 web side: the calendar control by keyboard, and its accessible name. */
import { chromium } from 'playwright-core';
const B = 'http://localhost:8787';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
await page.goto(`${B}/auth/dev-login`, { waitUntil: 'domcontentloaded' });
await page.goto(`${B}/deals`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
const btn = page.locator('.dc-cal-add').first();
console.log('accessible name:', await btn.evaluate((el) => el.textContent.trim()));
console.log('aria name (computed):', (await btn.getAttribute('aria-label')) ?? '(from its own text + sr-only)');
const box = await btn.boundingBox();
console.log('target height:', Math.round(box.height));
// keyboard: focus it and press Enter
await btn.focus();
console.log('focused:', await page.evaluate(() => document.activeElement?.className));
const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
console.log('Enter downloaded:', dl.suggestedFilename());
console.log('said back:', (await page.locator('.dc-note').first().textContent())?.trim());
// contrast: the note and the button must not be white-on-lime
console.log('white-on-lime anywhere:', await page.evaluate(() => {
  for (const el of document.querySelectorAll('.dc-cal *, .dc-cal')) {
    const s = getComputedStyle(el);
    if (/220,\s*255,\s*0/.test(s.backgroundColor) && /255,\s*255,\s*255/.test(s.color)) return true;
  }
  return false;
}));
console.log('overflow at 390px:', await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth));
await browser.close();
