// @vitest-environment happy-dom
/**
 * X5 — THE PANEL AND THE BOX MUST PRODUCE THE SAME COMPARISON.
 *
 * ── THE FAULT THIS EXISTS TO PREVENT, AND IT WAS ALREADY HERE ───────────────
 * Two paths agreeing until one changes is the shape of failure this project
 * keeps meeting. This one did not even need time to rot: when the price line
 * was first put on the portal's page, the two assemblies already disagreed.
 *
 *   THE PANEL resolved the floor area from the listing, then the EPC register,
 *     then the sector's own EPC-joined sold rows — and widened to neighbouring
 *     sectors when its own could not reach five comparables.
 *   THE BOX resolved the area from the listing and the register only, and never
 *     widened at all.
 *
 * Measured on one real listing with one sector: the panel returned a WIDENED
 * RANGE and the box returned TOO FEW. Same property, same data, two answers, on
 * two surfaces somebody can have open side by side.
 *
 * ── WHY THIS COMPARES OUTPUTS, NOT INPUTS ──────────────────────────────────
 * It would be easy, and worthless, to build one set of inputs and hand it to
 * `priceBand` twice. That tests the maths, which was never in doubt — what
 * differed was the WORK OF DECIDING WHAT TO HAND IT.
 *
 * So each side is driven through its own real entry point: the panel through
 * the mounted controller, reading the band it actually rendered; the box
 * through the content script's own `priceFor`, with its reads stubbed to the
 * same underlying data. Neither expectation is computed here. They are compared
 * to EACH OTHER, and a case where both say nothing is failed as vacuous.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractListing, FALLBACK_CONFIG,
  type BandOutcome, type BandSale, type NormalisedListing, type SectorFile,
} from '@gil-bricks/core';
import { __mountForTest, __lastBand } from '../entrypoints/sidepanel/main.ts';
import { priceFor, type PriceDeps } from '../src/price';

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'core', 'fixtures', 'listings');
const NOW = new Date('2026-09-15');

function read(portal: 'rightmove' | 'zoopla', file: string, url: string): NormalisedListing {
  const w = new Window({
    url,
    settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
  });
  w.document.write(readFileSync(join(CORPUS, portal, file), 'utf8'));
  const r = extractListing(portal, w.document as unknown as Document, FALLBACK_CONFIG, url);
  if (!r.ok) throw new Error(`${file} no longer extracts: ${r.reason}`);
  return r.listing;
}

const LISTINGS: { name: string; listing: () => NormalisedListing }[] = [
  { name: 'rightmove terrace (no area on the listing)', listing: () => read('rightmove', 'rightmove-reduced-terrace-leasehold.html', 'https://www.rightmove.co.uk/properties/167112923') },
  { name: 'rightmove detached (has a house number)', listing: () => read('rightmove', 'rightmove-reduced-detached-freehold.html', 'https://www.rightmove.co.uk/properties/88376352') },
  { name: 'zoopla semi (states 137 m²)', listing: () => read('zoopla', 'zoopla-newbuild-semi-floorplan.html', 'https://www.zoopla.co.uk/for-sale/details/73379642/') },
  { name: 'zoopla terrace (auction)', listing: () => read('zoopla', 'zoopla-auction-terrace-floorplan.html', 'https://www.zoopla.co.uk/for-sale/details/73975876/') },
];

type Sale = Record<string, unknown>;
const sale = (ppsqm: number, area: number, type: string, over: Sale = {}): Sale => ({
  id: `s${ppsqm}`, date: '2025-06-01', price: Math.round(ppsqm * area), type,
  floorAreaSqm: area, ppsqm, ...over,
});

function sectorOf(sales: Sale[]): SectorFile {
  return {
    schemaVersion: 1, sector: 'SA5 8', country: 'E92000001', updatedAt: 'x', sales,
    stats: { count: sales.length, typicalPrice: 1, typicalPpsqm: 1, p10Price: 1, p90Price: 2 },
  } as unknown as SectorFile;
}

/** The sector shapes that drive every branch the comparison has. */
const SECTORS: { name: string; sector: (t: string, a: number) => SectorFile; wider: (t: string, a: number) => BandSale[] }[] = [
  {
    name: 'enough comparables',
    sector: (t, a) => sectorOf(Array.from({ length: 9 }, (_, i) => sale(1300 + i * 40, a, t))),
    wider: () => [],
  },
  {
    name: 'too thin, and neighbours to widen into',
    sector: (t, a) => sectorOf(Array.from({ length: 2 }, (_, i) => sale(1400 + i * 10, a, t))),
    wider: (t, a) => Array.from({ length: 7 }, (_, i) => sale(1300 + i * 40, a, t) as unknown as BandSale),
  },
  {
    name: 'too thin, and nowhere to widen to',
    sector: (t, a) => sectorOf(Array.from({ length: 2 }, (_, i) => sale(1400 + i * 10, a, t))),
    wider: () => [],
  },
  {
    name: 'a spread with no middle',
    sector: (t, a) => sectorOf([
      ...Array.from({ length: 5 }, (_, i) => sale(900 + i * 20, a, t)),
      ...Array.from({ length: 5 }, (_, i) => sale(2400 + i * 20, a, t)),
    ]),
    wider: () => [],
  },
  {
    name: 'nothing at all',
    sector: () => sectorOf([]),
    wider: () => [],
  },
];

/**
 * Could the EPC register have been asked at all? Both surfaces gate that lookup
 * on a house number, so a listing without one gets no area from either — and
 * handing the panel one anyway would compare two different subjects.
 */
