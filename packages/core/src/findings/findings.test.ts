// @vitest-environment happy-dom
/**
 * X2 — THE FINDINGS, AND THE THINGS THEY MAY NEVER SAY.
 *
 * Most of this file is about restraint: what does NOT appear, on which listing,
 * and why. These get printed on a page somebody else owns, beside an agent's
 * name, so a wrong one is not a cosmetic bug.
 */
import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractListing, portalForUrl, FALLBACK_CONFIG, type NormalisedListing } from '../listing/index';
import { allFindings, pageFindings, findingCodes, findingsFromCodes, FINDING_RULES, type FindingCode } from './findings';
import { FINDING_COPY } from './copy';
import { found, missing, unavailable } from '../listing/types';

const CORPUS = join(process.cwd(), 'fixtures', 'listings');

function read(portal: 'rightmove' | 'zoopla', file: string, url: string): NormalisedListing {
  const w = new Window({
    url,
    settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
  });
  w.document.write(readFileSync(join(CORPUS, portal, file), 'utf8'));
  const r = extractListing(portal, w.document as unknown as Document, FALLBACK_CONFIG, url);
  if (!r.ok) throw new Error(`${file}: ${r.reason}`);
  return r.listing;
}

const RM_LEASE = () => read('rightmove', 'rightmove-reduced-terrace-leasehold.html', 'https://www.rightmove.co.uk/properties/167112923');
const RM_FREEHOLD = () => read('rightmove', 'rightmove-reduced-detached-freehold.html', 'https://www.rightmove.co.uk/properties/88376352');
const ZP_SEMI = () => read('zoopla', 'zoopla-newbuild-semi-floorplan.html', 'https://www.zoopla.co.uk/for-sale/details/73379642/');
const ZP_AUCTION = () => read('zoopla', 'zoopla-auction-terrace-floorplan.html', 'https://www.zoopla.co.uk/for-sale/details/73975876/');

const codes = (l: NormalisedListing): FindingCode[] => allFindings(l).map((f) => f.code);

/** A synthetic listing, for the cases the corpus does not happen to contain. */
function synth(over: Partial<NormalisedListing> = {}): NormalisedListing {
  return {
    portal: 'rightmove', extractorVersion: 't', configVersion: 't', source: 'embedded',
    listingId: found('1'), url: found('x'), postcode: found('SA1 2HG'), outcode: found('SA1'),
    address: found({ paon: '9' }), askingPrice: found(150_000), propertyType: found('Terraced'),
    tenure: found('FREEHOLD'), bedrooms: found(3), bathrooms: found(1),
    floorAreaSqm: found(80), floorAreaSqmRange: missing(),
    floorPlanImageUrls: found(['https://x/p.jpg']), photoUrls: found(['https://x/1.jpg']),
    newBuild: found(false), listingUpdate: missing(), firstVisibleDate: missing(),
    description: found('A terrace.'), isAuction: unavailable(),
    epcUrls: found(['https://x/epc.png']), councilTaxBand: found('B'),
    leaseYearsRemaining: unavailable(), annualGroundRent: unavailable(), annualServiceCharge: unavailable(),
    ...over,
  } as NormalisedListing;
}

describe('risks come from the listing’s own words', () => {
  it('a leasehold listing is flagged, and carries the words that did it', () => {
    const f = allFindings(RM_LEASE()).find((x) => x.code === 'LEASE');
    expect(f).toBeDefined();
    expect(f!.kind).toBe('risk');
    expect(f!.matched, 'the reader can judge the match themselves').toBeTruthy();
  });

  it('an auction listing is flagged on both portals', () => {
    expect(codes(RM_LEASE())).toContain('AUCT');
    expect(codes(ZP_AUCTION())).toContain('AUCT');
  });

  it('a freehold listing is never flagged leasehold', () => {
    expect(codes(RM_FREEHOLD())).not.toContain('LEASE');
  });
});

