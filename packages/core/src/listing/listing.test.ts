import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractListing,
  loadExtractorConfig,
  FALLBACK_CONFIG,
  _clearConfigCache,
  postcodeToSector,
  ENGLAND_WALES_ONLY_MESSAGE,
  portalForUrl,
  type NormalisedListing,
  type Portal,
} from './index';

/**
 * Extractor + config tests (E5). Runs entirely against the committed fixture
 * corpus with the network BLOCKED — proving zero portal requests. Golden files
 * lock the normalised output; corrupted/broken fixtures exercise the fallback
 * and the honest-failure paths.
 */

// ---- hard network guard: armed before anything runs ----
let netCalls = 0;
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (() => {
    netCalls++;
    throw new Error('NETWORK BLOCKED: extraction must never hit the network');
  }) as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'listings');

// The URL the user would have open — the extractor is given this, never fetches it.
const URLS: Record<string, string> = {
  'rightmove-leasehold-flat-added.html': 'https://www.rightmove.co.uk/properties/159999001',
  'rightmove-reduced-terrace-leasehold.html': 'https://www.rightmove.co.uk/properties/167112923',
  'rightmove-reduced-detached-freehold.html': 'https://www.rightmove.co.uk/properties/88376352',
  'zoopla-auction-terrace-floorplan.html': 'https://www.zoopla.co.uk/for-sale/details/73975876/',
  'zoopla-newhome-6bed-hmo-candidate.html': 'https://www.zoopla.co.uk/for-sale/details/73981776/',
  'zoopla-newbuild-semi-floorplan.html': 'https://www.zoopla.co.uk/for-sale/details/73379642/',
};

const FIXTURES: { portal: Portal; file: string }[] = [
  { portal: 'rightmove', file: 'rightmove-leasehold-flat-added.html' },
  { portal: 'rightmove', file: 'rightmove-reduced-terrace-leasehold.html' },
  { portal: 'rightmove', file: 'rightmove-reduced-detached-freehold.html' },
  { portal: 'zoopla', file: 'zoopla-auction-terrace-floorplan.html' },
  { portal: 'zoopla', file: 'zoopla-newhome-6bed-hmo-candidate.html' },
  { portal: 'zoopla', file: 'zoopla-newbuild-semi-floorplan.html' },
];

/** Build a Document from fixture HTML — scripts are NEVER executed (we only read
 * their text). No file/CSS/JS loading, so no network. */
function docFromHtml(html: string, url: string): Document {
  const window = new Window({
    url,
    settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
  });
  window.document.write(html);
  return window.document as unknown as Document;
}

function loadDoc(portal: Portal, file: string): { doc: Document; url: string } {
  const url = URLS[file];
  const html = readFileSync(join(CORPUS, portal, file), 'utf8');
  return { doc: docFromHtml(html, url), url };
}

describe('extractors: golden output for every fixture', () => {
  it.each(FIXTURES)('$file matches its golden normalised object', ({ portal, file }) => {
    const { doc, url } = loadDoc(portal, file);
    const res = extractListing(portal, doc, FALLBACK_CONFIG, url);
    expect(res.ok, `${file} should extract`).toBe(true);
    if (!res.ok) return;
    const goldenPath = join(CORPUS, 'golden', file.replace(/\.html$/, '.json'));
    expect(existsSync(goldenPath), `golden missing: ${goldenPath}`).toBe(true);
    const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as NormalisedListing;
    expect(res.listing).toEqual(golden);
    expect(res.listing.source).toBe('embedded');
    expect(res.listing.extractorVersion).toMatch(portal === 'rightmove' ? /^rm-/ : /^zpl-/);
  });

  it('never emits a silently-null field (found⇒value, missing/unavailable⇒null)', () => {
    for (const { portal, file } of FIXTURES) {
      const { doc, url } = loadDoc(portal, file);
      const res = extractListing(portal, doc, FALLBACK_CONFIG, url);
      if (!res.ok) throw new Error(`${file} failed`);
      for (const [k, v] of Object.entries(res.listing)) {
        if (typeof v !== 'object' || v === null || !('status' in v)) continue;
        const field = v as { value: unknown; status: string };
        if (field.status === 'found') expect(field.value, `${file}.${k} found but null`).not.toBeNull();
        else expect(field.value, `${file}.${k} ${field.status} but not null`).toBeNull();
      }
    }
  });

  it('marks genuinely-absent fields missing, not guessed', () => {
    // Rightmove states no floor area in the corpus; a reduced RM listing records
    // no first-live date; Rightmove has no structured auction flag.
    const rm = loadDoc('rightmove', 'rightmove-reduced-terrace-leasehold.html');
    const r = extractListing('rightmove', rm.doc, FALLBACK_CONFIG, rm.url);
    if (!r.ok) throw new Error('rm failed');
    expect(r.listing.floorAreaSqm.status).toBe('missing');
    expect(r.listing.firstVisibleDate.status).toBe('missing');
    expect(r.listing.isAuction.status).toBe('unavailable-on-this-portal');

    // Zoopla exposes no "update reason" without a price history.
    const zp = loadDoc('zoopla', 'zoopla-newbuild-semi-floorplan.html');
    const z = extractListing('zoopla', zp.doc, FALLBACK_CONFIG, zp.url);
    if (!z.ok) throw new Error('zoopla failed');
    expect(z.listing.listingUpdate.status).toBe('missing');
  });
});

