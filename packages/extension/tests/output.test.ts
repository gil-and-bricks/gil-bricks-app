import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Asserts the BUILT extension matches the sprint spec: the manifest is exactly
 * right, @gil-bricks/core is bundled into the output (not fetched at runtime),
 * the fonts are self-hosted, and nothing loads from a CDN / font host / the
 * network. Builds on demand if .output is missing so `npm test` is self-contained.
 */
const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(PKG, '.output', 'chrome-mv3');
const read = (p: string) => readFileSync(join(OUT, p), 'utf8');

beforeAll(() => {
  // Always rebuild from CURRENT source into a clean output — never validate a
  // stale local .output (that would let a spec violation pass green).
  rmSync(join(PKG, '.output'), { recursive: true, force: true });
  execSync('npm run build', { cwd: PKG, stdio: 'inherit' });
  if (!existsSync(join(OUT, 'manifest.json'))) throw new Error('build produced no manifest');
}, 180_000);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('built manifest matches the spec exactly', () => {
  const m = () => JSON.parse(read('manifest.json'));

  it('is MV3, Chrome 114+, with an action + side panel + module SW', () => {
    const j = m();
    expect(j.manifest_version).toBe(3);
    expect(j.minimum_chrome_version).toBe('114');
    expect(j.action).toBeTruthy();
    expect(j.side_panel.default_path).toBe('sidepanel.html');
    expect(j.background.service_worker).toBe('background.js');
    expect(j.background.type).toBe('module');
    expect(j.content_security_policy.extension_pages).toBe(
      "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self'",
    );
    expect(j.icons).toEqual({ 16: 'icon/16.png', 48: 'icon/48.png', 128: 'icon/128.png' });
  });

  it('grants ONLY sidePanel + storage, and host access to ONLY the two portals', () => {
    const j = m();
    expect([...j.permissions].sort()).toEqual(['sidePanel', 'storage']);
    expect([...j.host_permissions].sort()).toEqual(['*://*.rightmove.co.uk/*', '*://*.zoopla.co.uk/*']);
    // explicit negatives — these must never appear
    for (const banned of ['tabs', 'cookies', 'scripting', 'webRequest', 'activeTab', '<all_urls>']) {
      expect(j.permissions, `permission ${banned}`).not.toContain(banned);
    }
    expect(JSON.stringify(j)).not.toContain('<all_urls>');
  });

  it('ships the three icon files and six self-hosted fonts', () => {
    for (const s of [16, 48, 128]) expect(existsSync(join(OUT, `icon/${s}.png`))).toBe(true);
    const fonts = readdirSync(join(OUT, 'fonts'));
    expect(fonts.filter((f) => f.endsWith('.woff2')).length).toBe(6);
  });
});

describe('shared library is bundled, not fetched', () => {
  it('inlines @gil-bricks/core scoring into the side-panel chunk', () => {
    const chunks = readdirSync(join(OUT, 'chunks')).filter((f) => f.endsWith('.js'));
    const blob = chunks.map((f) => read(join('chunks', f))).join('\n');
    // a copy string that only exists in @gil-bricks/core (E2.1 templates)
    expect(blob).toContain('makes the risk worth it');
    // and the sample headline the panel renders
    expect(blob).toContain('short of the');
  });

  it('loads its script and styles from local relative paths only', () => {
    const html = read('sidepanel.html');
    const externalSrc = /<(?:script|link)[^>]*(?:src|href)="https?:\/\//i.test(html);
    expect(externalSrc, 'sidepanel.html must not load external script/style').toBe(false);
  });
});

