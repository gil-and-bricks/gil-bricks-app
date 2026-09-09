/**
 * Rendered-tile assertion + interactivity guard (S7.1). Fails if the BASEMAP
 * is absent, if first mount is blank, if repeated remounts are flaky, if the
 * WebGL context-loss fallback doesn't appear, or if the map interactions
 * (cluster split, pin popup, Details link) don't work.
 *
 * Usage: node scripts/verify-map-render.mjs [baseUrl]  — exits non-zero on failure.
 */
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'https://gil-bricks-app.gil-782.workers.dev';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PC = 'CF37%201HR';
let failed = false;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${m}`); if (!c) failed = true; };

// count basemap (protomaps-source) rendered features — the real "streets showing" signal
const basemapFeatures = (page) => page.evaluate(() => {
  const el = document.querySelector('.comp-map'); if (!el?._map) return -1;
  const map = el._map;
  // a torn-down or context-lost map has no style: report it as zero rendered
  // features so the check FAILS loudly instead of throwing and skipping the rest
  const style = typeof map.getStyle === 'function' ? map.getStyle() : null;
  if (!style?.layers) return -1;
  const ids = style.layers.filter((l) => l.source === 'protomaps').map((l) => l.id);
  return map.queryRenderedFeatures({ layers: ids }).length;
}).catch(() => -1);

const browser = await chromium.launch({ executablePath: CHROME });

for (const dev of [
  { name: 'desktop', opts: { viewport: { width: 1280, height: 1000 } } },
  { name: 'mobile-S25', opts: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36' } },
]) {
  const ctx = await browser.newContext(dev.opts);
  const page = await ctx.newPage();

  // A. FIRST mount (direct ?view=map, no pre-toggle) must show the basemap
  await page.goto(`${BASE}/comparables?postcode=${PC}&view=map`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.comp-map canvas', { timeout: 45000 });
  await page.locator('.comp-map').scrollIntoViewIfNeeded();
  await page.waitForTimeout(9000);
  const bmFirst = await basemapFeatures(page);
  ok(bmFirst > 100, `[${dev.name}] first mount basemap rendered (${bmFirst} features)`);
  const pins = await page.evaluate(() => document.querySelector('.comp-map')._map.queryRenderedFeatures({ layers: ['comp-pins', 'clusters'] }).length);
  ok(pins > 0, `[${dev.name}] pins rendered (${pins})`);

  // B. repeated remounts via List⇄Map toggle — basemap every time
  let worstRemount = Infinity;
  for (let i = 0; i < 3; i += 1) {
    await page.locator('.view-toggle button', { hasText: 'List' }).click();
    await page.waitForTimeout(400);
    await page.locator('.view-toggle button', { hasText: 'Map' }).click();
    await page.waitForSelector('.comp-map canvas', { timeout: 30000 });
    await page.waitForTimeout(7000);
    worstRemount = Math.min(worstRemount, await basemapFeatures(page));
  }
  ok(worstRemount > 100, `[${dev.name}] basemap present on every remount (worst ${worstRemount})`);

  // C. fast-toggle poison attempt then recover (auto-heal)
  for (let i = 0; i < 3; i += 1) {
    await page.locator('.view-toggle button', { hasText: 'List' }).click();
    await page.waitForTimeout(150);
    await page.locator('.view-toggle button', { hasText: 'Map' }).click();
    await page.waitForTimeout(500); // unmount mid-fetch next loop
  }
  await page.locator('.view-toggle button', { hasText: 'List' }).click();
  await page.waitForTimeout(300);
  await page.locator('.view-toggle button', { hasText: 'Map' }).click();
  await page.waitForSelector('.comp-map canvas', { timeout: 30000 });
  await page.waitForTimeout(10000);
  const bmAfterPoison = await basemapFeatures(page);
  ok(bmAfterPoison > 100, `[${dev.name}] basemap recovers after fast toggles (${bmAfterPoison})`);
  await page.locator('.comp-map').screenshot({ path: `docs/screens/map-verify-${dev.name}.png` });

  await ctx.close();
}

// D. INTERACTIVITY (desktop): cluster split on zoom, pin popup fields, Details link
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  await page.goto(`${BASE}/comparables?postcode=${PC}&view=map`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.comp-map canvas', { timeout: 45000 });
  await page.locator('.comp-map').scrollIntoViewIfNeeded();
  await page.waitForTimeout(8000);
  const singlesBefore = await page.evaluate(() => document.querySelector('.comp-map')._map.queryRenderedFeatures({ layers: ['comp-pins'] }).length);
  await page.evaluate(() => document.querySelector('.comp-map')._map.setZoom(17));
  await page.waitForTimeout(3000);
  const singlesAfter = await page.evaluate(() => document.querySelector('.comp-map')._map.queryRenderedFeatures({ layers: ['comp-pins'] }).length);
  ok(singlesAfter >= singlesBefore, `zoom-in splits clusters into individual pins (${singlesBefore} → ${singlesAfter})`);

  // reset zoom, click a real pin
  await page.evaluate(() => document.querySelector('.comp-map')._map.setZoom(14));
  await page.waitForTimeout(2500);
  const pin = await page.evaluate(() => {
    const map = document.querySelector('.comp-map')._map;
    const f = map.queryRenderedFeatures({ layers: ['comp-pins'] });
    if (!f.length) return null;
    const pt = map.project(f[0].geometry.coordinates);
    const r = map.getContainer().getBoundingClientRect();
    return { x: r.left + pt.x, y: r.top + pt.y };
  });
  ok(!!pin, 'a single pin is clickable');
  if (pin) {
    await page.mouse.click(pin.x, pin.y);
    await page.waitForTimeout(700);
    const txt = (await page.locator('.maplibregl-popup-content').textContent().catch(() => '')) ?? '';
    ok(/£[\d,]/.test(txt), `popup shows price (${txt.match(/£[\d,]+/)?.[0] ?? 'none'})`);
    ok(/(Freehold|Leasehold)/.test(txt), 'popup shows tenure');
    ok(/(Detached|Semi|Terraced|Flat|Other)/.test(txt), 'popup shows type');
    ok(/\d{4}/.test(txt), 'popup shows date');
    // C1 moved the product to metres, and replaced the per-sale page with a
    // Google search for the address. This script still asserted the OLD product
    // and had been failing since — the link check even navigated to
    // `${BASE}` + an absolute google.com URL. Repaired in C3.
    ok(!/\/sqft/.test(txt), `popup prints metres, never feet (${/£[\d,]+\/m²/.test(txt) ? 'saw £/m²' : 'no area on this sale'})`);
    const href = await page.locator('.maplibregl-popup a').getAttribute('href').catch(() => null);
    ok(
      !!href && href.startsWith('https://www.google.com/search?q='),
      `the popup link searches Google for the address (${String(href).slice(0, 60)})`,
    );
    // Deliberately NOT followed: it leaves our origin, and what we own is the URL.
  }
}

// D2 (C3). THE ZOOM CONTROLS ARE VISIBLE. MapLibre ships its glyphs as a data
// URI with fill="#333" baked in, on our dark control group. The first C3 attempt
// to recolour them lost a specificity tie and shipped a 1.53:1 control with
// every source-text test green, so this checks the PIXELS.
{
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 4 });
  const page = await ctx2.newPage();
  await page.goto(`${BASE}/comparables?postcode=${PC}&view=map`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.maplibregl-ctrl-zoom-in', { timeout: 45000 });
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon')).backgroundImage);
  ok(bg === 'none', `maplibre's own #333 glyph is overridden (background-image: ${bg.slice(0, 30)})`);

  const box = await page.locator('.maplibregl-ctrl-zoom-in').boundingBox();
  const shot = await page.screenshot({ clip: box, type: 'png' });
  const reader = await ctx2.newPage();
  await reader.setContent('<canvas id="c"></canvas>');
  const hist = await reader.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
    const c = document.getElementById('c'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    const counts = new Map();
    for (let i = 0; i < d.length; i += 4) counts.set(`${d[i]},${d[i + 1]},${d[i + 2]}`, (counts.get(`${d[i]},${d[i + 1]},${d[i + 2]}`) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, shot.toString('base64'));
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const ground = hist[0][0].split(',').map(Number);
  const glyph = hist.map(([k]) => k.split(',').map(Number)).sort((a, b) => lum(b) - lum(a))[0];
  const r = ratio(glyph, ground);
  ok(r >= 3, `the zoom glyph clears the 3:1 non-text minimum (${r.toFixed(2)}:1, glyph rgb(${glyph}) on rgb(${ground}))`);
  await ctx2.close();
}

// D3 (C3). ONE FAILED RANGE REQUEST MUST NOT KILL THE MAP. pmtiles caches a
// rejected promise for ever, so before the healing cache a single blocked
// request left the basemap at zero features at every zoom, permanently.
{
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx3.newPage();
  let blip = false;
  let blocked = 0;
  await page.route('**/*.pmtiles', async (r) => { if (blip) { blocked += 1; await r.abort('connectionfailed'); return; } await r.continue(); });
  await page.goto(`${BASE}/comparables?postcode=${PC}&view=map`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.comp-map canvas', { timeout: 45000 });
  await page.locator('.comp-map').scrollIntoViewIfNeeded();
  for (let i = 0; i < 120 && (await basemapFeatures(page)) <= 50; i += 1) await page.waitForTimeout(250);
  blip = true;
  await page.evaluate(() => document.querySelector('.comp-map')._map.setZoom(11));
  await page.waitForTimeout(4000);
  blip = false;
  await page.waitForTimeout(10000);
  await page.evaluate(() => document.querySelector('.comp-map')._map.setZoom(13));
  await page.waitForTimeout(8000);
  const back = await basemapFeatures(page);
  ok(blocked > 0, `the blip actually blocked ${blocked} range request(s)`);
  ok(back > 50, `the basemap comes back after a blocked range request (${back} features)`);
  await ctx3.close();
}

// E1. a single WebGL context loss AUTO-RECOVERS (remount heals it)
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  await page.goto(`${BASE}/comparables?postcode=${PC}&view=map`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.comp-map canvas', { timeout: 45000 });
  await page.waitForTimeout(7000);
  await page.evaluate(() => {
    const c = document.querySelector('.comp-map canvas');
    (c.getContext('webgl2') || c.getContext('webgl')).getExtension('WEBGL_lose_context')?.loseContext();
  });
  await page.waitForTimeout(26000); // watchdog(20s, C3) → auto-retry → remount renders
  const recovered = await basemapFeatures(page);
  const fellBack = await page.locator('.map-fallback').count();
  ok(recovered > 100 && fellBack === 0, `single context loss auto-recovers (basemap ${recovered}, fallback shown ${fellBack})`);
}

// E2. a PERSISTENT failure (tiles blocked) surfaces the honest fallback (never silent blank)
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  await page.route('**/ew.pmtiles', (r) => r.abort()); // basemap can never load
  await page.goto(`${BASE}/comparables?postcode=${PC}&view=map`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.comp-map', { timeout: 45000 });
  // watchdog 20s (C3) → auto-retry → watchdog 20s → fallback (~42s)
  const appeared = await page.waitForSelector('.map-fallback', { timeout: 60000 }).then(() => true, () => false);
  ok(appeared, 'a persistently blank basemap surfaces the honest fallback (never a silent blank)');
}

await browser.close();
console.log(failed ? '\nMAP VERIFY: FAILED' : '\nMAP VERIFY: ALL PASSED');
process.exit(failed ? 1 : 0);
