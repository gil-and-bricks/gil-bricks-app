// @vitest-environment happy-dom
/**
 * X2 — THE CHIPS, ON REAL SAVED PORTAL PAGES.
 *
 * These are injected into a page somebody else owns, so most of what is tested
 * here is restraint: that nothing leaks out of our shadow root, that nothing
 * appears twice, that a finding with nowhere to sit still gets shown rather
 * than dropped, and that the whole feature vanishes when the switch is off.
 *
 * The pages are the committed corpus — real Rightmove and Zoopla listings,
 * saved once. The corpus README's rule holds here as everywhere: no test may
 * make a network request to a portal.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractListing, portalForUrl, FALLBACK_CONFIG, pageFindings, allFindings,
  FINDING_COPY, EXTENSION_FLAGS, PRICE_LINE, BAND_AREA_WORDS,
  type NormalisedListing, type Portal, type Finding, type BandOutcome,
} from '@gil-bricks/core';
import { mountChips, removeChips, findAnchor, findBoxAnchor, ourHosts, buildGroupContent, priceLine, CHIP_HOST_TAG, CHIPS_ROOT_ATTR } from '../src/chips';

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'core', 'fixtures', 'listings');

const CASES: { portal: Portal; file: string; url: string }[] = [
  { portal: 'rightmove', file: 'rightmove-reduced-terrace-leasehold.html', url: 'https://www.rightmove.co.uk/properties/167112923' },
  { portal: 'rightmove', file: 'rightmove-reduced-detached-freehold.html', url: 'https://www.rightmove.co.uk/properties/88376352' },
  { portal: 'zoopla', file: 'zoopla-newbuild-semi-floorplan.html', url: 'https://www.zoopla.co.uk/for-sale/details/73379642/' },
  { portal: 'zoopla', file: 'zoopla-auction-terrace-floorplan.html', url: 'https://www.zoopla.co.uk/for-sale/details/73975876/' },
];

/** A real portal page, parsed, with its listing read from it. */
function page(c: { portal: Portal; file: string; url: string }): { doc: Document; listing: NormalisedListing } {
  const w = new Window({
    url: c.url,
    settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
  });
  w.document.write(readFileSync(join(CORPUS, c.portal, c.file), 'utf8'));
  const doc = w.document as unknown as Document;
  const r = extractListing(c.portal, doc, FALLBACK_CONFIG, c.url);
  if (!r.ok) throw new Error(`${c.file} no longer extracts: ${r.reason}`);
  return { doc, listing: r.listing };
}

const mount = (c: typeof CASES[number], findings?: readonly Finding[]) => {
  const { doc, listing } = page(c);
  const f = findings ?? pageFindings(listing);
  const res = mountChips({ doc, portal: c.portal, findings: f, brand: 'PropLaunch' });
  return { doc, listing, findings: f, res };
};

beforeEach(() => { document.body.innerHTML = ''; });