describe('no CDN / font / network loads in the built output', () => {
  const FONT_HOST = /fonts\.googleapis\.com|fonts\.gstatic\.com/i;
  const JS_CDN = /cdnjs|unpkg\.com|jsdelivr\.net|cdn\.jsdelivr|\bcdn\.[a-z]/i;
  // Tesseract.js (bundled OFFLINE, E9) carries its own default CDN URLs as inert
  // string literals; we override workerPath/corePath/langPath with local getURL
  // paths (asserted below) so they are NEVER fetched. Those vendor/bundle files
  // are exempt from the JS-CDN string ban — but a FONT CDN is banned everywhere.
  // Exempt ONLY the offline tesseract bundle: the vendored public/tesseract/* files
  // (by PATH) and the lazy tesseract LIBRARY chunk (by a marker — 'traineddata' /
  // 'tesseract-core' — that our own hand-written code never contains, so our app
  // chunks are NEVER exempted). E9 review: content 'tesseract' alone was too broad.
  const LIB_MARKER = /tesseract\.js|LSTM_ONLY|projectnaptha/;
  const isTesseract = (p: string, txt: string) => /(^|\/)tesseract\//i.test(p) || LIB_MARKER.test(txt);

  it('references no web-font CDN anywhere, and no JS CDN outside the offline tesseract bundle', () => {
    for (const p of walk(OUT)) {
      if (!/\.(js|css|html|json)$/.test(p)) continue;
      const txt = readFileSync(p, 'utf8');
      expect(FONT_HOST.test(txt), `web-font CDN in ${p}`).toBe(false);
      if (!isTesseract(p, txt)) expect(JS_CDN.test(txt), `JS CDN in ${p}`).toBe(false);
    }
  });

  it('our OWN app chunks are NOT exempted (no CDN marker leaks the exemption)', () => {
    // The panel/core chunk mentions tesseract paths but must contain NO JS-CDN host.
    const chunks = readdirSync(join(OUT, 'chunks')).filter((f) => f.endsWith('.js'));
    const appChunks = chunks.filter((f) => { const t = read(join('chunks', f)); return /floorPlanCard|ds-score/.test(t) && !LIB_MARKER.test(t); });
    expect(appChunks.length, 'found the app chunk(s)').toBeGreaterThan(0);
    for (const f of appChunks) expect(JS_CDN.test(read(join('chunks', f))), `JS CDN in app chunk ${f}`).toBe(false);
  });

  it('the offline OCR overrides every tesseract path with a LOCAL bundled file', () => {
    // Proof the inert CDN defaults are never used: our code supplies all paths.
    const ocr = readFileSync(join(PKG, 'src', 'ocr.ts'), 'utf8');
    for (const key of ['workerPath', 'corePath', 'langPath']) expect(ocr, key).toContain(key);
    expect(ocr).toContain("asset('tesseract/");
    // and the files are actually shipped locally
    for (const f of ['worker.min.js', 'tesseract-core-simd-lstm.wasm', 'eng.traineddata.gz']) {
      expect(existsSync(join(OUT, 'tesseract', f)), `bundled ${f}`).toBe(true);
    }
  });

  it('@font-face uses only local /fonts/ URLs', () => {
    const css = readdirSync(join(OUT, 'assets')).filter((f) => f.endsWith('.css')).map((f) => read(join('assets', f))).join('\n');
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((mm) => mm[1].replace(/['"]/g, ''));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u.startsWith('/fonts/'), `font url ${u}`).toBe(true);
  });

  it('the only external hosts are inert reference links + our own R2 data bucket', () => {
    // core carries gov.uk / gov.wales reference links as data; the extractor
    // config is fetched from OUR public R2 bucket (not a portal, not a CDN). Any
    // other host — a portal, a tracker, a web-font CDN — would fail here.
    const isAllowed = (h: string) =>
      ['www.gov.uk', 'www.gov.wales', 'gov.uk', 'gov.wales'].includes(h) ||
      /\.r2\.dev$/.test(h) || // our R2 data bucket (config + sector data)
      /\.workers\.dev$/.test(h) || // our own web app (Send-to-analyser handoff target)
      h === 'rolldown.rs'; // the bundler's inert banner comment (never fetched)
    const hosts = new Set<string>();
    for (const p of walk(OUT)) {
      if (!/\.(js|css|html)$/.test(p)) continue;
      const txt = readFileSync(p, 'utf8');
      if (isTesseract(p, txt)) continue; // inert offline-OCR defaults, overridden (asserted above)
      for (const mm of txt.matchAll(/https?:\/\/([a-z0-9._-]+)/gi)) hosts.add(mm[1].toLowerCase());
    }
    const unexpected = [...hosts].filter((h) => !isAllowed(h));
    expect(unexpected, `unexpected external hosts: ${unexpected.join(', ')}`).toEqual([]);
  });

  it('makes no request to a portal host (no rightmove/zoopla URL literals)', () => {
    for (const p of walk(OUT)) {
      if (!/\.(js)$/.test(p)) continue;
      const txt = readFileSync(p, 'utf8');
      expect(/https?:\/\/[^"'`]*rightmove\.co\.uk/i.test(txt), `portal URL literal in ${p}`).toBe(false);
      expect(/https?:\/\/[^"'`]*zoopla\.co\.uk/i.test(txt), `portal URL literal in ${p}`).toBe(false);
    }
  });
});
