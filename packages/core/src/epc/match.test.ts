import { describe, expect, it } from 'vitest';
import { candidateKey, keyMatches, matchCandidates, type EpcCandidate } from './match';

/**
 * Address matching against the EPC register (E1) — the hard part of the sprint.
 *
 * The register is keyed by postcode plus free text written by whoever lodged
 * the certificate, so the same flat appears half a dozen ways. Getting this
 * wrong does not fail loudly: it returns SOMEBODY ELSE'S floor area, confidently,
 * into a field that drives the Deal Score. Every rule here exists because it
 * would otherwise do that.
 */
const cert = (line1: string, over: Partial<EpcCandidate> = {}): EpcCandidate => ({
  certificateNumber: '0000-0000-0000-0000-0001',
  addressLine1: line1,
  addressLine2: null,
  addressLine3: null,
  addressLine4: null,
  postcode: 'CF37 1DL',
  registrationDate: '2020-01-01',
  ...over,
});

describe('the address key', () => {
  it('joins the register’s address lines, however it spread them', () => {
    expect(candidateKey(cert('Flat 2', { addressLine2: '8 Tyfica Road' }))).toBe('FLAT 2 8 TYFICA ROAD');
    expect(candidateKey(cert('Flat 2, 8 Tyfica Road'))).toBe('FLAT 2 8 TYFICA ROAD');
  });

  it('is punctuation- and case-blind, because lodgements are not consistent', () => {
    expect(candidateKey(cert('FLAT 2, 8  TYFICA  ROAD'))).toBe(candidateKey(cert('flat 2 8 tyfica road')));
  });
});

describe('a number must not match a longer number', () => {
  it('8 does not match 80 — the bug that would quietly return a stranger’s area', () => {
    expect(keyMatches('80 TYFICA ROAD', '8')).toBe(false);
    expect(keyMatches('8 TYFICA ROAD', '8')).toBe(true);
  });

  it('the whole key can be the address, with no street at all', () => {
    expect(keyMatches('8', '8')).toBe(true);
  });

  it('an empty ask matches nothing', () => {
    expect(keyMatches('8 TYFICA ROAD', '')).toBe(false);
  });
});

describe('matching a house', () => {
  const road = [cert('8 Tyfica Road'), cert('80 Tyfica Road'), cert('10 Tyfica Road')];

  it('finds the one house asked for', () => {
    const { matches } = matchCandidates(road, { paon: '8' });
    expect(matches.map((m) => m.addressLine1)).toEqual(['8 Tyfica Road']);
  });

  it('finds nothing when the house is not on the register', () => {
    const { matches, subBuildingsFound } = matchCandidates(road, { paon: '9' });
    expect(matches).toEqual([]);
    expect(subBuildingsFound).toBe(false);
  });

  it('matches a named house, not just a numbered one', () => {
    const { matches } = matchCandidates([cert('Rose Cottage, Church Lane')], { paon: 'Rose Cottage' });
    expect(matches).toHaveLength(1);
  });
});

describe('matching a flat', () => {
  const block = [
    cert('Flat 1, 8 Tyfica Road'),
    cert('Flat 2, 8 Tyfica Road'),
    cert('Flat 10, 8 Tyfica Road'),
  ];

  it('finds the flat asked for', () => {
    const { matches } = matchCandidates(block, { paon: '8', saon: 'Flat 2' });
    expect(matches.map((m) => m.addressLine1)).toEqual(['Flat 2, 8 Tyfica Road']);
  });

  it('flat 1 does not match flat 10', () => {
    const { matches } = matchCandidates(block, { paon: '8', saon: 'Flat 1' });
    expect(matches.map((m) => m.addressLine1)).toEqual(['Flat 1, 8 Tyfica Road']);
  });

  it('accepts the flat written either way round, because lodgements vary', () => {
    const odd = [cert('8 Tyfica Road, Flat 2')];
    expect(matchCandidates(odd, { paon: '8', saon: 'Flat 2' }).matches).toHaveLength(1);
  });

  it('accepts a bare flat number without the word "flat"', () => {
    const bare = [cert('2, 8 Tyfica Road')];
    expect(matchCandidates(bare, { paon: '8', saon: '2' }).matches).toHaveLength(1);
  });

  it('ASKING FOR THE BUILDING when it is flats returns nothing, and says why', () => {
    // The whole point: "8 Tyfica Road" is not any one of these flats. Handing
    // back Flat 1's area would be a wrong number stated with confidence.
    const { matches, subBuildingsFound } = matchCandidates(block, { paon: '8' });
    expect(matches).toEqual([]);
    expect(subBuildingsFound, 'the caller must be able to say "it is divided"').toBe(true);
  });
});

