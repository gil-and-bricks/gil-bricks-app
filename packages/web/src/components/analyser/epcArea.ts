/**
 * The floor-area lookup behind the analyser's "EPC lookup" button (E1).
 *
 * WHAT IT USED TO DO, AND WHY THAT WAS WRONG. It searched our own monthly
 * sold-price data for a transaction at the address that happened to carry an
 * EPC-joined floor area. So it answered only for a property that had SOLD
 * recently AND matched a certificate when the data was built — perhaps a
 * twentieth of the houses anyone types in. A house last sold in 2004 got "no
 * sold record with a floor area", which is true and useless: the certificate
 * exists, we simply were not looking at the register.
 *
 * WHAT IT DOES NOW. Asks the register, through our own Worker, which holds the
 * bearer token the browser must never see. If the register cannot be reached it
 * falls back to the sold-data match, which is instant and still right when it
 * has an answer. The result always says WHICH of the two it came from, because
 * "from the EPC register" and "from a sale in our data" are different claims.
 *
 * WHY THE FALLBACK IS NOT A SILENT ONE: `source` is on every success, the
 * badge shows it, and the two are never blended.
 */
import { getSector, geocodePostcode, ComparablesError, DataError, type EpcResult, type Sale } from '@gil-bricks/core';
import { features } from '../../config/features';
import { EPC_LOOKUP } from '../../config/epc';

export type { EpcResult };
export type EpcFailure = Extract<EpcResult, { ok: false }>['reason'];

/**
 * Which failure an error from OUR data layer represents. The register has its
 * own reasons; this is only for the sold-data fallback path.
 */
export function epcFailureFor(err: unknown): EpcFailure {
  if (err instanceof ComparablesError) {
    if (err.kind === 'BadInput') return 'needs-postcode';
    if (err.kind === 'OutsideEnglandWales') return 'outside-ew';
    if (err.kind === 'UnknownPostcode') return 'unknown-postcode';
    return 'unavailable';
  }
  if (err instanceof DataError) {
    return err.kind === 'NotFound' ? 'no-match' : 'unavailable';
  }
  return 'unavailable';
}

/**
 * The area for one address out of a sector's sales. Pure, so the matching rules
 * can be tested without the network.
 */
export function areaFromSales(sales: readonly Sale[], postcode: string, paon: string): EpcResult {
  const key = normaliseKey(paon);
  // A malformed ROW must not throw. `assertSectorFile` spot-checks only the
  // first sale, so a corrupt second row reaches us intact; a throw here would
  // reject the promise and leave the button stuck on its busy label forever.
  const matches = (sales ?? []).filter(
    (s) => s != null && s.postcode === postcode && s.floorAreaSqm != null && normaliseKey(s.paon) === key,
  );
  if (matches.length === 0) return { ok: false, reason: 'no-match' };
  const areas = new Set(matches.map((m) => m.floorAreaSqm));
  // Multiple addresses (flats) disagreeing on area = ambiguous. Never guess:
  // say so, so the person knows to type the size themselves.
  if (areas.size > 1) return { ok: false, reason: 'ambiguous' };
  return { ok: true, sqm: matches[0].floorAreaSqm as number, source: 'sold-data' };
}

function normaliseKey(s: string | undefined | null): string {
  return (s ?? '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/ +/g, ' ').trim();
}

/** Ask our Worker, which asks the register. Never throws: a throw is a reason. */
export async function lookupFromRegister(
  postcode: string,
  paon: string,
  saon: string,
  doFetch: typeof fetch = fetch,
): Promise<EpcResult> {
  const qs = new URLSearchParams({ postcode, paon, saon });
  try {
    const res = await doFetch(`${EPC_LOOKUP.endpoint}?${qs.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(EPC_LOOKUP.clientTimeoutMs),
    });
    if (!res.ok) return { ok: false, reason: 'unavailable' };
    const body = (await res.json()) as EpcResult;
    if (typeof body !== 'object' || body === null || typeof (body as { ok?: unknown }).ok !== 'boolean') {
      return { ok: false, reason: 'unavailable' };
    }
    return body;
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

/** The sold-data match: instant, and still right whenever it has an answer. */
export async function lookupFromSoldData(postcode: string, paon: string): Promise<EpcResult> {
  try {
    const subject = await geocodePostcode(postcode);
    const sector = await getSector(subject.sectorId);
    // INSIDE the try on purpose. This used to sit outside it, so anything the
    // matching threw became an unhandled rejection and the caller's busy flag
    // was never cleared — a permanently dead button.
    return areaFromSales(sector.sales, subject.postcode, paon);
  } catch (err) {
    return { ok: false, reason: epcFailureFor(err) };
  }
}

/**
 * REGISTER FIRST, SOLD DATA SECOND.
 *
 * The register is the real answer, so it is asked first. The fallback runs only
 * when the register could not answer for a reason that is OURS — unreachable,
 * rate-limited, or switched off. A register that answered "no certificate at
 * that address" is a real answer about the address, and we do not go looking
 * for a different one: the sold data is a poorer source, not a second opinion.
 */
export async function lookupEpcArea(postcode: string, paon: string, saon = ''): Promise<EpcResult> {
  if (paon.trim() === '') return { ok: false, reason: 'no-match' };
  if (postcode.trim() === '') return { ok: false, reason: 'needs-postcode' };

  if (features.epcRegisterLookup) {
    const fromRegister = await lookupFromRegister(postcode, paon, saon);
    if (fromRegister.ok) return fromRegister;
    if (!OUR_FAULT.has(fromRegister.reason)) return fromRegister;
    const fallback = await lookupFromSoldData(postcode, paon);
    // The fallback found nothing either: report the REGISTER's reason, because
    // that is the one that describes what actually went wrong.
    return fallback.ok ? fallback : fromRegister;
  }
  return lookupFromSoldData(postcode, paon);
}

/** Reasons that are about US, not about the address — the only ones worth a retry. */
const OUR_FAULT = new Set<EpcFailure>(['unavailable', 'rate-limited']);
