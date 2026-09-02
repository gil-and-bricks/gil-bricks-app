/**
 * Pure postcode → sector mapping + England-&-Wales gate (E5). No network: the
 * sector id is derived from the postcode string itself, so the extension can
 * later look up our own R2 sector data (sectors/<OUTCODE>/<OUTCODE>-<n>.json).
 * Scotland/NI/Crown-dependency areas are rejected with the SAME honest message
 * the web app uses. Definitive E-vs-W country still comes from ONSPD when the
 * sector data is fetched — this module only rejects the clearly-outside cases.
 */

// Postcode AREAS entirely outside England & Wales (mirrors comparables/geocode).
// TD/DG straddle the border, so they fall through to the sector lookup rather
// than being hard-rejected here.
export const OUTSIDE_EW: ReadonlySet<string> = new Set([
  'AB', 'DD', 'EH', 'FK', 'G', 'HS', 'IV', 'KA', 'KW', 'KY', 'ML', 'PA', 'PH', 'ZE', // Scotland
  'BT', // Northern Ireland
  'IM', 'JE', 'GY', // Crown dependencies (not England & Wales)
]);

export const ENGLAND_WALES_ONLY_MESSAGE = 'Sorry — this covers England & Wales only';

export interface ParsedPostcode {
  /** Display form, e.g. "SA1 8AJ". */
  display: string;
  /** Compact upper form, e.g. "SA18AJ". */
  key: string;
  /** e.g. "SA1". */
  outcode: string;
  /** Postcode area letters, e.g. "SA". */
  area: string;
  /** Inward code, e.g. "8AJ". */
  incode: string;
  /** Postcode sector, e.g. "SA1 8". */
  sector: string;
}

/** "sa1 8aj" / "SA18AJ" → parts, or null if not a full-postcode shape. */
export function parseUkPostcode(raw: string): ParsedPostcode | null {
  const compact = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const m = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/.exec(compact);
  if (!m) return null;
  const outcode = m[1];
  const incode = m[2];
  return {
    display: `${outcode} ${incode}`,
    key: compact,
    outcode,
    area: outcode.replace(/\d.*$/, ''),
    incode,
    sector: `${outcode} ${incode[0]}`,
  };
}

export type PostcodeSector =
  | { inEnglandWales: true; postcode: string; outcode: string; sector: string }
  | { inEnglandWales: false; reason: 'outside-england-wales' | 'not-a-postcode'; message: string };

/**
 * Map a postcode to its sector, rejecting Scotland/NI/Crown-dependency areas
 * and anything that isn't postcode-shaped. Pure and synchronous.
 */
export function postcodeToSector(raw: string): PostcodeSector {
  const parsed = parseUkPostcode(raw);
  if (!parsed) {
    return {
      inEnglandWales: false,
      reason: 'not-a-postcode',
      message: `"${String(raw ?? '').trim()}" doesn't look like a full UK postcode (e.g. SA1 8AJ)`,
    };
  }
  if (OUTSIDE_EW.has(parsed.area)) {
    return { inEnglandWales: false, reason: 'outside-england-wales', message: ENGLAND_WALES_ONLY_MESSAGE };
  }
  return { inEnglandWales: true, postcode: parsed.display, outcode: parsed.outcode, sector: parsed.sector };
}