describe('the switch', () => {
  /**
   * X3 — TWO SWITCHES, AND THE ONE THAT DECIDES IS THE OPERATOR'S.
   *
   * Rightmove's terms of use clause 8.3 prohibits a user overlaying material on
   * their platform, so injecting anything stays the operator's call. What moved
   * is WHERE they make it: the flag below is the kill switch (false and nothing
   * injects, whatever anyone has ticked), and the CHOICE is now a setting in the
   * panel, off until they turn it on.
   *
   * It used to be only the flag, which meant the feature was invisible to the
   * person it was built for — they could not find it, and told us so.
   */
  it('the feature is available, and the choice is the operator’s', () => {
    expect(EXTENSION_FLAGS.onPageChips, 'the kill switch permits it').toBe(true);
  });

  it('nothing is injected until the operator’s own setting says so', () => {
    const content = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'entrypoints', 'content.ts'), 'utf8');
    const fn = content.slice(content.indexOf('const showChips'));
    const setting = fn.indexOf('getChipsOn()');
    const firstRead = fn.indexOf('extractCurrentPage');
    expect(setting, 'the setting is consulted').toBeGreaterThan(-1);
    expect(setting, 'before the page is read at all').toBeLessThan(firstRead);
  });

  it('the setting defaults to off', () => {
    const store = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'store.ts'), 'utf8');
    expect(store).toMatch(/getChipsOn = \(\) => getLocal<boolean>\('gb:chips-on', false\)/);
  });

  it('and the operator can reach it without opening a file', () => {
    const panel = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'entrypoints', 'sidepanel', 'main.ts'), 'utf8');
    expect(panel, 'a switch in the panel’s own Settings').toContain('gb-chips-on');
    expect(panel).toContain('onChips');
  });

  it('the panel reads no such flag, so turning it off cannot touch the panel', () => {
    const panel = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'entrypoints', 'sidepanel', 'main.ts'), 'utf8');
    expect(panel, 'the side panel must be completely unaffected').not.toContain('onPageChips');
    expect(panel).not.toContain('EXTENSION_FLAGS');
  });

  it('the content script will not inject a thing while it is off', () => {
    const content = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'entrypoints', 'content.ts'), 'utf8');
    // The guard is the FIRST thing in the function, before any page read.
    const fn = content.slice(content.indexOf('const showChips'));
    const guard = fn.indexOf('EXTENSION_FLAGS.onPageChips');
    const firstRead = fn.indexOf('extractCurrentPage');
    expect(guard, 'the flag is checked').toBeGreaterThan(-1);
    expect(guard, 'and checked before the page is read at all').toBeLessThan(firstRead);
  });
});

describe('a chip sits under the thing it refers to', () => {
  it('Rightmove: the tenure anchor is found on a real page', () => {
    const { doc } = page(CASES[0]);
    const el = findAnchor(doc, 'rightmove', 'tenure');
    expect(el, 'data-testid="info-reel-tenure-button"').not.toBeNull();
  });

  it('Rightmove: the EPC anchor is found on a real page', () => {
    const { doc } = page(CASES[0]);
    expect(findAnchor(doc, 'rightmove', 'epc')).not.toBeNull();
  });

  it('Zoopla: the tenure anchor is found by its section and its visible label', () => {
    const { doc } = page(CASES[2]);
    const el = findAnchor(doc, 'zoopla', 'tenure');
    expect(el, 'section[aria-labelledby="key-info"] → the li titled Tenure').not.toBeNull();
    expect((el!.textContent ?? '').toLowerCase()).toContain('tenure');
  });

  it('Zoopla: the council tax anchor likewise', () => {
    const { doc } = page(CASES[2]);
    const el = findAnchor(doc, 'zoopla', 'councilTax');
    expect(el).not.toBeNull();
    expect((el!.textContent ?? '').toLowerCase()).toContain('council tax');
  });

  it('an anchored chip is inserted immediately AFTER its anchor, never inside it', () => {
    const { doc } = page(CASES[0]);
    const anchor = findAnchor(doc, 'rightmove', 'tenure')!;
    const before = anchor.innerHTML;
    mountChips({
      doc, portal: 'rightmove', brand: 'PropLaunch',
      findings: [{ code: 'LEASE', kind: 'risk', anchor: 'tenure' }],
    });
    expect(anchor.nextElementSibling?.tagName.toLowerCase()).toBe(CHIP_HOST_TAG);
    expect(anchor.innerHTML, 'their element is not touched').toBe(before);
  });
});

/**
 * THEIR MARKUP WILL CHANGE. Assume it. A missing anchor must put the finding in
 * the box, not guess a position and not silently drop it.
 */
