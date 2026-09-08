/**
 * The EPC register, queried at runtime (E1).
 *
 * WHY THIS EXISTS. The "EPC lookup" button never touched the register. It
 * searched our own monthly sold-price data for a transaction at that address
 * that happened to carry an EPC-joined floor area — so it only ever answered
 * for a property that had SOLD recently AND matched a certificate at build
 * time. Type in a house that last changed hands in 2004 and the honest answer
 * was "no sold record", which is useless when the certificate plainly exists.
 *
 * WHY IT CAN LIVE HERE AND NOT IN THE EXTENSION. The register needs a bearer
 * token. A token inside a published Chrome package is a published token, which
 * is why runtime EPC calls were ruled out for the extension. A Worker is the
 * opposite case: the secret stays server-side and the browser never sees it.
 * The extension therefore calls THIS, not the register.
 *
 * TWO CALLS PER LOOKUP. The register's postcode search returns addresses but no
 * floor area; the area only comes from fetching a certificate by number. So:
 * search the postcode, decide which rows are the subject (@gil-bricks/core), then
 * fetch the winning certificate. Cached, so it is usually no calls at all.
 */
import { candidateKey, matchCandidates, type EpcCandidate, type EpcResult, type EpcSubject } from '@gil-bricks/core';
import type { Env } from '../index';
import { EPC, OUTSIDE_EW } from '../../config/epc';

/** The register's own base. Bulk downloads and the live API share it. */
const API = 'https://api.get-energy-performance-data.communities.gov.uk';


/** A full UK postcode, normalised to the register's own spacing. */
export function normalisePostcode(raw: string): string | null {
  const bare = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (bare.length < 5 || bare.length > 7) return null;
  const out = `${bare.slice(0, -3)} ${bare.slice(-3)}`;
  return /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/.test(out) ? out : null;
}

/** The letters before the first digit — the postcode AREA. */
export function postcodeArea(postcode: string): string {
  return (/^[A-Z]+/.exec(postcode) ?? [''])[0];
}

/** True for Scotland, Northern Ireland and the Crown Dependencies. */
export function outsideEnglandWales(postcode: string): boolean {
  return OUTSIDE_EW.has(postcodeArea(postcode));
}

type Fetcher = typeof fetch;

async function register(path: string, token: string, doFetch: Fetcher): Promise<Response> {
  return doFetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    // The register is a dependency, not a hostage-taker: give up rather than
    // hold a request open while somebody waits for a floor area.
    signal: AbortSignal.timeout(EPC.timeoutMs),
  });
}

/**
 * Ask the register for one address.
 *
 * Every branch returns a REASON. The button that calls this used to collapse
 * six outcomes into one sentence that blamed the address for our own outages;
 * that is not repeated here.
 */
