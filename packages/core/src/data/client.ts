/**
 * Tiny typed data-access layer over the public R2 bucket.
 * Reads only; validates schemaVersion === 1; caches in memory.
 * Returned objects are the cached objects — treat them as frozen.
 */
import { coreConfig } from '../config';
import { SCHEMA_VERSION, type AreaStatsFile, type Manifest, type PostcodeMap, type Sale, type SectorFile, type SectorsIndexEntry, type UkhpiFile } from './types';
import type { TrajectoryFile } from '../area/trajectory';

export type DataErrorKind = 'NotFound' | 'Network' | 'BadSchema';

export class DataError extends Error {
  readonly kind: DataErrorKind;

  constructor(kind: DataErrorKind, message: string) {
    super(message);
    this.name = `DataError:${kind}`;
    this.kind = kind;
  }
}

/**
 * "CF37 1" → "sectors/CF37/CF37-1.json".
 * Case- and whitespace-forgiving; throws TypeError (a caller bug, not a
 * data error) on anything that is not a valid sector id.
 */
export function sectorIdToPath(sectorId: string): string {
  const norm = sectorId.trim().toUpperCase().replace(/\s+/g, ' ');
  const m = /^([A-Z]{1,2}\d[A-Z\d]?) (\d)$/.exec(norm);
  if (!m) {
    throw new TypeError(`Not a postcode sector id: "${sectorId}"`);
  }
  return `sectors/${m[1]}/${m[1]}-${m[2]}.json`;
}

const cache = new Map<string, unknown>();

/** Test hook — empties the in-memory cache. */
export function clearDataCache(): void {
  cache.clear();
}