describe('several certificates at one address', () => {
  it('puts the newest first, because a re-certified home has more than one', () => {
    const two = [
      cert('8 Tyfica Road', { certificateNumber: 'OLD', registrationDate: '2011-05-02' }),
      cert('8 Tyfica Road', { certificateNumber: 'NEW', registrationDate: '2024-08-19' }),
    ];
    expect(matchCandidates(two, { paon: '8' }).matches.map((m) => m.certificateNumber)).toEqual(['NEW', 'OLD']);
  });

  it('a certificate with no date sorts last — it cannot be shown to be newest', () => {
    const two = [
      cert('8 Tyfica Road', { certificateNumber: 'UNDATED', registrationDate: null }),
      cert('8 Tyfica Road', { certificateNumber: 'DATED', registrationDate: '2019-01-01' }),
    ];
    expect(matchCandidates(two, { paon: '8' }).matches.map((m) => m.certificateNumber)).toEqual(['DATED', 'UNDATED']);
  });
});

describe('a postcode with many properties', () => {
  it('picks one out of eighty without breaking a sweat', () => {
    const many = Array.from({ length: 80 }, (_, i) => cert(`${i + 1} Long Road`));
    const { matches } = matchCandidates(many, { paon: '47' });
    expect(matches.map((m) => m.addressLine1)).toEqual(['47 Long Road']);
  });
});

describe('nothing to go on', () => {
  it('an empty house number matches nothing rather than everything', () => {
    expect(matchCandidates([cert('8 Tyfica Road')], { paon: '' }).matches).toEqual([]);
    expect(matchCandidates([cert('8 Tyfica Road')], { paon: '  ' }).matches).toEqual([]);
  });

  it('an empty candidate list is simply no match', () => {
    expect(matchCandidates([], { paon: '8' }).matches).toEqual([]);
  });
});

describe('a part of a building is never the building', () => {
  /**
   * The register writes a flat before the number AND after the street. The
   * second form satisfies a plain prefix match on the house number, so without
   * a guard a flat's floor area is returned as the whole building's — the
   * worst outcome this code has, because it is a wrong number that looks right.
   */
  const layouts = [
    'Flat 2, 8 Tyfica Road',
    '8 Tyfica Road, Flat 2',
    '8 Tyfica Road, Apartment 2',
    'Apartment 2, 8 Tyfica Road',
    '8 Tyfica Road, Unit 2',
    '8 Tyfica Road, Basement Flat',
    'Room 3, 8 Tyfica Road',
  ];

  for (const layout of layouts) {
    it(`"${layout}" does not answer a bare ask for 8`, () => {
      const { matches, subBuildingsFound } = matchCandidates([cert(layout)], { paon: '8' });
      expect(matches, 'a flat is not the building').toEqual([]);
      expect(subBuildingsFound, 'and the caller must be able to say why').toBe(true);
    });
  }

  it('but the flat is still found when it is actually asked for', () => {
    expect(matchCandidates([cert('8 Tyfica Road, Flat 2')], { paon: '8', saon: 'Flat 2' }).matches)
      .toHaveLength(1);
  });

  it('a plain house is unaffected', () => {
    expect(matchCandidates([cert('8 Tyfica Road')], { paon: '8' }).matches).toHaveLength(1);
  });

  it('a street whose NAME contains a sub-building word is not mistaken for one', () => {
    // "Flatts Lane" is a street. Whole-word matching is what saves it.
    expect(matchCandidates([cert('8 Flatts Lane')], { paon: '8' }).matches).toHaveLength(1);
  });
});
