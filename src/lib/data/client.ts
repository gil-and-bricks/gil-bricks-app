/**
 * Tiny typed data-access layer over the public R2 bucket.
 * Reads only; validates schemaVersion === 1; caches in memory.
 * Returned objects are the cached objects — treat them as frozen.
 */
import { siteConfig } from '../../site.config';
import { SCHEMA_VERSION, type Manifest, type Sale, type SectorFile } from './types';

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
  const base = siteConfig.dataBaseUrl.replace(/\/+$/, '');
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
