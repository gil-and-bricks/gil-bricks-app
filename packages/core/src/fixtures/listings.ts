/**
 * Listing fixture loader (E3) — TEST/DEV ONLY.
 *
 * Reads the sanitised, committed Rightmove/Zoopla pages in
 * packages/core/fixtures/listings/ and pulls the embedded data blob out of the
 * saved HTML. This is the ONLY way the project ever reads a portal page: the
 * extension must never fetch one, and no test may hit the network. Accordingly
 * this module is NOT exported from the package barrel (index.ts) — it uses
 * node:fs and must never reach the web/Worker bundle.
 *
 * Portal reality (verified against real saved pages, 2026-09):
 *   - Rightmove embeds `window.__PAGE_MODEL = {data:"<flatted>",encoding:"on"}`
 *     where `data` is a `flatted`-serialised registry (index references). NB:
 *     this is __PAGE_MODEL, not the older window.PAGE_MODEL.
 *   - Zoopla is a Next.js App-Router page: the model is streamed as React Flight
 *     chunks in `self.__next_f.push([1,"…"])` script tags, plus a clean
 *     `application/ld+json` RealEstateListing. There is NO __NEXT_DATA__ anymore.
 * Both are read straight out of the HTML/script tags — never main-world injection.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type Portal = 'rightmove' | 'zoopla';

export interface ListingSummary {
  filename: string;
  portal: Portal;
  postcode: string | null;
  askingPrice: string | null;
  propertyType: string | null;
  tenure: string | null;
  beds: number | null;
  /** Parsed new-build signal (Zoopla listingCondition==="new"; Rightmove tag). */
  newBuild: boolean;
  /** The LISTING's own stated floor area in sq ft (null if the listing doesn't state one). */
  floorAreaSqFt: number | null;
  floorPlanPresent: boolean;
  /** e.g. "Added on 30/05/2026" / "Reduced on 09/06/2026" (Rightmove); null if none. */
  listingUpdateReason: string | null;
  /** When the listing first went live, if the page records it (ISO or dd/mm/yyyy); else null. */
  firstVisibleDate: string | null;
  descriptionLength: number;
}