describe('when their markup changes', () => {
  it('a finding whose anchor has gone falls back into the box', () => {
    const { doc } = page(CASES[0]);
    // Simulate the redesign: the tenure hook is gone.
    doc.querySelector('[data-testid="info-reel-tenure-button"]')!.removeAttribute('data-testid');
    const res = mountChips({
      doc, portal: 'rightmove', brand: 'PropLaunch',
      findings: [{ code: 'LEASE', kind: 'risk', anchor: 'tenure' }],
    });
    expect(res.anchored).toBe(0);
    expect(res.inBox, 'shown in the box rather than dropped').toBe(1);
    expect(ourHosts(doc)).toHaveLength(1);
    expect(ourHosts(doc)[0].getAttribute(CHIPS_ROOT_ATTR)).toBe('box');
  });

  it('nothing is dropped on the floor, whatever is missing', () => {
    const { doc } = page(CASES[0]);
    for (const el of Array.from(doc.querySelectorAll('[data-testid]'))) el.removeAttribute('data-testid');
    const findings: Finding[] = [
      { code: 'LEASE', kind: 'risk', anchor: 'tenure' },
      { code: 'NOEPC', kind: 'gap', anchor: 'epc' },
      { code: 'NOAREA', kind: 'gap', anchor: 'area' },
    ];
    const res = mountChips({ doc, portal: 'rightmove', brand: 'PropLaunch', findings });
    expect(res.anchored + res.inBox, 'every finding is still on the page somewhere').toBe(3);
  });

  it('a malformed anchor selector returns null rather than throwing at the page', () => {
    const { doc } = page(CASES[0]);
    expect(() => findAnchor(doc, 'rightmove', 'none')).not.toThrow();
    expect(findAnchor(doc, 'rightmove', 'none')).toBeNull();
  });

  it('the box still finds a home when even the photographs have gone', () => {
    const { doc } = page(CASES[2]);
    expect(findBoxAnchor(doc, 'zoopla'), 'falls through to the heading, then to body').not.toBeNull();
  });
});

describe('nothing we inject can touch their page', () => {
  it.each(CASES.map((c) => [c.file, c] as const))('%s — every group is a CLOSED shadow root', (_f, c) => {
    const { doc } = mount(c);
    const hosts = ourHosts(doc);
    expect(hosts.length).toBeGreaterThan(0);
    for (const h of hosts) {
      // `closed` means the page cannot reach in — and neither can this test,
      // which is exactly the proof: shadowRoot is null from outside.
      expect((h as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot,
        'a closed root is not reachable from the page').toBeNull();
    }
  });

  it('we add no stylesheet, no class and no attribute to their document', () => {
    const { doc } = page(CASES[0]);
    const styleBefore = doc.querySelectorAll('style,link[rel=stylesheet]').length;
    const bodyClassBefore = doc.body.className;
    mount(CASES[0]);
    // Our CSS lives inside the shadow root; none of it is in their document.
    expect(doc.querySelectorAll('style,link[rel=stylesheet]').length).toBe(styleBefore);
    expect(doc.body.className).toBe(bodyClassBefore);
  });

  it('their own elements are never modified, only followed', () => {
    const { doc } = page(CASES[0]);
    const anchor = doc.querySelector('[data-testid="info-reel-tenure-button"]')!;
    const snapshot = anchor.outerHTML;
    mount(CASES[0]);
    expect(anchor.outerHTML, 'we insert AFTER, we do not rewrite').toBe(snapshot);
  });

  it('our host element is ours alone — one tag name, one attribute', () => {
    const { doc } = mount(CASES[0]);
    for (const h of ourHosts(doc)) {
      expect(h.tagName.toLowerCase()).toBe(CHIP_HOST_TAG);
      expect(h.hasAttribute(CHIPS_ROOT_ATTR)).toBe(true);
    }
  });

  it('removeChips leaves the page exactly as it was found', () => {
    const { doc } = page(CASES[0]);
    const before = doc.body.innerHTML;
    mountChips({ doc, portal: 'rightmove', brand: 'PropLaunch', findings: pageFindings(page(CASES[0]).listing) });
    expect(doc.body.innerHTML).not.toBe(before);
    removeChips(doc);
    expect(doc.body.innerHTML, 'every trace of us gone').toBe(before);
  });
});

describe('never twice, however often they re-render', () => {
  it('mounting repeatedly leaves exactly one set', () => {
    const { doc, listing } = page(CASES[0]);
    const f = pageFindings(listing);
    for (let i = 0; i < 5; i += 1) mountChips({ doc, portal: 'rightmove', brand: 'PropLaunch', findings: f });
    const hosts = ourHosts(doc);
    // One host per anchor group, and no more after five mounts than after one.
    const once = (() => {
      const p = page(CASES[0]);
      mountChips({ doc: p.doc, portal: 'rightmove', brand: 'PropLaunch', findings: f });
      return ourHosts(p.doc).length;
    })();
    expect(hosts.length).toBe(once);
  });

  it('moving to another listing shows the new findings and none of the old', () => {
    const { doc } = page(CASES[0]);
    mountChips({
      doc, portal: 'rightmove', brand: 'PropLaunch',
      findings: [{ code: 'LEASE', kind: 'risk', anchor: 'tenure' }],
    });
    expect(ourHosts(doc)).toHaveLength(1);
    // Same document, new listing — exactly what a single-page app does.
    mountChips({
      doc, portal: 'rightmove', brand: 'PropLaunch',
      findings: [{ code: 'NOCT', kind: 'gap', anchor: 'councilTax' }],
    });
    const hosts = ourHosts(doc);
    expect(hosts).toHaveLength(1);
    expect(hosts[0].getAttribute(CHIPS_ROOT_ATTR), 'councilTax has no Rightmove hook, so it boxes').toBe('box');
  });

  it('the content script clears our nodes before reading the next listing', () => {
    const content = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'entrypoints', 'content.ts'), 'utf8');
    const nav = content.slice(content.indexOf('if (withoutHash() === last) return;'));
    expect(nav, 'a slow read must not paint one property’s findings on another').toContain('removeChips(document)');
  });
});

