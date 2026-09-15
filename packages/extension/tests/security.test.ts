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
import { coreConfig } from '@gil-bricks/core/config';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { found, missing, type NormalisedListing, type SectorFile } from '@gil-bricks/core';
import { __mountForTest } from '../entrypoints/sidepanel/main.ts';

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
    document.body.innerHTML = '<main id="app"></main>';
    // Drive the REAL controller, not a hand-assembled view: the escaping has to
    // hold on the path the panel actually renders through.
    __mountForTest(listing, { sector });
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

/**
 * THE MANIFEST GATES LIVE IN output.test.ts, NOT HERE (M5).
 *
 * They used to sit in this file, reading `.output/chrome-mv3/manifest.json`
 * behind `if (manifest === null) return;` — and with no build on disk all six
 * passed in silence while asserting nothing about what ships. That guard was
 * not laziness: output.test.ts WIPES AND REBUILDS `.output` in a beforeAll, and
 * vitest runs test files in parallel, so this file was reading a directory
 * another file was deleting underneath it. The early return hid the race.
 *
 * The fix is ownership, not a bigger timeout. output.test.ts owns the build, so
 * every assertion about the built artefact now lives there and fails loudly.
 * What is left in this file asserts the SOURCE, which nothing else is racing.
 */

describe('nothing read from a listing leaves the machine undocumented', () => {
  it('the only network call is to our own app', () => {
    const calls: string[] = [];
    for (const f of SOURCES) {
      const body = readFileSync(f, 'utf8');
      for (const m of body.matchAll(/https?:\/\/[a-z0-9.-]+/gi)) calls.push(m[0]);
    }
    // OUR HOSTS, READ FROM CONFIG. This used to recognise our own app by the
    // substring 'gil-bricks-app' — the Worker's NAME, which is not the domain
    // and never was. The domain move (DM1) left the substring matching nothing.
    const OURS = [new URL(coreConfig.appBaseUrl).host, new URL(coreConfig.dataBaseUrl).host];
    const external = [...new Set(calls)].filter((u) => !OURS.some((h) => u.includes(h)) && !u.includes('localhost')
      && !u.includes('rightmove.co.uk') && !u.includes('zoopla.co.uk') && !u.includes('schema.org')
      && !u.includes('w3.org'));
    expect(external).toEqual([]);
  });
});
