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
  const CDN_OR_FONT = /fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs|unpkg\.com|jsdelivr\.net|cdn\.jsdelivr|\bcdn\.[a-z]/i;

  it('references no CDN or web-font host anywhere', () => {
    for (const p of walk(OUT)) {
      if (!/\.(js|css|html|json)$/.test(p)) continue;
      const txt = readFileSync(p, 'utf8');
      expect(CDN_OR_FONT.test(txt), `CDN/font host in ${p}`).toBe(false);
    }
  });

  it('@font-face uses only local /fonts/ URLs', () => {
    const css = readdirSync(join(OUT, 'assets')).filter((f) => f.endsWith('.css')).map((f) => read(join('assets', f))).join('\n');
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((mm) => mm[1].replace(/['"]/g, ''));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u.startsWith('/fonts/'), `font url ${u}`).toBe(true);
  });

  it('any external URL strings are inert reference links only (no font/CDN)', () => {
    // core carries gov.uk / gov.wales reference links as data; the scaffold never
    // fetches them. Assert every external host is a benign reference host, so a
    // real CDN/tracker/font host slipping in would fail here.
    const ALLOWED = new Set(['www.gov.uk', 'www.gov.wales', 'gov.uk', 'gov.wales']);
    const hosts = new Set<string>();
    for (const p of walk(OUT)) {
      if (!/\.(js|css|html)$/.test(p)) continue;
      for (const mm of readFileSync(p, 'utf8').matchAll(/https?:\/\/([a-z0-9._-]+)/gi)) hosts.add(mm[1].toLowerCase());
    }
    const unexpected = [...hosts].filter((h) => !ALLOWED.has(h));
    expect(unexpected, `unexpected external hosts: ${unexpected.join(', ')}`).toEqual([]);
  });
});