function registerCouldAnswer(l: NormalisedListing): boolean {
  return l.floorAreaSqm.status !== 'found' && (l.address.value?.paon ?? '') !== '';
}

/** The type letter and a plausible size for a listing, so the sales can match it. */
function subject(l: NormalisedListing): { type: string; area: number } {
  const t = (l.propertyType.value ?? '').toLowerCase();
  const type = /semi/.test(t) ? 'S' : /detached/.test(t) ? 'D' : /terrac|town/.test(t) ? 'T' : /flat|apartment/.test(t) ? 'F' : 'O';
  const area = l.floorAreaSqm.status === 'found' && l.floorAreaSqm.value ? l.floorAreaSqm.value : 82;
  return { type, area };
}

/**
 * THE PANEL'S OWN PATH: mount the real controller, read what it rendered.
 *
 * It is given the SAME listing the box gets and the SAME register answer —
 * never a doctored one. An earlier cut handed the panel a listing with the area
 * spliced in while the box was left to find it, which compared two different
 * subjects and failed seven cases for a reason that was in the test.
 */
function panelBand(
  listing: NormalisedListing, sector: SectorFile, wider: BandSale[], registerAreaSqm: number | null,
): BandOutcome | null {
  document.body.innerHTML = '<main id="app"></main>';
  (globalThis as unknown as { chrome: unknown }).chrome = { tabs: { create: () => {} } };
  __mountForTest(listing, { sector, widerSales: wider.length ? wider : null, registerAreaSqm });
  return __lastBand();
}

/** THE BOX'S OWN PATH: the content script's real function, its reads stubbed. */
function boxDeps(sector: SectorFile, wider: BandSale[], epcArea: number | null): PriceDeps {
  return {
    sector: async () => sector,
    epcArea: async () => epcArea,
    widerSales: async () => wider,
    now: () => NOW,
  };
}

beforeEach(() => { document.body.innerHTML = '<main id="app"></main>'; });

describe('the panel and the box produce the same comparison', () => {
  const CASES = LISTINGS.flatMap((l) => SECTORS.map((s) => [`${l.name} × ${s.name}`, l, s] as const));

  it.each(CASES)('%s', async (_name, l, s) => {
    const listing = l.listing();
    const { type, area } = subject(listing);
    const sector = s.sector(type, area);
    const wider = s.wider(type, area);
    // Where the listing states no area, both sides are given the same register
    // answer — but ONLY where the register could actually have been asked.
    // Both gate that lookup on a house number, so a listing without one gets
    // nothing from either, and "both say no-area" is real agreement rather
    // than a gate this test reached around for one of them.
    const epcArea = registerCouldAnswer(listing) ? area : null;

    const panel = panelBand(listing, sector, wider, epcArea);
    const box = await priceFor(listing, boxDeps(sector, wider, epcArea));

    expect(box, 'the box produced no comparison where the panel did').toEqual(panel);
  });

  /**
   * A GUARD ON THE GUARD. Every case above passes trivially if both sides
   * always return null, so this proves the matrix actually exercises the
   * branches it claims to — and names the ones it found.
   */
  it('and the cases really do cover every outcome the comparison has', async () => {
    const kinds = new Set<string>();
    for (const l of LISTINGS) {
      for (const s of SECTORS) {
        const listing = l.listing();
        const { type, area } = subject(listing);
        const epcArea = registerCouldAnswer(listing) ? area : null;
        const band = await priceFor(listing, boxDeps(s.sector(type, area), s.wider(type, area), epcArea));
        if (band === null) { kinds.add('null'); continue; }
        kinds.add(band.kind === 'none' ? `none/${band.reason}` : band.kind === 'range' && band.widened ? 'range/widened' : band.kind);
      }
    }
    for (const wanted of ['range', 'range/widened', 'none/too-few', 'spread']) {
      expect([...kinds], `nothing in the matrix produced ${wanted}`).toContain(wanted);
    }
  });
});

/**
 * THE DIVERGENCE THAT WAS REALLY THERE, pinned as its own case so it cannot
 * come back quietly. A thin sector with neighbours to widen into: the panel
 * widened, the box said "too few", and each was rendering its answer as fact.
 */
describe('the widening, which is where they actually differed', () => {
  it('both widen, and both say so', async () => {
    const listing = LISTINGS[1].listing();
    const { type, area } = subject(listing);
    const thin = sectorOf(Array.from({ length: 2 }, (_, i) => sale(1400 + i * 10, area, type)));
    const wider = Array.from({ length: 7 }, (_, i) => sale(1300 + i * 40, area, type) as unknown as BandSale);

    // The detached listing carries a house number, so the register can answer
    // for it — which is what makes this the widening case rather than a
    // no-area one.
    const panel = panelBand(listing, thin, wider, area);
    const box = await priceFor(listing, boxDeps(thin, wider, area));

    expect(panel?.kind, 'the panel widens').toBe('range');
    expect(panel?.kind === 'range' && panel.widened).toBe(true);
    expect(box, 'and so does the box, to the same answer').toEqual(panel);
  });

  it('and neither invents a range when there is nowhere to widen to', async () => {
    const listing = LISTINGS[1].listing();
    const { type, area } = subject(listing);
    const thin = sectorOf(Array.from({ length: 2 }, (_, i) => sale(1400 + i * 10, area, type)));

    const panel = panelBand(listing, thin, [], area);
    const box = await priceFor(listing, boxDeps(thin, [], area));

    expect(panel?.kind).toBe('none');
    expect(box).toEqual(panel);
  });
});

