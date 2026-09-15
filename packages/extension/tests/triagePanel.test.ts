// @vitest-environment happy-dom
/**
 * X1 — THE TRIAGE PANEL.
 *
 * This replaces render.test.ts and controller.test.ts, which between them tested
 * the deal score, the four strategies' inputs, the levers, the costs card, the
 * components list, the evidence chips, the seller-signals card and the measure
 * tool. All of those were removed in this sprint, so all of those tests were
 * removed with them — a test for code that is gone proves nothing and, worse,
 * keeps a green tick beside a feature nobody can use.
 *
 * What DID survive from them is asserted here, in its new form: the empty and
 * failure states, the England-and-Wales reject and its two distinct reasons, the
 * POA listing with no price, and the settings screen.
 *
 * The rest is new, and most of it is about what the panel MAY NOT SAY.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  found, missing, unavailable, TRIAGE_COPY, FINDING_COPY,
  type NormalisedListing, type SectorFile,
} from '@gil-bricks/core';
import { __mountForTest, renderEmpty, renderFailure, failureFor } from '../entrypoints/sidepanel/main.ts';

const C = TRIAGE_COPY;

function listing(over: Partial<NormalisedListing> = {}): NormalisedListing {
  return {
    portal: 'rightmove', extractorVersion: 'rm-1.0.0', configVersion: 't', source: 'embedded',
    listingId: found('9'), url: found('https://www.rightmove.co.uk/properties/9'),
    postcode: found('SA1 2HG'), outcode: found('SA1'),
    address: found({ paon: '9', street: 'Earl Street', town: 'Swansea' }),
    askingPrice: found(164_000), propertyType: found('Terraced'), tenure: found('FREEHOLD'),
    bedrooms: found(3), bathrooms: found(1), floorAreaSqm: found(82), floorAreaSqmRange: missing(),
    floorPlanImageUrls: missing(), photoUrls: missing(), newBuild: found(false),
    listingUpdate: missing(), firstVisibleDate: missing(),
    description: found('A terrace.'), isAuction: unavailable(),
  epcUrls: unavailable(), councilTaxBand: unavailable(), leaseYearsRemaining: unavailable(),
  annualGroundRent: unavailable(), annualServiceCharge: unavailable(),
    ...over,
  } as NormalisedListing;
}

/** A sector with enough same-type, similar-size sales to draw a range from. */
function sector(ppsqmValues: number[] = [], type = 'T'): SectorFile {
  const sales = ppsqmValues.map((pps, i) => ({
    id: `s${i}`, date: '2025-06-01', price: Math.round(pps * 82), type,
    floorAreaSqm: 82, ppsqm: pps, paon: String(i), street: 'Earl Street',
    town: 'Swansea', postcode: 'SA1 2HG', tenure: 'F', newBuild: false, lat: 0, lng: 0,
  }));
  return {
    schemaVersion: 1, sector: 'SA1 2', country: 'E92000001', updatedAt: '2026-08-31T00:00:00Z',
    sales, stats: { count: sales.length, typicalPrice: 164_000, typicalPpsqm: 2000, p10Price: 120_000, p90Price: 210_000 },
  } as unknown as SectorFile;
}

const txt = (): string => document.getElementById('app')?.textContent ?? '';
const mount = (l = listing(), opts = {}): void => { __mountForTest(l, opts); };

beforeEach(() => {
  document.body.innerHTML = '<main id="app"></main>';
  (globalThis as unknown as { chrome: unknown }).chrome = { tabs: { create: () => {} } };
});

// ───────────────────────── THE LAW ─────────────────────────

/**
 * THE ONE THAT MATTERS MOST. No score, no verdict, no endorsement — on any
 * listing, in any state. `triageCopy.test.ts` in core sweeps the WORDS; this
 * sweeps what is actually on screen after the panel has rendered.
 */
