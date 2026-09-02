/**
 * "EPC lookup" helper: our sector data already carries EPC-matched floor
 * areas per sale, so a subject at a known address can borrow its area.
 * The user's typed value ALWAYS wins; the UI says which source is in use.
 */
import { getSector } from '@gil-bricks/core';
import { geocodePostcode } from '@gil-bricks/core';
import { normaliseAddressKey } from '@gil-bricks/core';

export async function lookupEpcArea(postcode: string, paon: string): Promise<number | null> {
  if (paon.trim() === '') return null;
  try {
    const subject = await geocodePostcode(postcode);
    const sector = await getSector(subject.sectorId);
    const pc = subject.postcode;
    const key = normaliseAddressKey(paon);
    const matches = sector.sales.filter(
      (s) => s.postcode === pc && s.floorAreaSqm !== null && normaliseAddressKey(s.paon) === key,
    );
    const areas = new Set(matches.map((m) => m.floorAreaSqm));
    // multiple addresses (flats) disagreeing on area = ambiguous — never guess
    return areas.size === 1 ? matches[0].floorAreaSqm : null;
  } catch {
    return null;
  }
}
