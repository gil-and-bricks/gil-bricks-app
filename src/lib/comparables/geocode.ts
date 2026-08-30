import { getOutcodePostcodes } from '../data/client';
import { DataError } from '../data/client';
import type { CountryCode } from '../data/types';
import { ComparablesError } from './errors';

export interface GeocodedPostcode {
  /** Display form, e.g. "CF37 1DL". */
  postcode: string;
  lat: number;
  lng: number;
  country: CountryCode;
  sectorId: string;
}

// Postcode AREAS entirely outside England & Wales — rejected without a fetch.
// TD and DG straddle the border (DG16 has English postcodes at Gretna), so
// their Scottish postcodes fall through to the (E&W-only) outcode files and
// get the unknown-postcode message instead.
const OUTSIDE_EW = new Set([
  'AB', 'DD', 'EH', 'FK', 'G', 'HS', 'IV', 'KA', 'KW', 'KY', 'ML', 'PA', 'PH', 'ZE', // Scotland
  'BT', // Northern Ireland
  'IM', 'JE', 'GY', // Crown dependencies (not England & Wales either)
]);

/** "cf371dl" / "CF37 1DL" → normalised parts, or null if not postcode-shaped. */
function parsePostcode(raw: string): { key: string; display: string; outcode: string } | null {
  const compact = raw.trim().toUpperCase().replace(/\s+/g, '');
  const m = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/.exec(compact);
  if (!m) return null;
  return { key: compact, display: `${m[1]} ${m[2]}`, outcode: m[1] };
}

export async function geocodePostcode(raw: string): Promise<GeocodedPostcode> {
  const parsed = parsePostcode(raw);
  if (!parsed) {
    throw new ComparablesError('BadInput', `"${raw}" doesn't look like a full UK postcode (e.g. CF37 1DL)`);
  }
  const area = parsed.outcode.replace(/\d.*$/, '');
  if (OUTSIDE_EW.has(area)) {
    throw new ComparablesError('OutsideEnglandWales', 'Sorry — this covers England & Wales only');
  }
  let map;
  try {
    map = await getOutcodePostcodes(parsed.outcode);
  } catch (err) {
    if (err instanceof DataError && err.kind === 'NotFound') {
      throw new ComparablesError(
        'UnknownPostcode',
        `We don't recognise ${parsed.display} — check the postcode, or it may be outside England & Wales`,
      );
    }
    throw err;
  }
  const entry = map[parsed.key];
  if (!entry) {
    throw new ComparablesError(
      'UnknownPostcode',
      `We don't recognise ${parsed.display} — check the postcode, or it may be outside England & Wales`,
    );
  }
  const [lat, lng, country, sectorId] = entry;
  return { postcode: parsed.display, lat, lng, country, sectorId };
}