describe('the panel may warn, may state facts, and may never bless', () => {
  const SHAPES: [string, () => void][] = [
    ['a full listing with evidence', () => mount(listing(), { sector: sector([1800, 1900, 2000, 2100, 2200]) })],
    ['a listing with no sector data', () => mount(listing(), { sector: null })],
    ['a listing with no floor area', () => mount(listing({ floorAreaSqm: missing() }), { sector: sector([1800, 1900, 2000, 2100, 2200]) })],
    ['a listing with no price', () => mount(listing({ askingPrice: missing() }), { sector: sector([1800, 1900, 2000, 2100, 2200]) })],
    ['a leasehold auction flat', () => mount(listing({ tenure: found('LEASEHOLD'), isAuction: found(true), description: found('For sale by auction. Cash buyers only.') }), { sector: sector([1800, 1900, 2000, 2100, 2200]) })],
    ['a price far below the range', () => mount(listing({ askingPrice: found(60_000) }), { sector: sector([1800, 1900, 2000, 2100, 2200]) })],
  ];

  it.each(SHAPES)('shows no score out of ten on %s', (_label, render) => {
    render();
    expect(txt(), 'a score is a verdict').not.toMatch(/\b\d(\.\d)?\s*\/\s*10\b/);
    expect(txt()).not.toMatch(/out of 10/i);
  });

  it.each(SHAPES)('uses no endorsing word on %s', (_label, render) => {
    render();
    const said = txt().toLowerCase();
    for (const word of ['good', 'great', 'bargain', 'opportunity', 'excellent', 'strong buy']) {
      expect(said, `"${word}" reads as a blessing`).not.toContain(word);
    }
    // "safe" and "value" appear inside ordinary words, so they are matched whole.
    for (const word of ['safe', 'value']) {
      expect(said, `"${word}" reads as a blessing`).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
  });

  it.each(SHAPES)('gives no verdict word on %s', (_label, render) => {
    render();
    expect(txt()).not.toMatch(/walk away|marginal|deal score|verdict/i);
  });

  /**
   * A PRICE BELOW THE RANGE IS THE MOST DANGEROUS THING THIS PANEL CAN SHOW,
   * because it is the one a reader most wants to hear as "cheap, therefore buy".
   * It must say where the price sits and then say, in the same breath, that it
   * cannot see why.
   */
  it('a price below the range states the position and immediately qualifies it', () => {
    mount(listing({ askingPrice: found(60_000) }), { sector: sector([1800, 1900, 2000, 2100, 2200]) });
    expect(txt()).toContain(C.band.below);
    expect(txt(), 'and the reason it might be cheap').toContain('Cheap for the size can mean cheap for a reason');
  });
});

// ───────────────────────── ZONE ONE ─────────────────────────

describe('zone one — the numbers', () => {
  it('shows the asking price, the £/m², the tax and the cash needed', () => {
    mount(listing(), { sector: sector([1800, 1900, 2000, 2100, 2200]) });
    const said = txt();
    expect(said).toContain(C.numbers.asking);
    expect(said).toContain('£164,000');
    expect(said).toContain(C.numbers.perSqm);
    expect(said, '164000 / 82').toContain('£2,000');
    expect(said).toContain(C.numbers.stampDuty);
    expect(said).toContain(C.numbers.cashNeeded);
  });

  it('says out loud that the tax assumes an additional property', () => {
    mount(listing(), { sector: sector([1800, 1900, 2000, 2100, 2200]) });
    expect(txt(), 'the surcharge is usually most of the bill').toContain(C.numbers.stampDutyBasis);
  });

  it('says what the cash-needed figure rests on', () => {
    mount(listing(), { sector: sector([1800, 1900, 2000, 2100, 2200]) });
    expect(txt()).toMatch(/Deposit \d+%/);
  });

  it('a Welsh listing is taxed as Land Transaction Tax, by name', () => {
    const welsh = { ...sector([1800, 1900, 2000, 2100, 2200]), country: 'W92000004' } as unknown as SectorFile;
    mount(listing(), { sector: welsh });
    expect(txt()).toContain(C.numbers.stampDutyWales);
    expect(txt()).not.toContain(C.numbers.stampDuty);
  });

  /** A POA listing has no price. It says so, and claims nothing else. */
  it('a listing with no asking price says so, and shows no invented figures', () => {
    mount(listing({ askingPrice: missing() }), { sector: sector([1800, 1900, 2000, 2100, 2200]) });
    expect(txt()).toContain(C.numbers.noPrice);
    expect(txt()).not.toContain(C.numbers.cashNeeded);
    expect(txt()).not.toContain(C.numbers.stampDuty);
  });

  /**
   * A LISTING THAT GIVES "70–80 m²" HAS NOT GIVEN A SIZE. The £/m² drawn off its
   * midpoint must not be set in the same typeface as one drawn off a real figure
   * with nothing said.
   */
  it('a floor-area RANGE is declared, so the £/m² is not read as exact', () => {
    mount(
      listing({ floorAreaSqm: found(75), floorAreaSqmRange: found({ minSqm: 70, maxSqm: 80 }) }),
      { sector: sector([1800, 1900, 2000, 2100, 2200]) },
    );
    expect(txt()).toContain(C.numbers.areaFromRange(70, 80));
  });

  /**
   * X3 — WE ASK FOR THE HOUSE NUMBER, NOT THE FLOOR AREA.
   *
   * There used to be a "Floor area (m²)" box here. Asking somebody to go and
   * measure something we can look up is asking them to do our work: with a
   * postcode and a house number the EPC register gives us the area, and that
   * lookup was already built and already working.
   */
  it('never asks for the floor area — that is ours to fetch', () => {
    mount(listing({ floorAreaSqm: missing() }), { sector: sector([]) });
    expect(document.getElementById('gb-area'), 'the box is gone').toBeNull();
    expect(txt()).not.toMatch(/floor area \(m²\)/i);
  });

  it('asks for the house number only when the listing gave neither', () => {
    // The listing gives a house number, so there is nothing to ask for.
    mount(listing({ floorAreaSqm: missing() }), { sector: sector([]) });
    expect(document.getElementById('gb-paon'), 'the listing already gave “9”').toBeNull();
    // No house number and no area: this is the one case worth asking about.
    document.body.innerHTML = '<main id="app"></main>';
    mount(listing({ floorAreaSqm: missing(), address: found({ street: 'Earl Street' }) }), { sector: sector([]) });
    expect(document.getElementById('gb-paon')).not.toBeNull();
    expect(txt(), 'and says why it wants it').toContain(C.numbers.houseNumberWhy);
  });

  it('and never asks at all once an area is known', () => {
    mount(listing({ address: found({ street: 'Earl Street' }) }), { sector: sector([]) });
    expect(listing().floorAreaSqm.status).toBe('found');
    expect(document.getElementById('gb-paon')).toBeNull();
  });

  /** A remembered house number is in the box, so it is not retyped every visit. */
  it('a remembered house number is shown in the box', () => {
    mount(
      listing({ floorAreaSqm: missing(), address: found({ street: 'Earl Street' }) }),
      { sector: sector([]), manualPaon: '9' },
    );
    const input = document.getElementById('gb-paon') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('9');
  });
});

/**
 * X3 — THE STRATEGY BUTTONS, WHICH USED TO DO NOTHING AT ALL.
 *
 * Pressing one moved the highlight and changed not a single figure: every
 * strategy fell back to the same 25% deposit and the same £1,500 of legals,
 * because the config's own `funding` default was never read. A dead control on
 * a panel whose job is to help somebody decide is worse than no control.
 */
describe('the strategy buttons', () => {
  const FIVE = [1800, 1900, 2000, 2100, 2200];
  const cashLine = (): string => {
    const rows = [...document.querySelectorAll('.num-row')];
    const row = rows.find((r) => r.textContent?.includes(C.numbers.cashNeeded));
    return row?.textContent ?? '';
  };

  it('sit at the very top, above the address', () => {
    mount(listing(), { sector: sector(FIVE) });
    const said = txt();
    const card = document.querySelector('.glass.card')!;
    expect(card.firstElementChild?.className, 'the switch is the first thing on the card')
      .toContain('strategy-switch');
    expect(said.indexOf('BTL')).toBeLessThan(said.indexOf('Earl Street'));
  });

  it('pressing one changes the panel, not just the highlight', () => {
    mount(listing(), { sector: sector(FIVE) });
    const before = txt();
    const beforeCash = cashLine();
    (([...document.querySelectorAll('.strat-btn')] as HTMLButtonElement[])
      .find((b) => b.textContent === 'Flip')!).click();
    expect(document.querySelector('.strat-btn.active')?.textContent, 'the highlight moved').toBe('Flip');
    expect(txt(), 'and so did the panel').not.toBe(before);
    expect(cashLine(), 'the cash needed is the figure that moves').not.toBe(beforeCash);
  });

  /**
   * A bridge charges an arrangement fee on the loan — real cash on day one, on
   * no listing anywhere. That is the whole difference, and it is named.
   */
  it('a bridging strategy names the fee that a mortgage does not have', () => {
    mount(listing(), { sector: sector(FIVE), strategy: 'flip' });
    expect(txt(), 'Flip funds through a bridge').toMatch(/bridging fee/i);
    document.body.innerHTML = '<main id="app"></main>';
    mount(listing(), { sector: sector(FIVE), strategy: 'btl' });
    expect(txt(), 'BTL is a mortgage purchase').not.toMatch(/bridging fee/i);
  });

  it('and the bridging cash needed is genuinely higher', () => {
    const cashOf = (strategy: 'btl' | 'flip'): number => {
      document.body.innerHTML = '<main id="app"></main>';
      mount(listing(), { sector: sector(FIVE), strategy });
      const m = /£([\d,]+)/.exec(cashLine().replace(C.numbers.cashNeeded, ''));
      return Number((m?.[1] ?? '0').replace(/,/g, ''));
    };
    expect(cashOf('flip')).toBeGreaterThan(cashOf('btl'));
  });
});

// ───────────────────────── THE PRICE COMPARISON ─────────────────────────

describe('the price comparison', () => {
  const FIVE = [1800, 1900, 2000, 2100, 2200];

  it('gives a RANGE and the count, never a single typical figure', () => {
    mount(listing(), { sector: sector(FIVE) });
    expect(txt()).toMatch(/Typical range £[\d,]+–£[\d,]+ per m²/);
    expect(txt(), 'always the count').toMatch(/Based on 5 sales/);
  });

  it.each([
    [164_000, C.band.within],
    [250_000, C.band.above],
    [60_000, C.band.below],
  ])('a £%s asking price is reported as a position, not a judgement', (price, wanted) => {
    mount(listing({ askingPrice: found(price) }), { sector: sector(FIVE) });
    expect(txt()).toContain(wanted);
  });

  /** Below five comparables it shows NOTHING — a range from four is an accident. */
  it('refuses to compare against fewer than five sales', () => {
    mount(listing(), { sector: sector([1800, 1900, 2000, 2100]) });
    expect(txt()).toContain(C.band.tooFew(4));
    expect(txt(), 'and draws no range at all').not.toMatch(/Typical range/);
  });

  it('a sector with no sales at all says the same honest thing', () => {
    mount(listing(), { sector: sector([]) });
    expect(txt()).toContain(C.band.tooFew(0));
  });

  it('says so when the prices are too spread out to have a middle', () => {
    // p75/p25 >= 2.0 — an area holding two markets, not one.
    mount(listing(), { sector: sector([1000, 1100, 1200, 3000, 3200, 3400]) });
    expect(txt()).toContain(C.band.spread);
    expect(txt(), 'and no position is claimed').not.toContain(C.band.within);
  });

  it('labels a widened comparison as widened, and does not otherwise', () => {
    mount(listing(), { sector: sector([1800, 1900]), widerSales: sector(FIVE).sales as never });
    expect(txt()).toContain(C.band.widened);
    document.body.innerHTML = '<main id="app"></main>';
    mount(listing(), { sector: sector(FIVE) });
    expect(txt()).not.toContain(C.band.widened);
  });

  it('compares only the SAME property type', () => {
    // Five sales, but every one a flat against a terraced subject.
    mount(listing(), { sector: sector([1800, 1900, 2000, 2100, 2200], 'F') });
    expect(txt(), 'a flat is not a comparable for a terrace').toContain(C.band.tooFew(0));
  });

  it('carries its caveat permanently, in every state that draws a range', () => {
    mount(listing(), { sector: sector(FIVE) });
    expect(txt()).toContain(C.band.caveat);
  });

  /**
   * THE 1,500-PEOPLE FACT IS PART OF THE COMPARISON'S OWN CAVEAT.
   *
   * It used to be a second paragraph directly beneath, which said "it cannot
   * tell one street from the next" in different words from the paragraph above
   * it. On a panel that must fit one screen the reader paid twice for one fact,
   * and the second paragraph is the one that gets skipped. Merged — so this
   * asserts the FACTS are present, wherever they sit, rather than pinning the
   * layout that happened to carry them.
   */
  it('and states how coarse the area data is, beside the comparison', () => {
    mount(listing(), { sector: sector(FIVE) });
    const said = txt();
    expect(said, 'the resolution of the data').toMatch(/1,500 people/);
    expect(said, 'and what that means').toMatch(/cannot tell one street from the next/i);
    expect(said, 'and that it compares size, not quality').toMatch(/compares size, not quality/i);
    // Once, not twice — the duplication is the thing that was removed.
    expect(said.match(/1,500 people/g), 'said once').toHaveLength(1);
  });

  it('with no floor area the comparison says what it is waiting for, once', () => {
    mount(listing({ floorAreaSqm: missing() }), { sector: sector(FIVE) });
    expect(txt()).toContain(C.band.needsArea);
    expect(txt(), 'without restating it').not.toContain(C.numbers.noArea);
  });
});

// ───────────────────────── ZONE TWO ─────────────────────────

describe('zone two — the flags', () => {
  it('is silent about a listing with nothing in it, and SAYS that is not an all clear', () => {
    mount(listing(), { sector: sector([]) });
    expect(txt()).toContain(C.flags.nothing);
    expect(txt(), 'silence must never read as permission').toContain(C.flags.nothingWhy);
  });

  /**
   * X3 — A FLAG NAMES THE CONSEQUENCE, NOT THE PAGE.
   *
   * It used to say "The listing says cash buyers only", then the matched phrase,
   * then "verify with the agent" — three lines telling somebody something
   * already printed in front of them. What they cannot see is WHY it matters.
   */
  it('raises a flag from the listing’s own words, and says what it MEANS', () => {
    mount(listing({ description: found('A terrace. Cash buyers only, please.') }), { sector: sector([]) });
    expect(txt(), 'the label names the thing').toContain(FINDING_COPY.CASH.label);
    expect(txt(), 'and the line names the consequence').toContain(FINDING_COPY.CASH.why);
  });

  it('never reads the page back at you', () => {
    mount(listing({ tenure: found('LEASEHOLD'), description: found('For sale by auction.') }), { sector: sector([]) });
    const said = txt();
    // The old wording, named so it cannot creep back.
    expect(said).not.toMatch(/the listing (says|mentions)/i);
    expect(said, 'the matched phrase is on the page already').not.toMatch(/Found:/);
    expect(said).not.toMatch(/verify with the agent/i);
  });

  it('reads the tenure field as well as the prose', () => {
    mount(listing({ tenure: found('LEASEHOLD') }), { sector: sector([]) });
    expect(txt()).toContain(FINDING_COPY.LEASE.label);
    expect(txt()).toContain(FINDING_COPY.LEASE.why);
  });

  it('never shows more than four', () => {
    mount(listing({
      tenure: found('LEASEHOLD'),
      isAuction: found(true),
      description: found('For sale by auction. Cash buyers only. Tenant in situ. Non-standard construction. Above a shop.'),
    }), { sector: sector([]) });
    expect(document.querySelectorAll('.flag')).toHaveLength(4);
  });

  /**
   * THE HALF THAT IS EASIER TO GET WRONG. The absence of the word "leasehold"
   * does not make a property freehold; it makes the listing silent. There is no
   * negative flag in this product and there cannot be one.
   */
  it('never states what a listing does NOT say', () => {
    mount(listing({ tenure: found('FREEHOLD') }), { sector: sector([]) });
    const said = txt();
    expect(said).not.toMatch(/not (a )?leasehold/i);
    expect(said).not.toMatch(/no flood/i);
    expect(said).not.toMatch(/not listed/i);
    expect(said).not.toMatch(/not an auction/i);
  });
});

// ───────────────────────── FLEXIBILITY ─────────────────────────

describe('possible flexibility', () => {
  it('shows what the listing says about time on the market, as a signal', () => {
    mount(listing({ firstVisibleDate: found('2026-06-01') }), { sector: sector([]) });
    expect(txt()).toContain(C.flexibility.heading);
    expect(txt()).toContain(C.flexibility.caveat);
  });

  /** Silent rather than saying "nothing found", which would read as "firm". */
  it('says nothing at all when the listing shows neither time nor a reduction', () => {
    mount(listing(), { sector: sector([]) });
    expect(txt()).not.toContain(C.flexibility.heading);
  });
});

// ───────────────────────── THE HANDOFF ─────────────────────────

describe('the handoff', () => {
  it('is the last thing on the panel, after both zones', () => {
    mount(listing(), { sector: sector([1800, 1900, 2000, 2100, 2200]) });
    const said = txt();
    expect(said.indexOf(C.numbers.heading)).toBeLessThan(said.indexOf(C.flags.heading));
    expect(said.indexOf(C.flags.heading)).toBeLessThan(said.indexOf(C.handoff.action));
  });

  it('says what it carries', () => {
    mount(listing(), { sector: sector([]) });
    expect(txt()).toContain(C.handoff.why);
  });

  /**
   * NOTHING IS WITHHELD FROM THE PANEL TO FORCE THE CLICK. Everything the panel
   * can honestly say is on the panel before the button, not behind it.
   */
  it('withholds nothing to make the click necessary', () => {
    mount(listing(), { sector: sector([1800, 1900, 2000, 2100, 2200]) });
    const said = txt();
    for (const shown of [C.numbers.asking, C.numbers.perSqm, C.numbers.stampDuty, C.numbers.cashNeeded, C.band.heading]) {
      expect(said, 'on the panel, not behind the button').toContain(shown);
    }
    expect(said).not.toMatch(/unlock|sign in to see|upgrade/i);
  });
});

// ───────────────────────── WHAT WAS REMOVED ─────────────────────────

/**
 * These assert ABSENCE, which is the weakest kind of test — so each names the
 * thing it is looking for by the selector or the words it actually had, and the
 * suite above proves the panel still renders. An empty panel would fail there.
 */
describe('what X1 removed is really gone', () => {
  beforeEach(() => { mount(listing({ tenure: found('LEASEHOLD') }), { sector: sector([1800, 1900, 2000, 2100, 2200]) }); });

  it('no score chip', () => { expect(document.querySelector('.deal-score')).toBeNull(); });
  it('no components list', () => { expect(document.querySelector('.components')).toBeNull(); });
  it('no levers', () => {
    expect(document.querySelector('.levers')).toBeNull();
    for (const id of ['gb-l-rate', 'gb-l-deposit', 'gb-l-buyingAs', 'gb-l-mgmt', 'gb-l-funding']) {
      expect(document.getElementById(id), `${id} is a removed lever`).toBeNull();
    }
  });
  it('no rent, end-value or refurb input', () => {
    for (const id of ['gb-u-rent', 'gb-u-gdv', 'gb-u-arv', 'gb-u-refurbCost', 'gb-u-roomRent', 'gb-u-rooms']) {
      expect(document.getElementById(id), `${id} is a removed input`).toBeNull();
    }
  });
  it('no measure tool and no floor-plan card', () => {
    expect(document.querySelector('.floorplan-card')).toBeNull();
    expect(document.querySelector('.measure-canvas')).toBeNull();
    expect(txt()).not.toMatch(/measure/i);
  });
  it('no comparables or price-versus-sold line', () => {
    expect(txt()).not.toMatch(/nearby sold|sold ceiling|typical\b.*sold/i);
  });
  it('no evidence chips', () => { expect(document.querySelector('.ev-chips')).toBeNull(); });
  it('no seller-signals card with its bands', () => { expect(document.querySelector('.seller-signals')).toBeNull(); });
});

// ───────────────────────── THE STATES THAT SURVIVED ─────────────────────────

describe('the honest states, carried over from the old panel', () => {
  it('the empty state says what to do', () => {
    renderEmpty();
    expect(txt()).toContain('Open a Rightmove or Zoopla listing');
  });

  it('a failure state is one heading, one sentence and one action', () => {
    renderFailure(failureFor('shape-changed'));
    expect(txt()).toContain('The page format changed');
    expect(document.querySelector('.fail-action')).not.toBeNull();
  });

  it('an unreadable postcode reads differently from a Scotland or NI reject', () => {
    mount(listing({ postcode: found('EH1 1AA') }), { sector: null });
    const scottish = txt();
    expect(scottish).toContain('England & Wales only');
    document.body.innerHTML = '<main id="app"></main>';
    mount(listing({ postcode: found('NOTAPOSTCODE') }), { sector: null });
    expect(txt()).toContain('We couldn’t read the postcode');
    expect(txt()).not.toBe(scottish);
  });

  it('a rejected listing shows no numbers it has no right to', () => {
    mount(listing({ postcode: found('EH1 1AA') }), { sector: null });
    expect(txt()).not.toContain(C.numbers.cashNeeded);
    expect(txt()).not.toContain(C.band.heading);
  });
});
