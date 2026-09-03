/**
 * Field provenance (E11) — where each prefilled value came from, so a suggested
 * figure never looks like a fact. It REUSES existing signals rather than a new
 * framework: the URL params the extension handoff already writes (which fields
 * arrived, the `src=ext` marker, the `areaSrc` origin), the EPC-lookup action,
 * and the user's own edits. Nothing here is stored or transmitted.
 */
import { signal } from '@preact/signals';

export type ProvSource = 'listing' | 'epc' | 'typed' | 'settings' | 'carried';

/** Small, quiet, consistent labels. `carried` is the HONEST catch-all for an
 * end-value/rent the extension brought over whose finer origin (estimated vs
 * typed) we genuinely can't recover across the URL — never claimed as a fact.
 * ("Estimated from sold data" is shown authoritatively by the Valuation card,
 * with its maths, so we don't duplicate — and never guess — it on a field.) */
export const PROV_LABEL: Record<ProvSource, string> = {
  listing: 'from the listing',
  epc: 'from EPC data',
  typed: 'you typed it',
  settings: 'your saved settings',
  carried: 'brought from the extension',
};

// Captured ONCE at load from the arriving URL.
let arrivedKeys = new Set<string>();
let fromExtension = false;
let auctionArrival = false;
let areaOrigin: 'listing' | 'carried' | null = null;

/** Subject facts the extension reads straight off the portal listing. */
const SUBJECT_FACTS = new Set(['postcode', 'price', 'type', 'beds', 'baths', 'paon', 'saon']);
/** Per-deal inputs the user enters/accepts (assumptions, not facts) — vs settings. */
const DEAL_INPUTS = new Set(['rent', 'gdv', 'arv', 'refurbCost', 'rooms', 'roomRent']);

export function initProvenance(search: string): void {
  const q = new URLSearchParams(search);
  fromExtension = q.get('src') === 'ext';
  auctionArrival = q.get('auction') === '1';
  const a = q.get('areaSrc');
  areaOrigin = a === 'listing' ? 'listing' : a === 'carried' ? 'carried' : null;
  arrivedKeys = new Set([...q.keys()].filter((k) => k !== 'src' && k !== 'areaSrc' && k !== 'auction'));
  editedKeys.value = new Set();
  areaEpc.value = false;
}

export const isFromExtension = (): boolean => fromExtension;
/** The deal arrived flagged as an auction (E8.1/P4). Metadata read once from the
 * URL like `src`; carried onto the deal so the board can warn at Offer in. */
export const isAuctionArrival = (): boolean => auctionArrival;

/** Keys the user has edited this session (marked from the input handlers). */
export const editedKeys = signal<Set<string>>(new Set());
/** Area was filled by the web's EPC-lookup button. */
export const areaEpc = signal<boolean>(false);

export function markEdited(key: string): void {
  if (!editedKeys.value.has(key)) editedKeys.value = new Set(editedKeys.value).add(key);
}

/**
 * The source to badge for a field, or null for no badge. We only badge values the
 * user should sanity-check: prefilled fields, an EPC lookup, or a prefilled field
 * the user has since overridden. A value typed into a blank form (a direct visit)
 * is obviously the user's own and needs no badge.
 */
export function sourceFor(key: string): ProvSource | null {
  if (key === 'area' && areaEpc.value) return 'epc';
  const arrived = arrivedKeys.has(key);
  if (editedKeys.value.has(key)) return arrived ? 'typed' : null; // only badge an override of a prefilled value
  // Only ATTRIBUTE an origin for genuine extension arrivals — a plain shared/
  // hand-edited link's params aren't "from the listing", so they get no badge.
  if (!arrived || !fromExtension) return null;
  if (key === 'area') return areaOrigin === 'listing' ? 'listing' : 'carried';
  if (SUBJECT_FACTS.has(key)) return 'listing';
  if (DEAL_INPUTS.has(key)) return 'carried';
  return 'settings'; // an arrived assumption field = the user's extension settings
}

/**
 * A snapshot of the evidence state at save time (P2): for every field that has a
 * known source, which it was — from the listing / EPC / typed / carried, plus the
 * arrival marker. Stored on the deal's verdict so P6/P7 know what the score rested
 * on. Fields the user typed on a blank direct visit have no source and are omitted.
 */
export function evidenceSnapshot(fieldKeys: readonly string[]): string {
  const sources: Record<string, ProvSource> = {};
  for (const k of fieldKeys) {
    const s = sourceFor(k);
    if (s) sources[k] = s;
  }
  return JSON.stringify({ from: fromExtension ? 'extension' : 'direct', sources });
}
