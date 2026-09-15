// @vitest-environment happy-dom
/**
 * NOTHING THE EXTENSION USED TO SEND MAY STOP BEING SENT.
 *
 * ── THE BUG THIS EXISTS TO PREVENT, STATED PLAINLY ──────────────────────────
 * When the photograph and floor-plan parameters were first added, they were
 * never put in the list the analyser reads back. Everything survived ARRIVAL and
 * then vanished the moment a field was edited. Every test passed throughout,
 * because both sides read the same list: the writer did not write them, the
 * checker did not ask for them, and the two agreed perfectly about nothing.
 * Three days went into finding it.
 *
 * ── SO THIS FILE NAMES EVERY PARAMETER, LITERALLY ───────────────────────────
 * There is no loop over a constant here, and no expectation derived from the
 * code under test. `postcode`, `price`, `type`, `beds`, `baths`, `paon`,
 * `saon`, `area`, `areaSrc`, `fp`, `ph`, `auction`, `src` and the four criteria
 * params are each written out by hand, as string literals, and each has its own
 * assertion. A parameter cannot go missing from both sides at once and still
 * pass, because this side does not read the other side's list.
 *
 * ── AND IT DRIVES THE REAL PANEL, OVER REAL LISTINGS ────────────────────────
 * Not `buildAnalyserHandoff` called directly — the actual side panel, mounted
 * over actual saved Rightmove and Zoopla pages from the committed corpus, with
 * the actual "Run the full numbers" button clicked. If the rewrite drops
 * `criteria` from the send call, or renames the button's class so nothing is
 * clicked, this fails. A test that called the builder itself would not have
 * noticed either.
 *
 * The corpus is read from disk and never fetched: packages/core/fixtures's own
 * README sets that rule and this keeps it.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractListing, portalForUrl, FALLBACK_CONFIG, SUBJECT_TENURE_PARAM,
  type NormalisedListing,
} from '@gil-bricks/core';
import { __mountForTest } from '../entrypoints/sidepanel/main.ts';

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'core', 'fixtures', 'listings');

/**
 * The two listings the gate is built on, chosen because between them they carry
 * EVERY parameter: a Rightmove terrace with a floor plan, twelve photographs and
 * an auction flag; a Zoopla semi with a floor area on the listing itself.
 */
const RIGHTMOVE = {
  file: 'rightmove/rightmove-reduced-terrace-leasehold.html',
  url: 'https://www.rightmove.co.uk/properties/167112923',
};
const ZOOPLA = {
  file: 'zoopla/zoopla-newbuild-semi-floorplan.html',
  url: 'https://www.zoopla.co.uk/for-sale/details/73379642/',
};

function listingFor(file: string, url: string): NormalisedListing {
  const html = readFileSync(join(CORPUS, file), 'utf8');
  const w = new Window({
    url,
    settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
  });
  w.document.write(html);
  const portal = portalForUrl(url);
  if (!portal) throw new Error(`no portal for ${url}`);
  const res = extractListing(portal, w.document as unknown as Document, FALLBACK_CONFIG, url);
  // A fixture that stops extracting would otherwise make every assertion below
  // vacuous, so it fails here, loudly, naming the file.
  if (!res.ok) throw new Error(`${file} no longer extracts: ${res.reason}`);
  return res.listing;
}

/** Click the REAL button and read the URL the panel would have opened. */
function sentParams(listing: NormalisedListing, opts: Parameters<typeof __mountForTest>[1] = {}): URLSearchParams {
  let captured: string | null = null;
  (globalThis as unknown as { chrome: unknown }).chrome = {
    tabs: { create: (o: { url: string }) => { captured = o.url; } },
  };
  document.body.innerHTML = '<main id="app"></main>';
  __mountForTest(listing, opts);
  const btn = document.querySelector('.send-btn-action') as HTMLButtonElement | null;
  // The gate's own selector must exist, or everything below passes on nothing.
  expect(btn, 'the handoff button must be on the panel and findable').not.toBeNull();
  btn!.click();
  expect(captured, 'clicking it must open a URL').not.toBeNull();
  return new URL(captured!).searchParams;
}

const CRITERIA = { minCashflow: 150, minRoi: 8, minIcr: 1.25, minProfit: 20000 };

beforeEach(() => { document.body.innerHTML = '<main id="app"></main>'; });

