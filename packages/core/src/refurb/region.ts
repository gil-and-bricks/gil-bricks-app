/**
 * WHICH REGION A POSTCODE IS IN (R2).
 *
 * WHY THIS IS INFERRED RATHER THAN ASKED. We already hold the postcode and the
 * country, and a postcode is better data than a button somebody has to think
 * about. The page says which region it used and offers a way to change it, so
 * the inference is a starting point like everything else in this feature.
 *
 * WHAT THIS IS AND IS NOT. It is a map from postcode AREA (the letters at the
 * front) to the ten standard regions, plus Wales. That is an approximation and
 * it is wrong at some boundaries by design: several areas straddle a regional
 * border — CH covers Cheshire and Flintshire, SY covers Shropshire and Powys,
 * HR reaches into Monmouthshire, TD and DG straddle the Scottish border. The
 * manual override exists exactly for those people, and the copy never claims
 * more certainty than a postcode area can carry.
 *
 * COUNTRY WINS. When the sold-data lookup says a postcode is in Wales, it IS
 * Wales, whatever its letters suggest — that flag comes from ONSPD, which knows
 * the actual boundary. So a Flintshire CH postcode lands in Wales correctly
 * even though CH is otherwise a North West area.
 *
 * NO COSTS LIVE HERE. This file knows geography, not money.
 */
import type { CountryCode } from '../data/types';

export const REGION_IDS = [
  'london', 'south-east', 'east-of-england', 'south-west', 'east-midlands',
  'west-midlands', 'yorkshire-humber', 'north-west', 'north-east', 'wales',
] as const;

export type RegionId = (typeof REGION_IDS)[number];

export function isRegionId(v: string): v is RegionId {
  return (REGION_IDS as readonly string[]).includes(v);
}

/**
 * Postcode area → region. Every England & Wales area appears exactly once;
 * a test asserts that, so a new area cannot be half-added.
 */
const AREA_TO_REGION: Record<string, RegionId> = {
  // London
  E: 'london', EC: 'london', N: 'london', NW: 'london', SE: 'london',
  SW: 'london', W: 'london', WC: 'london', IG: 'london', RM: 'london',
  HA: 'london', UB: 'london', TW: 'london', KT: 'london', SM: 'london',
  CR: 'london', BR: 'london', DA: 'london', EN: 'london', WD: 'london',
  // South East
  BN: 'south-east', CT: 'south-east', GU: 'south-east', ME: 'south-east',
  MK: 'south-east', OX: 'south-east', PO: 'south-east', RG: 'south-east',
  RH: 'south-east', SL: 'south-east', SO: 'south-east', TN: 'south-east',
  HP: 'south-east', AL: 'south-east',
  // East of England
  CB: 'east-of-england', CM: 'east-of-england', CO: 'east-of-england',
  IP: 'east-of-england', LU: 'east-of-england', NR: 'east-of-england',
  PE: 'east-of-england', SG: 'east-of-england', SS: 'east-of-england',
  // South West
  BA: 'south-west', BH: 'south-west', BS: 'south-west', DT: 'south-west',
  EX: 'south-west', GL: 'south-west', PL: 'south-west', SN: 'south-west',
  SP: 'south-west', TA: 'south-west', TQ: 'south-west', TR: 'south-west',
  // East Midlands
  DE: 'east-midlands', LE: 'east-midlands', LN: 'east-midlands',
  NG: 'east-midlands', NN: 'east-midlands',
  // West Midlands
  B: 'west-midlands', CV: 'west-midlands', DY: 'west-midlands',
  HR: 'west-midlands', ST: 'west-midlands', SY: 'west-midlands',
  TF: 'west-midlands', WR: 'west-midlands', WS: 'west-midlands', WV: 'west-midlands',
  // Yorkshire and the Humber
  BD: 'yorkshire-humber', DN: 'yorkshire-humber', HD: 'yorkshire-humber',
  HG: 'yorkshire-humber', HU: 'yorkshire-humber', HX: 'yorkshire-humber',
  LS: 'yorkshire-humber', S: 'yorkshire-humber', WF: 'yorkshire-humber',
  YO: 'yorkshire-humber',
  // North West
  BB: 'north-west', BL: 'north-west', CA: 'north-west', CH: 'north-west',
  CW: 'north-west', FY: 'north-west', L: 'north-west', LA: 'north-west',
  M: 'north-west', OL: 'north-west', PR: 'north-west', SK: 'north-west',
  WA: 'north-west', WN: 'north-west',
  // North East
  DH: 'north-east', DL: 'north-east', NE: 'north-east', SR: 'north-east',
  TS: 'north-east',
  // Wales
  CF: 'wales', LD: 'wales', LL: 'wales', NP: 'wales', SA: 'wales',
};

export const WALES: RegionId = 'wales';

/** The letters at the front of a postcode, e.g. "CF37 1DL" → "CF". */
export function postcodeArea(postcode: string): string {
  const compact = postcode.trim().toUpperCase().replace(/\s+/g, '');
  const m = /^([A-Z]{1,2})/.exec(compact);
  return m ? m[1] : '';
}

/**
 * The region for a postcode, or null when the area is not one we map. Country
 * is authoritative for Wales: ONSPD knows the boundary and the letters do not.
 */
export function regionForPostcode(postcode: string, country?: CountryCode | null): RegionId | null {
  if (country === 'W92000004') return WALES;
  const region = AREA_TO_REGION[postcodeArea(postcode)];
  return region ?? null;
}

/** Every area this map covers — used by the test that checks it is complete. */
export function mappedAreas(): string[] {
  return Object.keys(AREA_TO_REGION);
}