export async function lookupFromRegister(
  postcode: string,
  subject: EpcSubject,
  token: string,
  doFetch: Fetcher = fetch,
): Promise<EpcResult> {
  if (outsideEnglandWales(postcode)) return { ok: false, reason: 'outside-ew' };

  let searchRes: Response;
  try {
    searchRes = await register(`/api/domestic/search?postcode=${encodeURIComponent(postcode)}`, token, doFetch);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (searchRes.status === 429) return { ok: false, reason: 'rate-limited' };
  // 404 here is the register saying "no certificates for that query" — a
  // statement about certificates, not about the postcode. Telling someone their
  // postcode is wrong when it is not is the kind of blame this sprint removed.
  if (searchRes.status === 404) return { ok: false, reason: 'no-match' };
  if (!searchRes.ok) return { ok: false, reason: 'unavailable' };

  let candidates: EpcCandidate[];
  try {
    const body = (await searchRes.json()) as { data?: EpcCandidate[] };
    candidates = Array.isArray(body?.data) ? body.data : [];
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (candidates.length === 0) return { ok: false, reason: 'no-match' };

  const { matches, subBuildingsFound } = matchCandidates(candidates, subject);
  if (matches.length === 0) {
    // The building is there but it is divided into flats and we were asked
    // about the building. Saying "no certificate" would be false.
    return { ok: false, reason: subBuildingsFound ? 'ambiguous' : 'no-match' };
  }
  // DIVIDED, EVEN THOUGH SOMETHING MATCHED. 38 Hide Hill has six flats on the
  // register AND two certificates addressed just "38 Hide Hill" — which are
  // units, not the building. Answering a bare ask with one of them gives 37 m²
  // for a building of six flats. Whenever the address is known to be divided,
  // one figure cannot describe it, so say so instead.
  if (subBuildingsFound) return { ok: false, reason: 'ambiguous' };

  // Newest first. Fetch it; only look further if we must compare sizes.
  const areas: { cert: EpcCandidate; sqm: number }[] = [];
  for (const cert of matches.slice(0, EPC.maxCertificatesPerAddress)) {
    let res: Response;
    try {
      res = await register(`/api/certificate?certificate_number=${encodeURIComponent(cert.certificateNumber)}`, token, doFetch);
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
    if (res.status === 429) return { ok: false, reason: 'rate-limited' };
    if (res.status === 404) continue;
    if (!res.ok) return { ok: false, reason: 'unavailable' };
    try {
      const body = (await res.json()) as { data?: { total_floor_area?: unknown } };
      const raw = body?.data?.total_floor_area;
      const sqm = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(sqm) && sqm > 0) areas.push({ cert, sqm: Math.round(sqm) });
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  }

  if (areas.length === 0) return { ok: false, reason: 'no-match' };

  const distinct = [...new Set(areas.map((a) => a.sqm))];
  const newest = areas[0];
  // ONE address re-certified, or several DIFFERENT addresses that all answer to
  // the number typed? The distinction decides everything here.
  // UPRN FIRST. The register hands one back on every search row, and two
  // certificates sharing it ARE the same property — which settles this without
  // guessing. Address keys were doing that job and got it wrong whenever a
  // lodgement carried the post town in a spare line: "215 NORTH ROAD" and
  // "215 NORTH ROAD CARDIFF" read as two properties and refused a real answer.
  const identity = (c: EpcCandidate): string =>
    c.uprn != null && String(c.uprn).trim() !== '' ? `U:${String(c.uprn)}` : `A:${candidateKey(c)}`;
  const addresses = new Set(areas.map((a) => identity(a.cert)));
  if (distinct.length > 1 && addresses.size > 1) {
    // Different properties in the same postcode share the house number — say
    // so. Picking one would be handing back a stranger's floor area.
    return { ok: false, reason: 'ambiguous', disagreeingSqm: distinct };
  }
  // One address, several vintages: a re-measured home. Take the newest, which
  // IS the current certificate, and say that older ones exist — the caller
  // shows "Newest certificate used", so nothing is picked silently.
  return {
    ok: true,
    sqm: newest.sqm,
    source: 'register',
    certificateNumber: newest.cert.certificateNumber,
    certificateDate: newest.cert.registrationDate ?? undefined,
    supersededOthers: areas.length > 1,
  };
}

/** The cache key for one address. Normalised, so spelling cannot fork a row. */
export function cacheKey(postcode: string, subject: EpcSubject): string {
  const norm = (s: string): string => (s ?? '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/ +/g, ' ').trim();
  return `${postcode}|${norm(subject.paon)}|${norm(subject.saon ?? '')}`;
}

/**
 * A certificate does not change, so a hit is answered without touching the
 * register at all. Misses are cached too, for a shorter time: a property with
 * no certificate today may be certified next month, and re-asking the register
 * every time somebody retypes an address is what burns a rate limit.
 */
export async function readCache(db: D1Database, key: string, nowMs: number): Promise<EpcResult | null> {
  const row = await db
    .prepare('SELECT payload, fetched_at, ok FROM epc_cache WHERE cache_key = ?1')
    .bind(key)
    .first<{ payload: string; fetched_at: number; ok: number }>();
  if (!row) return null;
  const ageMs = nowMs - row.fetched_at;
  const ttl = row.ok === 1 ? EPC.cacheHitDays : EPC.cacheMissDays;
  if (ageMs > ttl * 86_400_000) return null;
  try {
    return JSON.parse(row.payload) as EpcResult;
  } catch {
    return null;
  }
}

/** Cache-worthy answers only: never cache OUR failure as if it were the register's. */
export function worthCaching(result: EpcResult): boolean {
  if (result.ok) return true;
  // What the REGISTER said about the address, and nothing else. Our own
  // failures would turn a passing outage into a fortnight of wrong answers,
  // and a malformed postcode never reached the register at all.
  return result.reason === 'no-match' || result.reason === 'ambiguous';
}

/**
 * Is this postcode already holding as many rows as we allow?
 *
 * One D1 read to avoid an unbounded number of D1 writes. Only consulted on a
 * MISS — a row we are about to add — so the common path (a hit, or an address
 * already cached) never pays for it.
 */
export async function postcodeAtCap(db: D1Database, postcode: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM epc_cache WHERE postcode = ?1')
    .bind(postcode)
    .first<{ n: number }>();
  return (row?.n ?? 0) >= EPC.maxCacheRowsPerPostcode;
}

export async function writeCache(db: D1Database, key: string, postcode: string, result: EpcResult, nowMs: number): Promise<void> {
  if (!worthCaching(result)) return;
  if (await postcodeAtCap(db, postcode)) return;
  await db
    .prepare(
      `INSERT INTO epc_cache (cache_key, postcode, payload, ok, fetched_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(cache_key) DO UPDATE SET payload = ?3, ok = ?4, fetched_at = ?5`,
    )
    .bind(key, postcode, JSON.stringify(result), result.ok ? 1 : 0, nowMs)
    .run();
}

/**
 * The sweeper the migration's comment promises. Without it the table only ever
 * grows: rows expire logically (readCache ignores anything past its TTL) but
 * nothing ever removed them, so "well inside the free tier" rested on a
 * component that did not exist. Runs on the existing daily cron.
 */
export async function sweepEpcCache(db: D1Database, nowMs: number): Promise<number> {
  const cutoff = nowMs - EPC.sweepAfterDays * 86_400_000;
  const res = await db.prepare('DELETE FROM epc_cache WHERE fetched_at < ?1').bind(cutoff).run();
  return res.meta?.changes ?? 0;
}