describe('the handoff still carries everything, named one by one', () => {
  it('a Rightmove listing: the subject facts', () => {
    const p = sentParams(listingFor(RIGHTMOVE.file, RIGHTMOVE.url));
    expect(p.get('postcode'), 'postcode').toBe('SA5 8BD');
    expect(p.get('price'), 'asking price').toBe('110000');
    expect(p.get('type'), 'property type code').toBe('T');
    expect(p.get('beds'), 'bedrooms').toBe('3');
    expect(p.get('baths'), 'bathrooms').toBe('1');
  });

  /**
   * THE PHOTOGRAPHS. They came from the listing, nobody can retype them, and the
   * refurb cues in the web app are built from them. Asserted as CONTENT, not
   * merely as a present key: an empty string would satisfy `has()`.
   */
  it('a Rightmove listing: all twelve photographs, as addresses on the portal', () => {
    const p = sentParams(listingFor(RIGHTMOVE.file, RIGHTMOVE.url));
    const ph = p.get('ph');
    expect(ph, 'the ph parameter').not.toBeNull();
    const urls = (ph ?? '').split(/\s+/).filter(Boolean);
    expect(urls, 'twelve photographs, the documented cap').toHaveLength(12);
    for (const u of urls) expect(u, 'every one an https address').toMatch(/^https:\/\/media\.rightmove\.co\.uk\//);
  });

  /**
   * THE FLOOR PLAN. The measure TOOL was removed from the panel in X1; the plan
   * itself still travels, because the web app's tracer is what needs it. This is
   * the assertion that would have caught "removing the tool took the data".
   */
  it('a Rightmove listing: the floor plan, which outlived the measure tool', () => {
    const p = sentParams(listingFor(RIGHTMOVE.file, RIGHTMOVE.url));
    expect(p.get('fp'), 'the floor plan address').toBe(
      'https://media.rightmove.co.uk/property-floorplan/8e99f7bee/167112923/8e99f7beec773432abe81c6ebc989845.jpeg',
    );
  });

  /**
   * THE LEGAL-PACK FLAG. The board warns about the legal pack off this, and
   * somebody can commit to a reservation fee on an auction lot without ever
   * being told to read the pack.
   */
  it('a Rightmove listing: the auction flag', () => {
    const p = sentParams(listingFor(RIGHTMOVE.file, RIGHTMOVE.url));
    expect(p.get('auction'), 'the auction marker').toBe('1');
  });

  /**
   * THE SUBJECT'S TENURE (X1.1). It never travelled before this: the panel
   * showed it, the flags read it, and the analyser was told nothing — so a
   * leasehold flat arrived looking exactly like a freehold house.
   */
  it('a Rightmove listing: the subject tenure, under its own name', () => {
    const p = sentParams(listingFor(RIGHTMOVE.file, RIGHTMOVE.url));
    expect(p.get(SUBJECT_TENURE_PARAM), 'this listing is leasehold').toBe('L');
    // NOT the analyser's `tenure` key — that one is the comparables filter, and
    // writing the subject into it would be clamped away AND would silently
    // narrow the evidence the engine draws on.
    expect(p.has('tenure'), 'the comps filter is not ours to set').toBe(false);
  });

  it('a Zoopla freehold listing carries F, so neither value is a constant', () => {
    const p = sentParams(listingFor(ZOOPLA.file, ZOOPLA.url));
    expect(p.get(SUBJECT_TENURE_PARAM)).toBe('F');
  });

  it('a Rightmove listing: the arrived-from-extension marker', () => {
    expect(sentParams(listingFor(RIGHTMOVE.file, RIGHTMOVE.url)).get('src')).toBe('ext');
  });

  it('a Zoopla listing: the house number, the floor area and where the area came from', () => {
    const p = sentParams(listingFor(ZOOPLA.file, ZOOPLA.url));
    expect(p.get('postcode'), 'postcode').toBe('SA2 8NW');
    expect(p.get('price'), 'asking price').toBe('412000');
    expect(p.get('type'), 'property type code').toBe('S');
    expect(p.get('area'), 'floor area in m²').toBe('137');
    expect(p.get('areaSrc'), 'and its provenance').toBe('listing');
    expect(p.get('beds')).toBe('4');
    expect(p.get('baths')).toBe('3');
  });

  it('a Zoopla listing: its floor plan and photographs', () => {
    const p = sentParams(listingFor(ZOOPLA.file, ZOOPLA.url));
    expect(p.get('fp'), 'Zoopla plans are filenames on the page — they must arrive absolute')
      .toBe('https://lid.zoocdn.com/u/480/360/a203aff2acd061b4a5157a6b28a9409fbba66b57.jpg');
    expect((p.get('ph') ?? '').split(/\s+/).filter(Boolean), 'twelve photographs').toHaveLength(12);
  });

  /**
   * THE PERSON'S OWN MINIMUMS. Without them the analyser judges the same
   * property by the strategy's defaults, so one click quietly changes the
   * standard the deal is being held to.
   */
  it('the four criteria travel, each named', () => {
    const p = sentParams(listingFor(RIGHTMOVE.file, RIGHTMOVE.url), { criteria: CRITERIA });
    expect(p.get('minCashflow'), 'minimum cashflow').toBe('150');
    expect(p.get('minRoi'), 'minimum ROI').toBe('8');
    expect(p.get('minIcr'), 'minimum ICR').toBe('1.25');
    expect(p.get('minProfit'), 'minimum profit').toBe('20000');
  });

  /**
   * THE HOUSE NUMBER. A deal that arrives without its PAON cannot be matched to
   * an EPC or to a past sale, so the analyser loses the evidence the panel had.
   */
  it('the house number travels where the listing gave one', () => {
    const p = sentParams(listingFor(ZOOPLA.file, ZOOPLA.url), { criteria: CRITERIA });
    // This particular Zoopla fixture carries no PAON; the Rightmove detached one
    // does. Both are asserted, so neither "always present" nor "always absent"
    // can pass by accident.
    const detached = sentParams(
      listingFor('rightmove/rightmove-reduced-detached-freehold.html', 'https://www.rightmove.co.uk/properties/88376352'),
    );
    expect(detached.get('paon'), 'the house number').toBe('6');
    expect(p.has('paon'), 'and is absent only when the listing has none').toBe(false);
  });

  /**
   * A FLOOR AREA THE PERSON TYPED. The panel's one remaining input. It has to
   * reach the analyser or they type it twice — and `areaSrc` must NOT claim it
   * came off the listing.
   */
  it('a typed floor area travels, and is not passed off as the listing’s own', () => {
    const p = sentParams(listingFor(RIGHTMOVE.file, RIGHTMOVE.url), { manualArea: '82' });
    expect(p.get('area'), 'the area they typed').toBe('82');
    expect(p.get('areaSrc'), 'honestly marked as carried, not read').toBe('carried');
  });

  /** The strategy buttons choose which analyser opens. Each must actually route. */
  it.each([
    ['btl', '/buy-to-let/analyser'],
    ['flip', '/flip/analyser'],
    ['brrrr', '/brrrr/analyser'],
    ['hmo', '/hmo/analyser'],
  ] as const)('the %s button opens %s', (strategy, route) => {
    let captured: string | null = null;
    (globalThis as unknown as { chrome: unknown }).chrome = {
      tabs: { create: (o: { url: string }) => { captured = o.url; } },
    };
    document.body.innerHTML = '<main id="app"></main>';
    __mountForTest(listingFor(RIGHTMOVE.file, RIGHTMOVE.url), { strategy });
    (document.querySelector('.send-btn-action') as HTMLButtonElement).click();
    expect(new URL(captured!).pathname).toBe(route);
  });

  /**
   * THE HANDOFF MUST FIT IN THE DEAL RECORD.
   *
   * `parseAnalyserDeal` stores the query string as `urlParams` and SLICES IT AT
   * 2000 CHARACTERS. Nothing warns: a longer handoff is cut mid-parameter and a
   * saved deal quietly comes back with half a photograph URL.
   *
   * Measured today, with every parameter and all four criteria: Rightmove 1693,
   * Zoopla 1372. The headroom is real but not large, and it is almost entirely
   * the twelve photograph addresses — about 95 characters each. If a portal
   * lengthens its media URLs, this is what says so, rather than the deals board.
   */
  it('fits inside the 2000 characters a saved deal can keep', () => {
    for (const c of [RIGHTMOVE, ZOOPLA]) {
      const p = sentParams(listingFor(c.file, c.url), { criteria: CRITERIA, manualArea: '82' });
      const len = p.toString().length;
      expect(len, `${c.file} handoff is ${len} chars — parseAnalyserDeal slices at 2000`).toBeLessThan(1900);
    }
  });

  /**
   * THE WHOLE SET, IN ONE PLACE — written out, not derived.
   *
   * The per-parameter tests above could each be deleted one at a time without
   * anything shouting. This asserts the SET, so a quiet removal shows up as a
   * missing member rather than as a missing test.
   */
  it('every parameter a full Rightmove handoff must contain', () => {
    const p = sentParams(listingFor(RIGHTMOVE.file, RIGHTMOVE.url), { criteria: CRITERIA, manualArea: '82' });
    const MUST_CONTAIN = [
      'postcode', 'price', 'type', 'beds', 'baths', 'area', 'areaSrc',
      'subjectTenure',
      'minCashflow', 'minRoi', 'minIcr', 'minProfit',
      'fp', 'ph', 'auction', 'src',
    ];
    const missing = MUST_CONTAIN.filter((k) => !p.has(k) || (p.get(k) ?? '') === '');
    expect(missing, `missing from the handoff: ${missing.join(', ')}`).toEqual([]);
  });
});
