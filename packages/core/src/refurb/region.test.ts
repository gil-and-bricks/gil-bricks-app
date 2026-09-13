/**
 * REGION INFERENCE (R2). A postcode is better data than a button, but only if
 * it lands in the right region — and the places it cannot are named here rather
 * than pretended away.
 */
import { describe, expect, it } from 'vitest';
import { REGION_IDS, isRegionId, mappedAreas, postcodeArea, regionForPostcode } from './region';

const EW = 'E92000001' as const;
const W = 'W92000004' as const;

describe('real postcodes land in the right region', () => {
  const CASES: [string, string][] = [
    // London
    ['SW1A 1AA', 'london'], ['E14 5AB', 'london'], ['CR0 2RF', 'london'], ['EN1 1AA', 'london'],
    // South East
    ['BN1 1AA', 'south-east'], ['RG1 1AA', 'south-east'], ['OX1 1AA', 'south-east'], ['ME5 9AA', 'south-east'],
    // East of England
    ['CB1 1AA', 'east-of-england'], ['NR1 1AA', 'east-of-england'], ['SS1 1AA', 'east-of-england'],
    // South West
    ['BS1 1AA', 'south-west'], ['EX1 1AA', 'south-west'], ['TR1 1AA', 'south-west'], ['DT2 8AA', 'south-west'],
    // East Midlands
    ['NG1 1AA', 'east-midlands'], ['LE1 1AA', 'east-midlands'], ['DE1 1AA', 'east-midlands'],
    // West Midlands
    ['B1 1AA', 'west-midlands'], ['CV1 1AA', 'west-midlands'], ['ST1 1AA', 'west-midlands'],
    // Yorkshire and the Humber
    ['LS1 1AA', 'yorkshire-humber'], ['S1 1AA', 'yorkshire-humber'], ['HU5 1AA', 'yorkshire-humber'],
    ['BD1 1AA', 'yorkshire-humber'],
    // North West
    ['M1 1AA', 'north-west'], ['L1 1AA', 'north-west'], ['PR1 1AA', 'north-west'], ['OL1 1AA', 'north-west'],
    ['BB1 1AA', 'north-west'], ['WN1 1AA', 'north-west'],
    // North East
    ['NE1 1AA', 'north-east'], ['SR1 1AA', 'north-east'], ['TS1 1AA', 'north-east'], ['DH1 1AA', 'north-east'],
    // Wales
    ['CF10 1AA', 'wales'], ['SA1 6HW', 'wales'], ['LL57 1AA', 'wales'], ['NP20 1AA', 'wales'],
  ];
  for (const [postcode, region] of CASES) {
    it(`${postcode} → ${region}`, () => {
      expect(regionForPostcode(postcode, EW)).toBe(region);
    });
  }
});

describe('the country flag is authoritative for Wales', () => {
  it('a Flintshire CH postcode is Wales, even though CH is otherwise North West', () => {
    // ONSPD knows the boundary; the letters do not. This is the case the
    // postcode-area map would get wrong on its own.
    expect(regionForPostcode('CH7 1AA', EW)).toBe('north-west');
    expect(regionForPostcode('CH7 1AA', W)).toBe('wales');
  });

  it('same for a Powys SY postcode', () => {
    expect(regionForPostcode('SY16 1AA', W)).toBe('wales');
  });
});

describe('shape and completeness', () => {
  it('reads the letters off a postcode in any casing or spacing', () => {
    expect(postcodeArea('cf37 1dl')).toBe('CF');
    expect(postcodeArea('M11AA')).toBe('M');
    expect(postcodeArea(' ne1 1aa ')).toBe('NE');
  });

  it('every mapped area points at a real region', () => {
    for (const area of mappedAreas()) {
      const r = regionForPostcode(`${area}1 1AA`, EW);
      expect(r, area).not.toBeNull();
      expect(isRegionId(String(r)), area).toBe(true);
    }
  });

  it('every region is reachable from at least one postcode area', () => {
    const reached = new Set(mappedAreas().map((a) => regionForPostcode(`${a}1 1AA`, EW)));
    for (const id of REGION_IDS) expect([...reached], id).toContain(id);
  });

  it('an unmapped or nonsense postcode returns null rather than a guess', () => {
    expect(regionForPostcode('ZZ1 1AA', EW)).toBeNull();
    expect(regionForPostcode('', EW)).toBeNull();
    expect(regionForPostcode('not a postcode', EW)).toBeNull();
  });

  it('there are exactly ten regions', () => {
    expect(REGION_IDS).toHaveLength(10);
  });
});