describe('gaps are only raised where the portal publishes the field', () => {
  /**
   * THE ONE THAT MATTERS MOST. Zoopla publishes nothing for lease length,
   * ground rent or service charge. Raising those would accuse every agent on
   * Zoopla of an omission that is really our own blind spot.
   */
  it.each(['NOLEASE', 'NOGR', 'NOSC'] as const)('never raises %s on a Zoopla listing', (code) => {
    for (const l of [ZP_SEMI(), ZP_AUCTION()]) {
      expect(codes(l), `${code} on ${l.listingId.value}`).not.toContain(code);
    }
  });

  it('raises them on Rightmove, where the field really is blank', () => {
    const c = codes(RM_LEASE());
    expect(c).toContain('NOLEASE');
    expect(c).toContain('NOGR');
    expect(c).toContain('NOSC');
  });

  /**
   * THE LEASE QUESTIONS ONLY APPLY TO A LEASE. Rightmove emits blank ground-rent
   * fields on freehold houses too. Without the tenure check, every freehold
   * house in the country would carry "No ground rent" — which is not an
   * omission on a freehold, it is the correct answer.
   */
  it('never asks a freehold house about its ground rent or service charge', () => {
    const c = codes(RM_FREEHOLD());
    expect(RM_FREEHOLD().tenure.value).toBe('FREEHOLD');
    expect(c).not.toContain('NOGR');
    expect(c).not.toContain('NOSC');
    expect(c).not.toContain('NOLEASE');
  });

  it('a listing with no floor plan says so; one with a plan does not', () => {
    expect(codes(synth({ floorPlanImageUrls: missing() }))).toContain('NOPLAN');
    expect(codes(synth())).not.toContain('NOPLAN');
  });

  /** A published-but-empty list is the listing giving nothing — that is a gap. */
  it('an EPC slot the portal published but left empty is a gap', () => {
    expect(codes(synth({ epcUrls: found([]) }))).toContain('NOEPC');
    expect(codes(synth({ epcUrls: found(['https://x/e.png']) }))).not.toContain('NOEPC');
  });

  it('a field the portal does not publish at all is never a gap', () => {
    expect(codes(synth({ councilTaxBand: unavailable() }))).not.toContain('NOCT');
    expect(codes(synth({ councilTaxBand: missing() })), 'but a blank one is').toContain('NOCT');
  });
});

/**
 * THE FALLBACK GATE. When the page model does not parse, both extractors drop to
 * the og: meta tags — a path that records nearly everything as `missing`,
 * because that is also what "we looked and it was not there" means.
 *
 * Without the gate, one portal redesign would print "No floor plan" and "No
 * floor area" on every listing in the country, beside an agent's name, on the
 * agent's own page.
 */
describe('a fallback read raises no gaps at all', () => {
  const fallback = (over: Partial<NormalisedListing> = {}) =>
    synth({ source: 'dom', floorPlanImageUrls: missing(), floorAreaSqm: missing(),
      tenure: missing(), councilTaxBand: missing(), epcUrls: missing(), ...over });

  it('says nothing about fields it never looked at', () => {
    const c = codes(fallback());
    for (const gap of ['NOPLAN', 'NOAREA', 'NOTEN', 'NOCT', 'NOEPC']) {
      expect(c, `${gap} on a fallback read blames the agent for our parse failure`).not.toContain(gap);
    }
  });

  it('but the SAME listing read properly does raise them', () => {
    const c = codes(synth({ source: 'embedded', floorPlanImageUrls: missing(), floorAreaSqm: missing() }));
    expect(c).toContain('NOPLAN');
    expect(c).toContain('NOAREA');
  });

  /** Risks still work: they read the description, which the fallback recovers. */
  it('still reports what the listing SAYS, because that it did read', () => {
    expect(codes(fallback({ description: found('Cash buyers only.') }))).toContain('CASH');
  });
});