async function fetchJson(path: string): Promise<unknown> {
  const base = coreConfig.dataBaseUrl.replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/${path}`);
  } catch (err) {
    throw new DataError('Network', `Failed to reach data store for ${path}: ${err}`);
  }
  if (res.status === 404) {
    throw new DataError('NotFound', `No data at ${path}`);
  }
  if (!res.ok) {
    throw new DataError('Network', `HTTP ${res.status} for ${path}`);
  }
  try {
    return await res.json();
  } catch {
    throw new DataError('BadSchema', `Not JSON at ${path}`);
  }
}

function checkVersion(body: unknown, path: string): void {
  const v = (body as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (v !== SCHEMA_VERSION) {
    throw new DataError('BadSchema', `Unsupported schemaVersion ${JSON.stringify(v)} at ${path} (expected ${SCHEMA_VERSION})`);
  }
}

function assertManifest(body: unknown, path: string): asserts body is Manifest {
  checkVersion(body, path);
  const m = body as Partial<Manifest>;
  if (
    typeof m.ppdMonth !== 'string' ||
    typeof m.ukhpiMonth !== 'string' ||
    typeof m.epcExtractDate !== 'string' ||
    typeof m.onspdEdition !== 'string' ||
    typeof m.generatedAt !== 'string' ||
    typeof m.sectorsCount !== 'number'
  ) {
    throw new DataError('BadSchema', `Malformed manifest at ${path}`);
  }
}

function assertSectorFile(body: unknown, path: string, expectedSector: string): asserts body is SectorFile {
  checkVersion(body, path);
  const s = body as Partial<SectorFile>;
  if (
    typeof s.sector !== 'string' ||
    (s.country !== 'E92000001' && s.country !== 'W92000004') ||
    typeof s.updatedAt !== 'string' ||
    !Array.isArray(s.sales) ||
    typeof s.stats !== 'object' ||
    s.stats === null ||
    typeof s.stats.count !== 'number' ||
    typeof s.stats.typicalPrice !== 'number' ||
    (typeof s.stats.typicalPpsqm !== 'number' && s.stats.typicalPpsqm !== null) ||
    typeof s.stats.p10Price !== 'number' ||
    typeof s.stats.p90Price !== 'number'
  ) {
    throw new DataError('BadSchema', `Malformed sector file at ${path}`);
  }
  if (s.sector !== expectedSector) {
    throw new DataError('BadSchema', `Sector file at ${path} says "${s.sector}", expected "${expectedSector}"`);
  }
  // Spot-check the first sale — catches most real corruption without walking every row.
  const first = s.sales[0] as Partial<Sale> | undefined;
  if (
    first !== undefined &&
    (typeof first !== 'object' ||
      first === null ||
      typeof first.id !== 'string' ||
      typeof first.date !== 'string' ||
      typeof first.price !== 'number' ||
      typeof first.postcode !== 'string')
  ) {
    throw new DataError('BadSchema', `Malformed sales entries at ${path}`);
  }
}

export async function getManifest(): Promise<Manifest> {
  const path = 'manifest.json';
  const hit = cache.get(path);
  if (hit) return hit as Manifest;
  const body = await fetchJson(path);
  assertManifest(body, path);
  cache.set(path, body);
  return body;
}

export async function getSector(sectorId: string): Promise<SectorFile> {
  const path = sectorIdToPath(sectorId);
  const expected = sectorId.trim().toUpperCase().replace(/\s+/g, ' ');
  const hit = cache.get(path);
  if (hit) return hit as SectorFile;
  const body = await fetchJson(path);
  assertSectorFile(body, path, expected);
  cache.set(path, body);
  return body;
}

/** sectors-index.json — additive companion, no schemaVersion of its own. */
export async function getSectorsIndex(): Promise<SectorsIndexEntry[]> {
  const path = 'sectors-index.json';
  const hit = cache.get(path);
  if (hit) return hit as SectorsIndexEntry[];
  const body = await fetchJson(path);
  if (!Array.isArray(body) || body.length === 0) {
    throw new DataError('BadSchema', `Malformed sectors index at ${path}`);
  }
  const first = body[0] as Partial<SectorsIndexEntry>;
  if (typeof first.sectorId !== 'string' || typeof first.lat !== 'number' || typeof first.spanMiles !== 'number') {
    throw new DataError('BadSchema', `Malformed sectors index entries at ${path}`);
  }
  cache.set(path, body);
  return body as SectorsIndexEntry[];
}

/** postcodes/{OUTCODE}.json — additive companion geocode map. */
export async function getOutcodePostcodes(outcode: string): Promise<PostcodeMap> {
  const oc = outcode.trim().toUpperCase();
  if (!/^[A-Z]{1,2}\d[A-Z\d]?$/.test(oc)) {
    throw new TypeError(`Not an outcode: "${outcode}"`);
  }
  const path = `postcodes/${oc}.json`;
  const hit = cache.get(path);
  if (hit) return hit as PostcodeMap;
  const body = await fetchJson(path);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new DataError('BadSchema', `Malformed postcode map at ${path}`);
  }
  cache.set(path, body);
  return body as PostcodeMap;
}

/** area/{OUTCODE}.json — S5.1 additive companion: per-sector area stats. */
export async function getAreaStats(outcode: string): Promise<AreaStatsFile> {
  const oc = outcode.trim().toUpperCase();
  if (!/^[A-Z]{1,2}\d[A-Z\d]?$/.test(oc)) {
    throw new TypeError(`Not an outcode: "${outcode}"`);
  }
  const path = `area/${oc}.json`;
  const hit = cache.get(path);
  if (hit) return hit as AreaStatsFile;
  const body = await fetchJson(path);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new DataError('BadSchema', `Malformed area stats at ${path}`);
  }
  cache.set(path, body);
  return body as AreaStatsFile;
}

/**
 * CA1 — area-trajectory.json and area-codes.json, both additive companions.
 *
 * Fetched ONLY when somebody opens the area panel, never on page load: between
 * them they are about 46KB gzipped, and a reader who never opens the panel
 * should not pay for it. Both are validated before use — a malformed file must
 * fail loudly rather than draw a chart out of nothing.
 */
export interface AreaCodesFile {
  schemaVersion: number;
  source: string;
  licence: string;
  /** Distinct area codes, interned. */
  codes: string[];
  /** sector -> [localAuthorityIndex, regionIndex, countryIndex]; -1 means none. */
  sectors: Record<string, [number, number, number]>;
}

export async function getAreaTrajectory(): Promise<TrajectoryFile> {
  const path = 'area-trajectory.json';
  const hit = cache.get(path);
  if (hit) return hit as TrajectoryFile;
  const body = await fetchJson(path);
  const t = body as Partial<TrajectoryFile>;
  if (
    typeof t.month !== 'string'
    || typeof t.areas !== 'object' || t.areas === null || Array.isArray(t.areas)
    || Object.keys(t.areas).length === 0
  ) {
    throw new DataError('BadSchema', `Malformed area trajectory at ${path}`);
  }
  cache.set(path, body);
  return body as TrajectoryFile;
}

export async function getAreaCodes(): Promise<AreaCodesFile> {
  const path = 'area-codes.json';
  const hit = cache.get(path);
  if (hit) return hit as AreaCodesFile;
  const body = await fetchJson(path);
  const c = body as Partial<AreaCodesFile>;
  if (
    !Array.isArray(c.codes) || c.codes.length === 0
    || typeof c.sectors !== 'object' || c.sectors === null || Array.isArray(c.sectors)
  ) {
    throw new DataError('BadSchema', `Malformed area codes at ${path}`);
  }
  cache.set(path, body);
  return body as AreaCodesFile;
}

/**
 * The three official codes for a sector — its local authority, its region and
 * its country. ONS uses a pseudo-code ending 99999999 for "does not apply",
 * which is how every Welsh sector reports its region: regions are an English
 * geography and Wales has none. Those become null rather than a lookup that
 * silently finds nothing.
 */
export function codesForSector(file: AreaCodesFile, sector: string): {
  la: string | null; region: string | null; country: string | null;
} {
  const entry = file.sectors[sector.trim().toUpperCase()];
  const at = (i: number): string | null => {
    if (i === undefined || i < 0) return null;
    const code = file.codes[i];
    return typeof code === 'string' && !/99999999$/.test(code) ? code : null;
  };
  if (!entry) return { la: null, region: null, country: null };
  return { la: at(entry[0]), region: at(entry[1]), country: at(entry[2]) };
}

/** ukhpi.json — additive v1 companion. */
export async function getUkhpi(): Promise<UkhpiFile> {
  const path = 'ukhpi.json';
  const hit = cache.get(path);
  if (hit) return hit as UkhpiFile;
  const body = await fetchJson(path);
  const u = body as Partial<UkhpiFile>;
  const isTable = (t: unknown): boolean =>
    typeof t === 'object' && t !== null && !Array.isArray(t) && Object.keys(t).length > 0;
  if (
    typeof u.source !== 'string' ||
    typeof u.ukhpiMonth !== 'string' ||
    typeof u.index !== 'object' || u.index === null ||
    !isTable(u.index.E92000001) || !isTable(u.index.W92000004)
  ) {
    throw new DataError('BadSchema', `Malformed UKHPI file at ${path}`);
  }
  cache.set(path, body);
  return body as UkhpiFile;
}
