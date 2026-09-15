/**
 * D4 review — the ONE reader for carried criteria. A bad or hostile value must
 * never become a threshold: a minimum ICR of 0 is not a criterion, it is a
 * number every rental engine rejects, and accepting it killed the verdict with
 * an unfixable "these numbers don't work together".
 */
import { describe, expect, it } from 'vitest';
import { buildAnalyserHandoff, criteriaFromParams, criteriaToParams, SUBJECT_TENURE_PARAM } from './handoff';
import { found, missing, unavailable } from './types';
import type { NormalisedListing } from './types';

/** A minimal readable listing — every tenure test varies one field of this. */
const base = (): NormalisedListing => ({
  portal: 'rightmove', extractorVersion: 'rm-1.0.0', configVersion: 't', source: 'embedded',
  listingId: found('9'), url: found('https://www.rightmove.co.uk/properties/9'),
  postcode: found('SA1 2HG'), outcode: found('SA1'),
  address: found({ paon: '9', street: 'Earl Street', town: 'Swansea' }),
  askingPrice: found(150_000), propertyType: found('Terraced'), tenure: found('FREEHOLD'),
  bedrooms: found(3), bathrooms: found(1), floorAreaSqm: found(80), floorAreaSqmRange: missing(),
  floorPlanImageUrls: missing(), photoUrls: missing(), newBuild: found(false),
  listingUpdate: missing(), firstVisibleDate: missing(),
  description: found('A terrace.'), isAuction: unavailable(),
  epcUrls: unavailable(), councilTaxBand: unavailable(), leaseYearsRemaining: unavailable(),
  annualGroundRent: unavailable(), annualServiceCharge: unavailable(),
} as unknown as NormalisedListing);

const read = (q: string) => criteriaFromParams(new URLSearchParams(q));
const set = (c: ReturnType<typeof read>) => Object.values(c).filter((v) => v !== undefined);

describe('criteria read back out of a URL', () => {
  it('takes the values a person can actually set', () => {
    expect(read('minCashflow=400&minRoi=12&minIcr=1.5&minProfit=25000')).toEqual({
      minCashflow: 400, minRoi: 12, minIcr: 1.5, minProfit: 25000,
    });
  });

  it('refuses an ICR of zero — it is not a bar, it is a crash', () => {
    expect(read('minIcr=0').minIcr).toBeUndefined();
    expect(read('minIcr=0.5').minIcr).toBeUndefined();
    expect(read('minIcr=1').minIcr).toBe(1);
  });

  it('refuses junk, negatives and absurd values on every key', () => {
    for (const q of ['minCashflow=-1', 'minCashflow=abc', 'minCashflow=1e9', 'minRoi=999', 'minProfit=-5', 'minIcr=99']) {
      expect(set(read(q)), q).toEqual([]);
    }
  });

  it('round-trips: what is written is what is read', () => {
    expect(read(new URLSearchParams(criteriaToParams({ minCashflow: 400, minIcr: 1.5 })).toString())).toEqual({
      minCashflow: 400, minRoi: undefined, minIcr: 1.5, minProfit: undefined,
    });
  });

  it('an empty set is no criteria at all', () => {
    expect(set(read(''))).toEqual([]);
    expect(criteriaToParams({})).toEqual({});
  });
});

/**
 * X1.1 — THE SUBJECT'S TENURE TRAVELS.
 *
 * It never had. The panel showed it, the flags read it, and the analyser was
 * never told — so a leasehold flat arrived looking exactly like a freehold
 * house, and the deal saved from it recorded no lease at all.
 */
describe('the subject tenure', () => {
  const withTenure = (t: string | null): Record<string, string> =>
    buildAnalyserHandoff(
      { ...base(), tenure: t === null ? missing() : found(t) } as NormalisedListing,
      { strategy: 'btl' },
    ).params;

  it.each([
    ['FREEHOLD', 'F'],
    ['Freehold', 'F'],
    ['LEASEHOLD', 'L'],
    ['Leasehold', 'L'],
  ])('carries %s as %s', (word, code) => {
    expect(withTenure(word)[SUBJECT_TENURE_PARAM]).toBe(code);
  });

  /**
   * SHARE OF FREEHOLD IS A LEASE. Matching "freehold" first would call it
   * freehold and hide the lease — the one thing the buyer has to ask about.
   */
  it('calls share of freehold what it is: leasehold', () => {
    expect(withTenure('Share of Freehold')[SUBJECT_TENURE_PARAM]).toBe('L');
    expect(withTenure('share of freehold')[SUBJECT_TENURE_PARAM]).toBe('L');
  });

  it('says nothing when the listing said nothing', () => {
    expect(withTenure(null)[SUBJECT_TENURE_PARAM]).toBeUndefined();
    expect(withTenure('')[SUBJECT_TENURE_PARAM]).toBeUndefined();
    expect(withTenure('commonhold')[SUBJECT_TENURE_PARAM], 'an unknown word is not a guess').toBeUndefined();
  });

  /**
   * IT MUST NOT BE CALLED `tenure`. That key belongs to the analyser's
   * comparables filter, whose allowed values are any/F/L — writing the subject's
   * tenure into it would be clamped away AND would silently narrow the
   * comparables the engine draws on.
   */
  it('never writes the analyser’s own comparables-filter key', () => {
    expect(withTenure('LEASEHOLD').tenure, 'that key is the comps filter, not the subject').toBeUndefined();
    expect(SUBJECT_TENURE_PARAM).not.toBe('tenure');
  });
});
