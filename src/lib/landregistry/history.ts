/**
 * HM Land Registry Price Paid linked data (official open-data API only —
 * no scraping, no portals). Working query form, probed live 2026-08-31:
 *
 *   GET https://landregistry.data.gov.uk/data/ppi/transaction-record.json
 *       ?propertyAddress.postcode={POSTCODE}&_sort=-transactionDate&_pageSize=200
 *
 * We filter by postcode server-side and match the address LOCALLY with the
 * same normalisation the pipeline uses for PPD↔EPC matching — the server's
 * paon filter is exact-string and would miss punctuation variants, and
 * local matching lets us detect ambiguity instead of guessing.
 */

export const OGL_ATTRIBUTION =
  'Contains HM Land Registry data © Crown copyright and database right 2026. ' +
  'This data is licensed under the Open Government Licence v3.0.';

const API = 'https://landregistry.data.gov.uk/data/ppi';
const TIMEOUT_MS = 6000;
const MAX_PAGES = 3; // 200 per page; a postcode with 600+ transactions is vanishingly rare

export type LandRegistryErrorKind = 'Timeout' | 'Network' | 'BadResponse';

export class LandRegistryError extends Error {
  readonly kind: LandRegistryErrorKind;

  constructor(kind: LandRegistryErrorKind, message: string) {
    super(message);
    this.name = `LandRegistryError:${kind}`;
    this.kind = kind;
  }
}

/**
 * Mirrors the pipeline's SQL `norm()` macro (build.mjs) over its real
 * domain: PPD/EPC/LR address fields are ASCII, where the two are identical.
 * (Outside ASCII, JS full-case-mapping differs from DuckDB's simple upper —
 * e.g. ß→SS here but stripped there; irrelevant for GB addresses.)
 */
