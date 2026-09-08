/**
 * The extension's floor-area lookup against the EPC register (E1).
 *
 * IT CANNOT HOLD THE TOKEN. The register needs a bearer token, and a token
 * inside a published Chrome package is a published token — which is exactly why
 * runtime EPC calls were ruled out for the extension before. So it does not
 * call the register: it calls OUR Worker, which holds the secret server-side
 * and answers both surfaces from one place.
 *
 * NO NEW PERMISSION. `host_permissions` already includes our own app
 * (coreConfig.appBaseUrl) for the daily attention check, so this needs nothing
 * added to the manifest and nothing changed on the store listing.
 *
 * The panel keeps its instant sold-data answer as the fallback: this is tried
 * first because it is the real register, and the label always says which won.
 */
import { coreConfig, type EpcResult } from '@gil-bricks/core';

/** Same shape the web app uses, so both surfaces cannot drift apart. */
export const EPC_ENDPOINT = '/api/epc';
const TIMEOUT_MS = 14_000;

export interface EpcLookupDeps {
  fetch?: typeof fetch;
  base?: string;
}

/** Ask our Worker for the register's answer. Never throws — a throw is a reason. */
export async function lookupEpcArea(
  postcode: string,
  paon: string,
  saon = '',
  deps: EpcLookupDeps = {},
): Promise<EpcResult> {
  const doFetch = deps.fetch ?? fetch;
  const base = deps.base ?? coreConfig.appBaseUrl;
  if (postcode.trim() === '') return { ok: false, reason: 'needs-postcode' };
  if (paon.trim() === '') return { ok: false, reason: 'no-match' };
  const qs = new URLSearchParams({ postcode, paon, saon });
  try {
    const res = await doFetch(`${base}${EPC_ENDPOINT}?${qs.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
