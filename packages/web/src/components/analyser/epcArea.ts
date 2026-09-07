/**
 * "EPC lookup" helper: our sector data already carries EPC-matched floor
 * areas per sale, so a subject at a known address can borrow its area.
 * The user's typed value ALWAYS wins; the UI says which source is in use.
 *
 * WHY THIS RETURNS A REASON, NOT `null` (S1). It used to be
 * `catch { return null }` around the whole thing, so SIX different outcomes —
 * no postcode typed, an unknown postcode, a Scottish one, our data being
 * unreachable, no sold record at that address, and flats disagreeing about the
 * size — all came out as the same `null`. The screen then said "No EPC match
 * found for this address" to every one of them: it blamed the address for our
 * outage, and told someone who had simply not typed a postcode to go and check
 * their house number. The information was never missing — `geocodePostcode`
 * throws a typed error for each case — it was being thrown away one line later.
 *
 * So the lookup reports WHICH thing happened and the form says the true thing.
 */
import { ComparablesError, DataError, getSector, geocodePostcode, normaliseAddressKey } from '@gil-bricks/core';
import type { Sale } from '@gil-bricks/core';

/** Why a lookup produced no area. One per thing the person can actually do. */
export type EpcFailure =
  /** No postcode typed, or not a full one — nothing to look in. */
  | 'needs-postcode'
  /** A full postcode we hold no record of. */
  | 'unknown-postcode'
  /** Scotland or Northern Ireland: outside what this covers at all. */
  | 'outside-ew'
  /** OUR fault: the sold-price data did not answer, or came back malformed. */
  | 'unavailable'
  /** The data loaded fine; no sold record at that address carries a floor area. */
  | 'no-match'
  /** Several addresses share that number and disagree on size — never guess. */
  | 'ambiguous';

export type EpcResult = { ok: true; sqm: number } | { ok: false; reason: EpcFailure };

/**
 * Which failure an error from the data layer represents. Split out so it can be
 * tested against real error objects — the collapse this file exists to fix was
 * invisible precisely because nothing could see inside the catch.
 */
export function epcFailureFor(err: unknown): EpcFailure {
  if (err instanceof ComparablesError) {
    if (err.kind === 'BadInput') return 'needs-postcode';
    if (err.kind === 'OutsideEnglandWales') return 'outside-ew';
    if (err.kind === 'UnknownPostcode') return 'unknown-postcode';
    return 'unavailable';
  }
  if (err instanceof DataError) {
    // A sector file we do not hold is not the person's mistake, but it is also
    // not an outage: there is simply nothing sold to match against.
    return err.kind === 'NotFound' ? 'no-match' : 'unavailable';
  }
  return 'unavailable';
}

/**
 * The area for one address out of a sector's sales. Pure, so the matching rules
 * can be tested without the network.
 */
export function areaFromSales(sales: readonly Sale[], postcode: string, paon: string): EpcResult {
  const key = normaliseAddressKey(paon);
  // A malformed ROW must not throw. `assertSectorFile` spot-checks only the
  // first sale, so a corrupt second row reaches us intact; a throw here would
  // reject the promise and leave the button stuck on its busy label forever.
  const matches = (sales ?? []).filter(
    (s) => s != null && s.postcode === postcode && s.floorAreaSqm != null
      && normaliseAddressKey(s.paon) === key,
  );
  if (matches.length === 0) return { ok: false, reason: 'no-match' };
  const areas = new Set(matches.map((m) => m.floorAreaSqm));
  // Multiple addresses (flats) disagreeing on area = ambiguous. Never guess:
  // say so, so the person knows to type the size themselves.
  if (areas.size > 1) return { ok: false, reason: 'ambiguous' };
  return { ok: true, sqm: matches[0].floorAreaSqm as number };
}

export async function lookupEpcArea(postcode: string, paon: string): Promise<EpcResult> {
  if (paon.trim() === '') return { ok: false, reason: 'no-match' };
  if (postcode.trim() === '') return { ok: false, reason: 'needs-postcode' };
  try {
    const subject = await geocodePostcode(postcode);
    const sector = await getSector(subject.sectorId);
    // INSIDE the try on purpose. This used to sit outside it, so anything the
    // matching threw became an unhandled rejection and the caller's busy flag
    // was never cleared — a permanently dead button, which is worse than the
    // wrong message this file was written to fix.
    return areaFromSales(sector.sales, subject.postcode, paon);
  } catch (err) {
    return { ok: false, reason: epcFailureFor(err) };
  }
}