export interface LoadedListing {
  filename: string;
  portal: Portal;
  path: string;
  /** Parsed model: Rightmove propertyData, or the Zoopla fact bag. */
  data: unknown;
  summary: ListingSummary;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(HERE, '..', '..', 'fixtures', 'listings');

/** Balanced-scan the object/array/string/primitive that follows `pos` (which must sit on its first char). */
function scanValue(s: string, j: number): string {
  const c = s[j];
  if (c === '{' || c === '[') {
    const open = c;
    const close = c === '{' ? '}' : ']';
    let depth = 0, k = j, instr = false, esc = false;
    for (; k < s.length; k++) {
      const ch = s[k];
      if (instr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') instr = false; }
      else if (ch === '"') instr = true;
      else if (ch === open) depth++;
      else if (ch === close) { depth--; if (depth === 0) return s.slice(j, k + 1); }
    }
    throw new Error('unbalanced value');
  }
  if (c === '"') {
    let k = j + 1, esc = false;
    for (; k < s.length; k++) { const ch = s[k]; if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') return s.slice(j, k + 1); }
    throw new Error('unterminated string');
  }
  let k = j;
  while (k < s.length && !',}]'.includes(s[k])) k++;
  return s.slice(j, k).trim();
}

/** Value of the FIRST occurrence of `"key"`, JSON-parsed. Returns undefined if absent/unparseable. */
function valueAfter(s: string, key: string): unknown {
  const i = s.indexOf(key);
  if (i < 0) return undefined;
  let j = s.indexOf(':', i) + 1;
  while (s[j] === ' ' || s[j] === '\n') j++;
  try { return JSON.parse(scanValue(s, j)); } catch { return undefined; }
}

// ---------------- Rightmove ----------------

/** Resolve a `flatted`-serialised registry back into the real object graph. */
function unflatten(registry: unknown[]): Record<string, unknown> {
  const resolved = new Map<number, unknown>();
  function rebuild(idx: unknown): unknown {
    if (typeof idx !== 'number') return idx;
    if (resolved.has(idx)) return resolved.get(idx);
    const v = registry[idx];
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      resolved.set(idx, out);
      for (const r of v) out.push(rebuild(r));
      return out;
    }
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      resolved.set(idx, out);
      for (const [k, r] of Object.entries(v as Record<string, unknown>)) out[k] = rebuild(r);
      return out;
    }
    resolved.set(idx, v);
    return v;
  }
  return rebuild(0) as Record<string, unknown>;
}

/** Pull the object literal that follows `window.__PAGE_MODEL =`. */
function extractPageModel(html: string): Record<string, unknown> {
  const mi = html.indexOf('window.__PAGE_MODEL');
  if (mi < 0) throw new Error('Rightmove: window.__PAGE_MODEL not found');
  let i = html.indexOf('=', mi) + 1;
  while (html[i] === ' ' || html[i] === '\n') i++;
  if (html[i] !== '{') throw new Error('Rightmove: __PAGE_MODEL is not an object literal');
  const start = i;
  let depth = 0, instr = false, esc = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (instr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') instr = false; }
    else if (c === '"') instr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  const outer = JSON.parse(html.slice(start, i)) as { data: string; encoding?: string };
  if (typeof outer.data !== 'string') throw new Error('Rightmove: __PAGE_MODEL.data missing');
  return unflatten(JSON.parse(outer.data) as unknown[]);
}

function rightmoveFloorAreaSqFt(pd: Record<string, any>): number | null {
  const sizings = (pd.sizings as any[]) ?? [];
  for (const s of sizings) {
    const unit = String(s.unit ?? '').toLowerCase();
    const v = Number(s.maximumSize ?? s.minimumSize ?? 0);
    if (!v) continue;
    if (unit.includes('sqft') || unit.includes('ft')) return Math.round(v);
    if (unit.includes('sqm') || unit.includes('m')) return Math.round(v * 10.7639);
  }
  return null;
}

function parseRightmove(html: string, filename: string): LoadedListing {
  const root = extractPageModel(html);
  const pd = (root.propertyData ?? {}) as Record<string, any>;
  const addr = (pd.address ?? {}) as Record<string, any>;
  const reason: string | null = (pd.listingHistory ?? {})?.listingUpdateReason ?? null;
  const added = reason && /^Added on (\d{2}\/\d{2}\/\d{4})/.exec(reason);
  const summary: ListingSummary = {
    filename,
    portal: 'rightmove',
    postcode: [addr.outcode, addr.incode].filter(Boolean).join(' ') || null,
    askingPrice: (pd.prices ?? {})?.primaryPrice ?? null,
    propertyType: pd.propertySubType ?? null,
    tenure: (pd.tenure ?? {})?.tenureType ?? null,
    beds: typeof pd.bedrooms === 'number' ? pd.bedrooms : null,
    newBuild: Array.isArray(pd.tags) && pd.tags.some((t: unknown) => /new[ _-]?home|new[ _-]?build/i.test(String(t))),
    floorAreaSqFt: rightmoveFloorAreaSqFt(pd),
    floorPlanPresent: (((pd.floorplans as any[]) ?? []).length) > 0,
    listingUpdateReason: reason,
    // Rightmove's PAGE_MODEL records first-visible only via the "Added on" reason;
    // for a "Reduced on" listing the original go-live date is not in the model.
    firstVisibleDate: added ? added[1] : null,
    descriptionLength: String((pd.text ?? {})?.description ?? '').length,
  };
  return { filename, portal: 'rightmove', path: '', data: pd, summary };
}

// ---------------- Zoopla ----------------

/** Concatenate the React-Flight text chunks from `self.__next_f.push([1,"…"])`. */
export function decodeZooplaFlight(html: string): string {
  const re = /self\.__next_f\.push\((\[[\s\S]*?\])\)\s*<\/script>/g;
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const arr = JSON.parse(m[1]) as unknown[];
      if (arr.length > 1 && typeof arr[1] === 'string') parts.push(arr[1]);
    } catch { /* skip non-JSON pushes */ }
  }
  return parts.join('');
}

