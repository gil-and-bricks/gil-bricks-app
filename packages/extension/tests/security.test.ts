// @vitest-environment happy-dom
/**
 * S1 — THE EXTENSION'S SECURITY PROPERTIES.
 *
 * The panel runs beside a page the attacker may control. Rightmove and Zoopla
 * are not hostile, but a listing's TEXT is typed by whoever placed the advert,
 * and a compromised or spoofed portal page is the realistic bad day. These gates
 * hold the four things that keep that contained.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { scoreListing, smartDefaults, found, missing, type NormalisedListing, type SectorFile } from '@gil-bricks/core';
import { renderTriage, type PanelView } from '../entrypoints/sidepanel/main.ts';

/** vitest runs with cwd = packages/extension. */
const EXT = resolve(process.cwd());
const walk = (d: string): string[] => (existsSync(d) ? readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])) : []);

const SOURCES = [...walk(join(EXT, 'entrypoints')), ...walk(join(EXT, 'src'))]
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));

describe('the panel can never be injected into by a listing page', () => {
  it('nothing in the extension writes HTML from a string', () => {
    const banned = /\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write|dangerouslySetInnerHTML/;
    const offenders = SOURCES.filter((f) => banned.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(EXT, ''));
    expect(offenders).toEqual([]);
  });

  it('a listing whose ADDRESS is markup renders as text, not as an element', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const listing: NormalisedListing = {
      portal: 'rightmove', extractorVersion: 'rm-1.0.0', configVersion: 't', source: 'embedded',
      listingId: found('123'), url: found('https://www.rightmove.co.uk/properties/123'),
      postcode: found('SA1 8AJ'), outcode: found('SA1'),
      address: found({ paon: evil, street: `${evil} Road`, town: 'Swansea' }),
      askingPrice: found(170000), propertyType: found('Apartment'), tenure: found('LEASEHOLD'),
      bedrooms: found(2), bathrooms: found(2), floorAreaSqm: missing(), floorAreaSqmRange: missing(),
      floorPlanImageUrls: missing(), newBuild: found(false), listingUpdate: missing(),
      firstVisibleDate: missing(), description: found(`<script>alert(1)</script>`), isAuction: missing(),
    };
    const sector = {
      schemaVersion: 1, sector: 'SA1 8', country: 'W92000004', updatedAt: '2026-08-31T00:00:00Z', sales: [],
      stats: { count: 20, typicalPrice: 180000, typicalPpsqm: 2200, p10Price: 120000, p90Price: 230000 },
    } as SectorFile;
    const view = {
      screen: 'triage', listing, strategy: 'btl' as const, unknowns: {},
      result: scoreListing(listing, { strategy: 'btl', unknowns: {}, sector }),
      suggestions: smartDefaults('btl', listing, sector, null),
      settings: {}, criteria: {}, floorAreaSqm: null, floorAreaSource: 'none',
      floorAreaRange: null, manualAreaInput: '', usingSuggested: false,
    } as unknown as PanelView;

    document.body.innerHTML = '<main id="app"></main>';
    renderTriage(view);
    const host = document.getElementById('app') as HTMLElement;
    // The markup is present as TEXT and absent as DOM — the whole point.
    expect(host.querySelectorAll('img')).toHaveLength(0);
    expect(host.querySelectorAll('script')).toHaveLength(0);
    // The characters ARE in the HTML — escaped. That is the proof, not their
    // absence: `&lt;img` is text, `<img` would have been an element.
    expect(host.innerHTML).toContain('&lt;img');
    expect(host.innerHTML).not.toContain('<img');
    expect(host.innerHTML).not.toContain('<script');
    expect(host.textContent ?? '').toContain('<img src=x onerror=alert(1)>');
  });
});

describe('the manifest asks for the minimum that works', () => {
  const manifestPath = join(EXT, '.output/chrome-mv3/manifest.json');
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    : null;

  it('claims no permission beyond the four it uses', () => {
    if (manifest === null) return;
    expect((manifest.permissions as string[]).sort()).toEqual(['alarms', 'notifications', 'sidePanel', 'storage']);
  });

  it('and never asks for the dangerous ones', () => {
    if (manifest === null) return;
    const asked = [...(manifest.permissions as string[]), ...((manifest.host_permissions as string[]) ?? [])];
    for (const danger of ['tabs', 'scripting', 'cookies', 'webRequest', 'debugger', 'history', 'downloads', '<all_urls>', '*://*/*']) {
      expect(asked, danger).not.toContain(danger);
    }
  });

  it('reaches only the two portals and our own app', () => {
    if (manifest === null) return;
    expect((manifest.host_permissions as string[]).sort()).toEqual([
      '*://*.rightmove.co.uk/*', '*://*.zoopla.co.uk/*',
      'https://gil-bricks-app.gil-782.workers.dev/*',
    ].sort());
  });

  it('exposes nothing to a web page, and accepts no message from one', () => {
    if (manifest === null) return;
    // A web-accessible resource is loadable BY the page; externally_connectable
    // lets a page message the extension. Neither exists, so neither is a route in.
    expect(manifest.web_accessible_resources ?? null).toBeNull();
    expect(manifest.externally_connectable ?? null).toBeNull();
  });

  it('the content script stays in the isolated world', () => {
    if (manifest === null) return;
    for (const cs of manifest.content_scripts as { world?: string }[]) {
      expect(cs.world ?? 'ISOLATED').toBe('ISOLATED');
    }
  });

  it('extension pages run no inline script', () => {
    if (manifest === null) return;
    const csp = (manifest.content_security_policy as { extension_pages?: string })?.extension_pages ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });
});

describe('nothing read from a listing leaves the machine undocumented', () => {
  it('the only network call is to our own app', () => {
    const calls: string[] = [];
    for (const f of SOURCES) {
      const body = readFileSync(f, 'utf8');
      for (const m of body.matchAll(/https?:\/\/[a-z0-9.-]+/gi)) calls.push(m[0]);
    }
    const external = [...new Set(calls)].filter((u) => !u.includes('gil-bricks-app') && !u.includes('localhost')
      && !u.includes('rightmove.co.uk') && !u.includes('zoopla.co.uk') && !u.includes('schema.org')
      && !u.includes('w3.org'));
    expect(external).toEqual([]);
  });
});