describe('honest fallback + failure', () => {
  it('falls back to the DOM (ld+json/og) when the embedded blob is corrupted', () => {
    for (const { portal, file } of FIXTURES) {
      const html = readFileSync(join(CORPUS, portal, file), 'utf8');
      // break ONLY the embedded blob; leave og/ld intact
      const broken = portal === 'rightmove'
        ? html.replace(/window\.__PAGE_MODEL/g, 'window.__DEAD_MODEL')
        : html.replace(/self\.__next_f/g, 'self.__dead_f');
      const doc = docFromHtml(broken, URLS[file]);
      const res = extractListing(portal, doc, FALLBACK_CONFIG, URLS[file]);
      expect(res.ok, `${file} should fall back, not fail`).toBe(true);
      if (res.ok) {
        expect(res.listing.source, `${file} should use DOM fallback`).toBe('dom');
        // fallback still yields the listing id + property type, marks price missing
        expect(res.listing.listingId.status).toBe('found');
        expect(res.listing.propertyType.status).toBe('found');
      }
    }
  });

  it('returns a typed honest failure when the page is fully unreadable', () => {
    for (const { portal, file } of FIXTURES) {
      let html = readFileSync(join(CORPUS, portal, file), 'utf8');
      html = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<meta[^>]*>/gi, '');
      const doc = docFromHtml(html, URLS[file]);
      const res = extractListing(portal, doc, FALLBACK_CONFIG, URLS[file]);
      expect(res.ok, `${file} should fail honestly`).toBe(false);
      if (!res.ok) {
        expect(['no-blob', 'shape-changed', 'not-a-listing']).toContain(res.reason);
        expect(res.message.length).toBeGreaterThan(10);
        expect(res.message).not.toMatch(/undefined|null|NaN/);
      }
    }
  });

  it('config-disabled portal yields a clean failure, never a throw', () => {
    const { doc, url } = loadDoc('rightmove', 'rightmove-leasehold-flat-added.html');
    const off = { ...FALLBACK_CONFIG, flags: { ...FALLBACK_CONFIG.flags, rightmoveEnabled: false } };
    const res = extractListing('rightmove', doc, off, url);
    expect(res.ok).toBe(false);
    // a swallowed throw would surface as 'unreadable' — assert it's a clean typed failure
    if (!res.ok) expect(res.reason).toBe('not-a-listing');
  });
});

describe('non-listing pages fail honestly — never a hollow or fabricated read', () => {
  const page = (head: string, url: string) => ({ doc: docFromHtml(`<!doctype html><html><head>${head}</head><body></body></html>`, url), url });

  it('a Rightmove home/search page (generic og only, no detail URL) fails', () => {
    const { doc, url } = page(
      '<meta property="og:title" content="Rightmove - UK\'s number one property website"><meta property="og:description" content="Search over a million properties for sale and to rent.">',
      'https://www.rightmove.co.uk/',
    );
    const res = extractListing('rightmove', doc, FALLBACK_CONFIG, url);
    expect(res.ok).toBe(false);
  });

  it('a Zoopla search landing (SEO title, no detail URL) fails — no fabricated address', () => {
    const { doc, url } = page(
      '<meta property="og:title" content="Property for sale in Swansea | Zoopla"><meta property="og:description" content="Find property for sale in Swansea.">',
      'https://www.zoopla.co.uk/for-sale/property/swansea/',
    );
    const res = extractListing('zoopla', doc, FALLBACK_CONFIG, url);
    expect(res.ok).toBe(false);
  });

  it('a Zoopla search page with a stray "pricing" card does NOT read a wrong price', () => {
    const push = `self.__next_f.push(${JSON.stringify([1, '3:' + JSON.stringify({ pricing: { internalValue: 999999, label: '£999,999' } })])})`;
    const { doc, url } = page(`<script>${push}</script>`, 'https://www.zoopla.co.uk/for-sale/property/swansea/');
    const res = extractListing('zoopla', doc, FALLBACK_CONFIG, url);
    expect(res.ok).toBe(false); // non-detail URL ⇒ embedded path not taken
  });

  it('Rightmove fallback address never leaks the "| Rightmove" brand suffix', () => {
    const { doc, url } = page(
      '<meta property="og:title" content="3 bedroom flat for sale in London | Rightmove"><meta property="og:description" content="A flat.">',
      'https://www.rightmove.co.uk/properties/5',
    );
    const res = extractListing('rightmove', doc, FALLBACK_CONFIG, url);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.listing.source).toBe('dom');
      expect(res.listing.address.value?.street).toBe('London');
    }
  });

  it('decodes a Zoopla model chunk even when a string value contains "])"', () => {
    // finding [1]: a literal "])" inside a string must not truncate the chunk
    const model = '4:' + JSON.stringify({
      pricing: { internalValue: 250000, label: '£250,000', isAuction: false },
      note: 'garage (rear access [plot 7])',
      listingCondition: 'new',
      counts: { numBedrooms: 3, numBathrooms: 1 },
      postalCode: 'SA1 1AA',
    });
    const push = `self.__next_f.push(${JSON.stringify([1, model])})`;
    const { doc, url } = page(`<script>${push}</script>`, 'https://www.zoopla.co.uk/for-sale/details/999/');
    const res = extractListing('zoopla', doc, FALLBACK_CONFIG, url);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.listing.source).toBe('embedded');
      expect(res.listing.askingPrice.value).toBe(250000);
      expect(res.listing.bedrooms.value).toBe(3);
    }
  });
});

