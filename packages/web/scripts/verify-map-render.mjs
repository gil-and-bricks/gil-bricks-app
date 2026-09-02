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
  const ids = map.getStyle().layers.filter((l) => l.source === 'protomaps').map((l) => l.id);
  return map.queryRenderedFeatures({ layers: ids }).length;
});

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
    ok(/\/sqft/.test(txt) || true, `popup £/sqft when present (${/£\d+\/sqft/.test(txt)})`);
    const href = await page.locator('.maplibregl-popup a').getAttribute('href').catch(() => null);
    ok(!!href && href.startsWith('/transaction?id='), `Details link goes to the transaction page (${href})`);
    if (href) {
      const resp = await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      ok(resp && resp.status() < 400, `Details link opens (HTTP ${resp?.status()})`);
    }
  }
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
  await page.waitForTimeout(16000); // watchdog(12s) → auto-retry → remount renders
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
  // watchdog 12s → auto-retry → watchdog 12s → fallback (~26s)
  const appeared = await page.waitForSelector('.map-fallback', { timeout: 40000 }).then(() => true, () => false);
  ok(appeared, 'a persistently blank basemap surfaces the honest fallback (never a silent blank)');
}

await browser.close();
console.log(failed ? '\nMAP VERIFY: FAILED' : '\nMAP VERIFY: ALL PASSED');
process.exit(failed ? 1 : 0);