/**
 * X4 — THE ONE LINE ON THEIR PAGE THAT IS NOT A WORRY.
 *
 * Everything else here is a risk or a gap. This is the answer: the asking price
 * against what similar homes actually sold for, which is the one thing the
 * portal never shows and the one thing this product can compute that nobody
 * else can.
 */
describe('the price position', () => {
  const band = (over: Partial<Extract<BandOutcome, { kind: 'range' }>> = {}): BandOutcome => ({
    kind: 'range', count: 9, widened: false, area: 'half-mile', low: 1300, high: 1520,
    subjectPpsqm: 1400, position: 'within', ...over,
  });

  it('states a POSITION and the count, never an adjective', () => {
    const line = priceLine(band())!;
    expect(line.position).toBe(PRICE_LINE.within);
    expect(line.basis, 'the count, so they can weigh it').toContain('9 similar sales');
    expect(line.basis, 'and the range itself').toMatch(/£1,300–£1,520\/m²/);
    for (const adjective of ['good', 'cheap', 'bargain', 'great', 'value']) {
      expect(`${line.position} ${line.basis}`.toLowerCase(), adjective).not.toContain(adjective);
    }
  });

  it.each([
    ['within', PRICE_LINE.within],
    ['above', PRICE_LINE.above],
    ['below', PRICE_LINE.below],
  ] as const)('reports %s as a position', (position, expected) => {
    expect(priceLine(band({ position }))!.position).toBe(expected);
  });

  /**
   * C1 — THE AREA IS NAMED, ALWAYS, AND THE NAME IS THE ONE IT ACTUALLY USED.
   *
   * This used to look for a "wider area" suffix appended beside a basis that
   * named no area at all — so the DEFAULT case said nothing about where the
   * sales came from, and a reader had no way to tell half a mile from a whole
   * postcode sector. Every state now carries its own words, and the widened one
   * is distinguished by saying "1 mile" rather than by a tacked-on label.
   */
  /**
   * C1 — THE ONE LINE THAT SENDS THEM TO THE EVIDENCE. This box is a position,
   * not a valuation; every figure the analyser then produces rests on which
   * sold sales the property is compared against, and the box says so.
   */
  it('the box points at the comparables, where the real answer is', () => {
    const { doc, listing } = page(CASES[0]);
    const content = buildGroupContent({
      doc, findings: pageFindings(listing), brand: 'PropLaunch', asBox: true, band: band(),
    })!;
    expect(content.textContent).toContain(PRICE_LINE.checkComparables);
  });

  it('and says nothing about comparables where there is no comparison to point at', () => {
    const { doc, listing } = page(CASES[0]);
    const content = buildGroupContent({
      doc, findings: pageFindings(listing), brand: 'PropLaunch', asBox: true,
      band: { kind: 'none', reason: 'too-few', countFound: 3 },
    })!;
    expect(content.textContent, 'a pointer to nothing').not.toContain(PRICE_LINE.checkComparables);
  });

  it('names the area it compared against, in every state it has', () => {
    expect(priceLine(band())!.basis).toContain(BAND_AREA_WORDS['half-mile']);
    expect(priceLine(band({ widened: true, area: 'wider' }))!.basis).toContain(BAND_AREA_WORDS.wider);
    expect(priceLine(band({ area: 'sector' }))!.basis).toContain(BAND_AREA_WORDS.sector);
    expect(priceLine(band({ widened: true, area: 'sectors' }))!.basis).toContain(BAND_AREA_WORDS.sectors);
    // …and never claims half a mile for a comparison that could not draw one.
    expect(priceLine(band({ area: 'sector' }))!.basis).not.toContain(BAND_AREA_WORDS['half-mile']);
  });

  /** Every honest refusal produces NO line at all, rather than a hedge. */
  it.each([
    ['no floor area', { kind: 'none', reason: 'no-area', countFound: 0 }],
    ['too few comparables', { kind: 'none', reason: 'too-few', countFound: 3 }],
    ['a spread with no middle', { kind: 'spread', count: 9, widened: false, area: 'half-mile', low: 900, high: 2400 }],
  ] as const)('shows nothing at all on %s', (_what, outcome) => {
    expect(priceLine(outcome as BandOutcome)).toBeNull();
  });

  it('and nothing at all when there is no band to speak of', () => {
    expect(priceLine(null)).toBeNull();
    expect(priceLine(undefined)).toBeNull();
  });

  it('goes in the BOX, above the chips — it is the answer, they are the caveats', () => {
    const wrap = buildGroupContent({
      doc: document, brand: 'PropLaunch', asBox: true, band: band(),
      findings: [{ code: 'LEASE', kind: 'risk', anchor: 'tenure' }],
    })!;
    const price = wrap.querySelector('.price')!;
    const chip = wrap.querySelector('.chip')!;
    expect(price).not.toBeNull();
    expect(
      price.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the price must come first',
    ).toBeTruthy();
  });

  it('carries its caveat, permanently', () => {
    const wrap = buildGroupContent({
      doc: document, brand: 'PropLaunch', asBox: true, band: band(), findings: [],
    })!;
    expect(wrap.querySelector('.price-caveat')?.textContent).toBe(PRICE_LINE.caveat);
    expect(PRICE_LINE.caveat, 'what it cannot see').toMatch(/size, not quality/);
    expect(PRICE_LINE.caveat, 'how coarse the data is').toMatch(/1,500 people/);
    expect(PRICE_LINE.caveat, 'and why cheap is not the same as worth buying')
      .toMatch(/cheap for a reason/);
  });

  /** A box with a price and no chips still earns its place — the price IS the box. */
  it('draws the box for a price alone, with no chips in it', () => {
    const { doc } = page(CASES[0]);
    const res = mountChips({ doc, portal: 'rightmove', brand: 'PropLaunch', findings: [], band: band() });
    expect(res.price).toBe(true);
    expect(ourHosts(doc)).toHaveLength(1);
    expect(ourHosts(doc)[0].getAttribute(CHIPS_ROOT_ATTR)).toBe('box');
  });

  it('and draws no box at all when there is neither a price nor a chip', () => {
    const { doc } = page(CASES[0]);
    mountChips({ doc, portal: 'rightmove', brand: 'PropLaunch', findings: [], band: null });
    expect(ourHosts(doc)).toHaveLength(0);
  });
});