describe('four at most, ranked by what changes a decision', () => {
  it('never returns more than four for the page', () => {
    const busy = synth({
      tenure: found('LEASEHOLD'),
      isAuction: found(true),
      description: found('For sale by auction. Cash buyers only. Tenant in situ. Non-standard construction. Above a shop.'),
      floorPlanImageUrls: missing(), epcUrls: found([]), floorAreaSqm: missing(),
      councilTaxBand: missing(), leaseYearsRemaining: missing(),
      annualGroundRent: missing(), annualServiceCharge: missing(),
    });
    expect(allFindings(busy).length, 'there really are more than four to choose from').toBeGreaterThan(4);
    expect(pageFindings(busy)).toHaveLength(FINDING_RULES.max);
  });

  it('puts the risks first — a risk can end the deal, a gap only slows it', () => {
    const busy = synth({
      tenure: found('LEASEHOLD'),
      description: found('Cash buyers only.'),
      floorPlanImageUrls: missing(), councilTaxBand: missing(),
    });
    const page = pageFindings(busy);
    const firstGap = page.findIndex((f) => f.kind === 'gap');
    const lastRisk = page.map((f) => f.kind).lastIndexOf('risk');
    if (firstGap !== -1 && lastRisk !== -1) expect(lastRisk).toBeLessThan(firstGap);
  });

  it('never repeats the same finding twice', () => {
    const c = pageFindings(RM_LEASE()).map((f) => f.code);
    expect(new Set(c).size).toBe(c.length);
  });

  it('the deal’s own page may show them all — the cap is for somebody else’s page', () => {
    const busy = synth({
      tenure: found('LEASEHOLD'), description: found('Cash buyers only. Tenant in situ.'),
      floorPlanImageUrls: missing(), epcUrls: found([]), councilTaxBand: missing(),
      leaseYearsRemaining: missing(), annualGroundRent: missing(),
    });
    expect(allFindings(busy).length).toBeGreaterThan(pageFindings(busy).length);
  });
});

describe('the codes that travel', () => {
  it('round-trip: what is written is read back', () => {
    const f = pageFindings(RM_LEASE());
    expect(findingsFromCodes(findingCodes(f))).toEqual(f.map((x) => x.code));
  });

  it('is short enough for a URL — codes, never sentences', () => {
    expect(findingCodes(pageFindings(RM_LEASE())).length).toBeLessThan(40);
  });

  it('drops anything this build does not recognise, rather than rendering it', () => {
    expect(findingsFromCodes('LEASE NOPE NOCT')).toEqual(['LEASE', 'NOCT']);
    expect(findingsFromCodes('')).toEqual([]);
    expect(findingsFromCodes(null)).toEqual([]);
    expect(findingsFromCodes('LEASE LEASE'), 'and never the same one twice').toEqual(['LEASE']);
  });
});

/**
 * THE COPY RULES, ENFORCED. These words go on a page somebody else owns, so the
 * limits are tested rather than trusted.
 */