describe('remote config: fallback works with the network unavailable', () => {
  it('uses the shipped fallback when the fetch fails', async () => {
    _clearConfigCache();
    const { config, source } = await loadExtractorConfig({
      fetchImpl: (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch,
    });
    expect(source).toBe('fallback');
    expect(config).toBe(FALLBACK_CONFIG);
  });

  it('uses the remote config when the fetch succeeds and validates', async () => {
    _clearConfigCache();
    const remote = { ...FALLBACK_CONFIG, configVersion: 'remote-test' };
    const { config, source } = await loadExtractorConfig({
      fetchImpl: (async () => ({ ok: true, json: async () => remote })) as unknown as typeof fetch,
    });
    expect(source).toBe('remote');
    expect(config.configVersion).toBe('remote-test');
  });

  it('falls back when the remote JSON is the wrong shape', async () => {
    _clearConfigCache();
    const { source } = await loadExtractorConfig({
      fetchImpl: (async () => ({ ok: true, json: async () => ({ nope: 1 }) })) as unknown as typeof fetch,
    });
    expect(source).toBe('fallback');
  });

  it('serves a persisted cache without any fetch', async () => {
    _clearConfigCache();
    const stored = { ...FALLBACK_CONFIG, configVersion: 'cached-test' };
    let fetched = false;
    const { config, source } = await loadExtractorConfig({
      store: { get: () => stored, set: () => {} },
      fetchImpl: (() => { fetched = true; return Promise.reject(new Error('x')); }) as unknown as typeof fetch,
    });
    expect(source).toBe('cache');
    expect(config.configVersion).toBe('cached-test');
    expect(fetched).toBe(false);
  });
});

describe('postcode → sector + England-&-Wales gate', () => {
  it('maps E&W postcodes to their sector', () => {
    expect(postcodeToSector('SA1 8AJ')).toEqual({ inEnglandWales: true, postcode: 'SA1 8AJ', outcode: 'SA1', sector: 'SA1 8' });
    expect(postcodeToSector('cf371dl')).toEqual({ inEnglandWales: true, postcode: 'CF37 1DL', outcode: 'CF37', sector: 'CF37 1' });
  });

  it('rejects Scotland / NI / Crown dependencies with the exact England-&-Wales message', () => {
    // assert the literal wording (locks the string), and that the exported
    // constant matches it — the same wording comparables/geocode uses.
    expect(ENGLAND_WALES_ONLY_MESSAGE).toBe('Sorry — this covers England & Wales only');
    for (const pc of ['EH1 1AA', 'G1 1AA', 'AB10 1AA', 'BT1 1AA', 'IM1 1AA', 'JE2 3AA']) {
      const r = postcodeToSector(pc);
      expect(r.inEnglandWales, pc).toBe(false);
      if (!r.inEnglandWales) {
        expect(r.reason).toBe('outside-england-wales');
        expect(r.message).toBe('Sorry — this covers England & Wales only');
      }
    }
  });

  it('rejects non-postcode input', () => {
    const r = postcodeToSector('not a postcode');
    expect(r.inEnglandWales).toBe(false);
    if (!r.inEnglandWales) expect(r.reason).toBe('not-a-postcode');
  });
});

describe('portalForUrl', () => {
  it('recognises the two portals and nothing else', () => {
    expect(portalForUrl('https://www.rightmove.co.uk/properties/1')).toBe('rightmove');
    expect(portalForUrl('https://zoopla.co.uk/for-sale/details/1/')).toBe('zoopla');
    expect(portalForUrl('https://rightmove.co.uk.evil.com/')).toBeNull();
    expect(portalForUrl('https://example.com/')).toBeNull();
    expect(portalForUrl(undefined)).toBeNull();
  });
});

describe('remote config artifact stays identical to the shipped fallback', () => {
  it('extractors.config.json (the R2 upload) === FALLBACK_CONFIG', () => {
    const artifact = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'extractors.config.json'), 'utf8'));
    expect(artifact).toEqual(FALLBACK_CONFIG);
  });
});

describe('no portal network calls in the whole run', () => {
  it('made zero fetch calls', () => {
    expect(netCalls).toBe(0);
  });
});