describe('four at most, and it is obviously ours', () => {
  it.each(CASES.map((c) => [c.file, c] as const))('%s shows no more than four chips in total', (_f, c) => {
    const { res, findings } = mount(c);
    // The counts come from the mounter itself, which is what actually went on
    // the page — not from the number of hosts, which is a different number.
    expect(res.anchored + res.inBox, 'more than four and people stop reading them').toBeLessThanOrEqual(4);
    expect(res.anchored + res.inBox, 'and every one asked for is shown').toBe(findings.length);
  });

  /**
   * THE MARKUP ITSELF, read through the content seam — the real root is closed
   * on purpose, so this asserts what was rendered rather than that something was.
   */
  it.each([true, false])('the product’s mark and an icon are on every group (box=%s)', (asBox) => {
    const wrap = buildGroupContent({
      doc: document, brand: 'PropLaunch', asBox,
      findings: [{ code: 'LEASE', kind: 'risk', anchor: 'tenure' }],
      onHide: () => {},
    })!;
    expect(wrap.querySelector('.mark')?.textContent, 'it must be obviously ours').toContain('PropLaunch');
    expect(wrap.querySelectorAll('.chip')).toHaveLength(1);
    expect(wrap.querySelector('.chip')?.textContent).toContain(FINDING_COPY.LEASE.label);
  });

  /**
   * COLOUR ALONE EXCLUDES ABOUT ONE MAN IN TWELVE. Every chip carries a text
   * label AND an icon AND a colour, so the two kinds are told apart three ways.
   */
  it('every chip carries a label, an icon and a tone — never colour alone', () => {
    const wrap = buildGroupContent({
      doc: document, brand: 'PropLaunch', asBox: true,
      findings: [
        { code: 'LEASE', kind: 'risk', anchor: 'tenure' },
        { code: 'NOCT', kind: 'gap', anchor: 'councilTax' },
      ],
    })!;
    const chips = Array.from(wrap.querySelectorAll('.chip'));
    expect(chips).toHaveLength(2);
    for (const c of chips) {
      expect((c.textContent ?? '').trim().length, 'a text label').toBeGreaterThan(0);
      expect(c.querySelector('svg.ico'), 'an icon').not.toBeNull();
      expect(c.className, 'and a tone').toMatch(/\b(pink|yellow)\b/);
    }
    expect(chips[0].className, 'a risk is pink').toContain('pink');
    expect(chips[1].className, 'a gap is yellow').toContain('yellow');
    expect(
      chips[0].querySelector('svg.ico')?.innerHTML,
      'and the two kinds do not share an icon',
    ).not.toBe(chips[1].querySelector('svg.ico')?.innerHTML);
  });

  /** THE PAGE CARRIES NO SENTENCES. The line of why is behind a tap. */
  it('says nothing beyond the labels until a chip is tapped', () => {
    const wrap = buildGroupContent({
      doc: document, brand: 'PropLaunch', asBox: true,
      findings: [{ code: 'LEASE', kind: 'risk', anchor: 'tenure' }],
    })!;
    const why = wrap.querySelector('.why') as HTMLElement;
    expect(why.hidden, 'no explanation on their page until asked for').toBe(true);
    expect(wrap.textContent).not.toContain(FINDING_COPY.LEASE.why);
    (wrap.querySelector('.chip') as HTMLButtonElement).click();
    expect(why.hidden).toBe(false);
    expect(why.textContent, 'and then ONE line, not a paragraph').toBe(FINDING_COPY.LEASE.why);
  });

  it('a listing with nothing to say gets nothing injected', () => {
    const { doc } = page(CASES[0]);
    const res = mountChips({ doc, portal: 'rightmove', brand: 'PropLaunch', findings: [] });
    expect(res).toEqual({ anchored: 0, inBox: 0, price: false });
    expect(ourHosts(doc)).toHaveLength(0);
  });
});

/**
 * WHAT THE REAL PAGES ACTUALLY PRODUCE. Not a synthetic case: the four saved
 * listings, read and rendered, so the feature is exercised against the shapes
 * it will really meet.
 */
describe('on the real corpus', () => {
  it.each(CASES.map((c) => [c.file, c] as const))('%s produces findings and shows them', (_f, c) => {
    const { doc, listing, res } = mount(c);
    const all = allFindings(listing);
    expect(all.length, 'a real listing has something to say').toBeGreaterThan(0);
    expect(res.anchored + res.inBox, 'and all four make it onto the page').toBe(pageFindings(listing).length);
    expect(ourHosts(doc).length).toBeGreaterThan(0);
  });

  it('every finding shown has words to show', () => {
    for (const c of CASES) {
      for (const f of pageFindings(page(c).listing)) {
        expect(FINDING_COPY[f.code], `${f.code} has no words`).toBeDefined();
      }
    }
  });
});