describe('every word a finding can say', () => {
  const ALL = Object.entries(FINDING_COPY);

  it('every code has words, and no code has words it does not need', () => {
    const used = new Set(Object.keys(FINDING_COPY));
    for (const c of ['LEASE', 'AUCT', 'TENANT', 'CASH', 'CONSTR', 'COMM',
      'NOPLAN', 'NOEPC', 'NOAREA', 'NOTEN', 'NOCT', 'NOLEASE', 'NOGR', 'NOSC']) {
      expect(used.has(c), `${c} has no words`).toBe(true);
    }
    expect(used.size).toBe(14);
  });

  /**
   * A CHIP IS AN IDENTIFIER, NOT A LESSON. Three words, because the shortest
   * honest name for several of these needs three — and a length cap that forced
   * worse English would be the wrong rule. What it really forbids is a sentence,
   * and it is backed by a character limit so three long words cannot smuggle one
   * in.
   */
  it.each(ALL)('%s is at most three words on the chip', (code, words) => {
    const n = words.label.trim().split(/\s+/).length;
    expect(n, `"${words.label}" is ${n} words — a chip is an identifier, not a lesson`).toBeLessThanOrEqual(3);
    expect(words.label.length, `"${words.label}" is too long to read at a glance`).toBeLessThanOrEqual(26);
    expect(words.label, 'a chip never ends in a full stop').not.toMatch(/[.!?]$/);
  });

  it.each(ALL)('%s explains itself in ONE short line', (code, words) => {
    expect(words.why.split(/\s+/).length, words.why).toBeLessThanOrEqual(20);
    // Two sentences at most, and the second only ever the thing to do.
    expect(words.why.split(/[.!?]+\s/).filter(Boolean).length, words.why).toBeLessThanOrEqual(2);
  });

  /**
   * NO JARGON. Somebody who reads our wording and repeats it to an agent is
   * marked out by it, and that damages them.
   */
  it.each(ALL)('%s uses no investor jargon', (code, words) => {
    const said = `${words.label} ${words.why}`.toLowerCase();
    for (const term of ['bmv', 'below market', 'off-market', 'off market', 'motivated seller',
      'stacking', 'stack up', 'yield play', 'cash cow', 'no money down', 'distressed']) {
      expect(said, `"${term}" in ${code}`).not.toContain(term);
    }
  });

  /** The same law as the panel: warn and point out, never bless. */
  it.each(ALL)('%s never endorses anything', (code, words) => {
    const said = `${words.label} ${words.why}`.toLowerCase();
    for (const term of ['good', 'great', 'bargain', 'opportunity', 'cheap', 'worth buying', 'safe bet']) {
      expect(said, `"${term}" in ${code}`).not.toContain(term);
    }
  });

  /**
   * NEVER STATE AN ABSENCE AS A FACT. "The listing does not give a lease
   * length" is a fact about the listing. "There is no lease" would be a claim
   * about a title nobody here has read.
   */
  it.each(ALL.filter(([c]) => c.startsWith('NO')))('%s blames the listing, never the property', (code, words) => {
    const said = words.why.toLowerCase();
    for (const claim of ['there is no', 'has no ', 'does not have', 'it is not']) {
      expect(said, `"${claim}" in ${code} states an absence as a fact`).not.toContain(claim);
    }
  });
});

/**
 * X2 — AN OLDER LISTING SHAPE MUST NEVER TAKE THE HANDOFF DOWN.
 *
 * `allFindings` runs inside `buildAnalyserHandoff` now. A caller holding a
 * listing object from before these five fields existed hands over something
 * without them — and a thrown TypeError there would lose the whole handoff:
 * the photographs, the floor plan, the auction flag, everything.
 *
 * A field that is not there is OUR version skew, not the agent's omission, so
 * it is silence — never a chip.
 */
describe('a listing from an older build', () => {
  const older = (): NormalisedListing => {
    const l = synth({ tenure: found('LEASEHOLD') }) as unknown as Record<string, unknown>;
    for (const k of ['epcUrls', 'councilTaxBand', 'leaseYearsRemaining', 'annualGroundRent', 'annualServiceCharge']) {
      delete l[k];
    }
    return l as unknown as NormalisedListing;
  };

  it('does not throw', () => {
    expect(() => allFindings(older())).not.toThrow();
  });

  it('raises no gap for a field that simply is not there', () => {
    const c = allFindings(older()).map((f) => f.code);
    for (const gap of ['NOEPC', 'NOCT', 'NOLEASE', 'NOGR', 'NOSC']) {
      expect(c, `${gap} from a field this build added`).not.toContain(gap);
    }
  });

  it('still reads what the listing SAYS, which every build has had', () => {
    expect(allFindings(older()).map((f) => f.code)).toContain('LEASE');
  });

  /** And the same for a listing missing even its description. */
  it('survives a listing missing almost everything', () => {
    const bare = { portal: 'rightmove', source: 'embedded' } as unknown as NormalisedListing;
    expect(() => allFindings(bare)).not.toThrow();
    expect(allFindings(bare)).toEqual([]);
  });
});
