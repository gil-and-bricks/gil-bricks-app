/**
 * Rendered-tile assertion (S7.1 mobile blank-map regression guard).
 * Loads the comparables map at a 390px mobile viewport, screenshots the map
 * element, and asserts the pixels actually VARY — a blank map is near-uniform
 * dark ground, a rendered map has roads/labels/lime pins (high variance).
 * Also forces a WebGL context loss and asserts the honest fallback appears.
 *
 * Usage: node scripts/verify-map-render.mjs [baseUrl]
 * Exit non-zero on failure so it can gate CI.
 */
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const BASE = process.argv[2] ?? 'https://gil-bricks-app.gil-782.workers.dev';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function variance(buf) {
  const png = PNG.sync.read(buf);
  const n = png.width * png.height;
  let sum = 0;
  const lum = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const r = png.data[i * 4], g = png.data[i * 4 + 1], b = png.data[i * 4 + 2];
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += lum[i];
  }
  const mean = sum / n;
  let v = 0;
  for (let i = 0; i < n; i += 1) v += (lum[i] - mean) ** 2;
  return Math.sqrt(v / n); // stddev of luminance
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
});
const page = await ctx.newPage();
let failed = false;

await page.goto(`${BASE}/comparables?postcode=CF37%201HR&view=map`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('.comp-map canvas', { timeout: 45000 });
await page.locator('.comp-map').scrollIntoViewIfNeeded();
await page.waitForTimeout(9000);

const shot = await page.locator('.comp-map').screenshot();
const sd = variance(shot);
const RENDERED_MIN = 12; // blank dark ground is < ~3; a real basemap+pins is > 20
console.log(`map luminance stddev at 390px: ${sd.toFixed(1)} (threshold ${RENDERED_MIN})`);
if (sd < RENDERED_MIN) { console.error('FAIL: map appears blank (low pixel variance)'); failed = true; }
else console.log('PASS: map rendered real content at 390px');

// pins present
const pins = await page.evaluate(() => document.querySelector('.comp-map')._map.queryRenderedFeatures({ layers: ['comp-pins', 'clusters'] }).length);
console.log(`rendered pins/clusters: ${pins}`);
if (pins === 0) { console.error('FAIL: no pins rendered'); failed = true; }

// force a WebGL context loss → the fallback must appear (never a silent blank)
await page.evaluate(() => {
  const gl = document.querySelector('.comp-map canvas').getContext('webgl2') || document.querySelector('.comp-map canvas').getContext('webgl');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
});
await page.waitForSelector('.map-fallback', { timeout: 5000 }).then(
  () => console.log('PASS: context loss surfaces the honest fallback'),
  () => { console.error('FAIL: context loss left a silent blank map'); failed = true; },
);

await browser.close();
process.exit(failed ? 1 : 0);