function zooplaLdListing(html: string): Record<string, any> {
  const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const d = JSON.parse(m[1]);
      if (d && d['@type'] === 'RealEstateListing') return d;
    } catch { /* skip */ }
  }
  return {};
}

function parseZoopla(html: string, filename: string): LoadedListing {
  const flight = decodeZooplaFlight(html);
  const ld = zooplaLdListing(html);
  const pricing = valueAfter(flight, '"pricing"') as Record<string, any> | undefined;
  const counts = valueAfter(flight, '"counts"') as Record<string, any> | undefined;
  const floorArea = valueAfter(flight, '"floorArea"') as Record<string, any> | null | undefined;
  const floorPlan = valueAfter(flight, '"floorPlan"') as Record<string, any> | undefined;
  const tenure = valueAfter(flight, '"tenure"');
  const propertyType = valueAfter(flight, '"propertyType"');
  // New builds withhold the full postalCode but expose outcode + incode separately.
  const postalCodeRaw = valueAfter(flight, '"postalCode"');
  const outcode = valueAfter(flight, '"outcode"');
  const incode = valueAfter(flight, '"incode"');
  const postalCode = typeof postalCodeRaw === 'string' && postalCodeRaw
    ? postalCodeRaw
    : (typeof outcode === 'string' && typeof incode === 'string' ? `${outcode} ${incode}` : null);
  const publishedOn = valueAfter(flight, '"publishedOn"') ?? ld.datePosted ?? null;
  const data = { flight: flight.length, ld, pricing, counts, floorArea, floorPlan, tenure, propertyType, postalCode, publishedOn };
  const summary: ListingSummary = {
    filename,
    portal: 'zoopla',
    postcode: (typeof postalCode === 'string' ? postalCode : null),
    askingPrice: pricing?.label ?? null,
    propertyType: typeof propertyType === 'string' ? propertyType : null,
    tenure: typeof tenure === 'string' ? tenure : null,
    beds: typeof counts?.numBedrooms === 'number' ? counts.numBedrooms : null,
    newBuild: valueAfter(flight, '"listingCondition"') === 'new',
    floorAreaSqFt: floorArea && typeof floorArea.value === 'number' ? floorArea.value : null,
    floorPlanPresent: Array.isArray(floorPlan?.image) && floorPlan!.image.length > 0,
    // Zoopla carries a machine "publishedOn" (first live) but no "Reduced on" reason
    // unless priceHistory.priceChanges is populated (none in the current corpus).
    listingUpdateReason: (valueAfter(flight, '"priceHistory"') as any)?.priceChanges ? 'price change recorded' : null,
    firstVisibleDate: typeof publishedOn === 'string' ? publishedOn : null,
    descriptionLength: String(ld.description ?? '').length,
  };
  return { filename, portal: 'zoopla', path: '', data, summary };
}

// ---------------- corpus ----------------

export function parseListing(portal: Portal, html: string, filename = '<inline>'): LoadedListing {
  return portal === 'rightmove' ? parseRightmove(html, filename) : parseZoopla(html, filename);
}

/** Load + parse every fixture. Throws if a fixture stops parsing (used by the health test). */
export function loadListingCorpus(): LoadedListing[] {
  const out: LoadedListing[] = [];
  for (const portal of ['rightmove', 'zoopla'] as const) {
    const dir = join(CORPUS_DIR, portal);
    for (const filename of readdirSync(dir).filter((f) => f.endsWith('.html')).sort()) {
      const path = join(dir, filename);
      const html = readFileSync(path, 'utf8');
      const loaded = parseListing(portal, html, filename);
      loaded.path = path;
      out.push(loaded);
    }
  }
  return out;
}