export function normaliseAddressKey(s: string | undefined | null): string {
  return (s ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

export interface SaleHistoryEntry {
  /** yyyy-mm-dd. */
  date: string;
  price: number;
  transactionId: string;
  /** D/S/T/F/O. */
  propertyType: string;
  newBuild: boolean;
  /** A = standard price paid; B = additional (repossessions etc.). */
  category: 'A' | 'B';
}

export interface AddressCandidate {
  paon: string;
  saon: string;
  street: string;
}

export type SaleHistoryResult =
  | { kind: 'ok'; sales: SaleHistoryEntry[]; truncated?: true }
  | { kind: 'ambiguous'; candidates: AddressCandidate[] };

interface RawItem {
  transactionId?: string;
  transactionDate?: string;
  pricePaid?: number;
  newBuild?: boolean;
  propertyType?: { _about?: string };
  transactionCategory?: { _about?: string };
  propertyAddress?: { paon?: string; saon?: string; street?: string };
}

const TYPE_BY_URI: Record<string, string> = {
  detached: 'D',
  'semi-detached': 'S',
  terraced: 'T',
  'flat-maisonette': 'F',
};

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

/** "Fri, 01 Aug 2025" → "2025-08-01" — parsed by hand so no timezone can
 * shift the calendar date (Date.parse reads it as local midnight and
 * toISOString would roll it back a day during BST). */
function toIsoDate(lrDate: string | undefined): string | null {
  if (!lrDate) return null;
  const m = /(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})/.exec(lrDate);
  if (!m) return null;
  return `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, '0')}`;
}

function parseItem(item: RawItem): SaleHistoryEntry | null {
  const date = toIsoDate(item.transactionDate);
  if (date === null || typeof item.pricePaid !== 'number' || typeof item.transactionId !== 'string') return null;
  const typeUri = item.propertyType?._about ?? '';
  const typeKey = typeUri.slice(typeUri.lastIndexOf('/') + 1);
  const catUri = item.transactionCategory?._about ?? '';
  return {
    date,
    price: item.pricePaid,
    transactionId: item.transactionId,
    propertyType: TYPE_BY_URI[typeKey] ?? 'O',
    newBuild: item.newBuild === true,
    category: catUri.endsWith('additionalPricePaidTransaction') ? 'B' : 'A',
  };
}

async function fetchLrJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  // the timer stays armed until the BODY is read too — a server that sends
  // headers then stalls must still hit the 6s contract
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new LandRegistryError('Timeout', 'Land Registry did not answer within 6 seconds — sale history is unavailable right now');
      }
      throw new LandRegistryError('Network', `Could not reach Land Registry: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) {
      throw new LandRegistryError('Network', `Land Registry answered HTTP ${res.status}`);
    }
    try {
      return await res.json();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new LandRegistryError('Timeout', 'Land Registry did not answer within 6 seconds — sale history is unavailable right now');
      }
      throw new LandRegistryError('BadResponse', 'Land Registry returned something that was not JSON');
    }
  } finally {
    clearTimeout(timer);
  }
}

const historyCache = new Map<string, SaleHistoryResult>();
// The HTTP fetch depends only on the postcode — cache the raw items per
// postcode so per-address matching (each keystroke of a house number) never
// refires the network. Failures are remembered briefly so an outage can't
// trigger a 6s-timeout storm on every filter change.
const postcodeCache = new Map<string, RawItem[] | { failedAt: number; error: LandRegistryError }>();
const FAILURE_MEMORY_MS = 30_000;

/** Test hook. */
export function clearLandRegistryCache(): void {
  historyCache.clear();
  postcodeCache.clear();
  txCache.clear();
}

export interface SaleHistoryQuery {
  postcode: string;
  paon: string;
  saon?: string;
}

export async function fetchSaleHistory(query: SaleHistoryQuery): Promise<SaleHistoryResult> {
  let pc = query.postcode.trim().toUpperCase().replace(/\s+/g, ' ');
  // the server filter is exact-string: reinsert the space for compact input
  if (!pc.includes(' ') && pc.length >= 5 && pc.length <= 7) {
    pc = `${pc.slice(0, -3)} ${pc.slice(-3)}`;
  }
  const paonKey = normaliseAddressKey(query.paon);
  const saonKey = normaliseAddressKey(query.saon);
  if (pc === '' || paonKey === '') {
    return { kind: 'ok', sales: [] };
  }
  const cacheKey = `${pc}|${paonKey}|${saonKey}`;
  const hit = historyCache.get(cacheKey);
  if (hit) return hit.kind === 'ok' ? { ...hit, sales: [...hit.sales] } : { ...hit, candidates: [...hit.candidates] };

  let items: RawItem[];
  let truncated = false;
  const cached = postcodeCache.get(pc);
  if (cached && !Array.isArray(cached)) {
    if (Date.now() - cached.failedAt < FAILURE_MEMORY_MS) throw cached.error;
    postcodeCache.delete(pc);
  }
  const cachedNow = postcodeCache.get(pc);
  if (cachedNow && Array.isArray(cachedNow)) {
    items = cachedNow;
    truncated = items.length >= MAX_PAGES * 200;
  } else {
    items = [];
    try {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const url = `${API}/transaction-record.json?propertyAddress.postcode=${encodeURIComponent(pc)}&_sort=-transactionDate&_pageSize=200&_page=${page}`;
        const body = (await fetchLrJson(url)) as { result?: { items?: RawItem[] } };
        const batch = body.result?.items ?? [];
        items.push(...batch);
        if (batch.length < 200) break;
        if (page === MAX_PAGES - 1) truncated = true; // newest 600 kept (globally sorted) — flag, never pretend complete
      }
    } catch (err) {
      if (err instanceof LandRegistryError && (err.kind === 'Timeout' || err.kind === 'Network')) {
        postcodeCache.set(pc, { failedAt: Date.now(), error: err });
      }
      throw err;
    }
    postcodeCache.set(pc, items);
  }

  // exact-key local matching on the pipeline's normalisation — never guess
  const paonMatches = items.filter((i) => normaliseAddressKey(i.propertyAddress?.paon) === paonKey);
  const matches = paonMatches.filter((i) => normaliseAddressKey(i.propertyAddress?.saon) === saonKey);

  let result: SaleHistoryResult;
  if (matches.length === 0 && saonKey === '' && paonMatches.length > 0) {
    // the caller gave no flat number but every record here has one — ask, don't pick
    const seen = new Map<string, AddressCandidate>();
    for (const i of paonMatches) {
      const a = i.propertyAddress ?? {};
      const key = `${normaliseAddressKey(a.saon)}|${normaliseAddressKey(a.paon)}`;
      if (!seen.has(key)) seen.set(key, { paon: a.paon ?? '', saon: a.saon ?? '', street: a.street ?? '' });
    }
    result = { kind: 'ambiguous', candidates: [...seen.values()] };
  } else {
    const sales = matches
      .map(parseItem)
      .filter((s): s is SaleHistoryEntry => s !== null)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    result = truncated ? { kind: 'ok', sales, truncated: true } : { kind: 'ok', sales };
  }
  historyCache.set(cacheKey, result);
  return result.kind === 'ok' ? { ...result, sales: [...result.sales] } : { ...result, candidates: [...result.candidates] };
}

export interface TransactionDetail extends SaleHistoryEntry {
  address: { paon: string; saon: string; street: string; town: string; postcode: string };
  /** freehold/leasehold when present. */
  estateType: string;
}

const txCache = new Map<string, TransactionDetail>();

/** One transaction's detail page (used by the comps table). Tolerates missing address fields. */
export async function getTransaction(transactionId: string): Promise<TransactionDetail> {
  const guid = transactionId.replace(/[{}]/g, '').trim().toUpperCase(); // the service is GUID-case-sensitive
  const hit = txCache.get(guid);
  if (hit) return { ...hit, address: { ...hit.address } };
  const body = (await fetchLrJson(`${API}/transaction/${encodeURIComponent(guid)}/current.json`)) as {
    result?: { primaryTopic?: RawItem & { estateType?: { _about?: string }; propertyAddress?: Record<string, string> } };
  };
  const t = body.result?.primaryTopic;
  const parsed = t ? parseItem(t) : null;
  if (!t || !parsed) {
    throw new LandRegistryError('BadResponse', `No usable transaction record for ${guid}`);
  }
  const a = (t.propertyAddress ?? {}) as Record<string, string>;
  const estateUri = t.estateType?._about ?? '';
  const detail: TransactionDetail = {
    ...parsed,
    address: {
      paon: a.paon ?? '',
      saon: a.saon ?? '',
      street: a.street ?? '',
      town: a.town ?? '',
      postcode: a.postcode ?? '',
    },
    estateType: estateUri.slice(estateUri.lastIndexOf('/') + 1),
  };
  txCache.set(guid, detail);
  return { ...detail, address: { ...detail.address } };
}
