/**
 * Article 4 directions from the official national planning dataset
 * (planning.data.gov.uk, MHCLG — "article-4-direction-area"). Queried
 * CLIENT-SIDE (CORS-open, verified 2026-08-31); no bulk ingest.
 *
 * HONESTY (locked): this dataset lists ALL Article 4 directions — painting,
 * demolition, conservation, agricultural, offices→resi AND HMO. It DOES carry
 * a structured `permitted-development-rights` field: code "3L" is GPDO Part 3
 * Class L, the C3↔C4 small-HMO right — the authoritative HMO signal. Many
 * older records leave it blank, so we fall back to the free-text name/notes
 * for those. It is ENGLAND only, and coverage is incomplete. Always confirm
 * with the council. See docs/DECISIONS_LOG.md S7.2.
 */

const API = 'https://www.planning.data.gov.uk';
const DATASET = 'article-4-direction-area';

/** GPDO Part 3 Class L — the C3→C4 small-HMO permitted-development right. */
const HMO_PDR = /\b3L\b/i;
export const HMO_RE = /\bhmo\b|multiple occupation|\bc4\b|c3 ?to ?c4/i;

export interface Article4Area {
  reference: string;
  name: string;
  notes: string;
  /** Raw permitted-development-rights codes, e.g. "3L" or "1A;1C" or "". */
  pdr: string;
  /**
   * 'yes'  = the recorded right removed IS the small-HMO right (PDR contains 3L),
   * 'no'   = a right is recorded and it is NOT the small-HMO right,
   * 'unknown' = no right recorded; the free text mentions HMO (best-guess) or not.
   */
  hmoRight: 'yes' | 'no' | 'unknown';
  /** Kept for callers/tests: free-text HMO mention. */
  mentionsHmo: boolean;
}

export interface Article4Result {
  /** Areas whose polygon contains the point (server-side point-in-polygon). */
  areas: Article4Area[];
  /** false only when the lookup itself failed (network) — distinct from "none here". */
  ok: boolean;
}

function toArea(props: Record<string, unknown>): Article4Area {
  const name = String(props.name ?? '');
  const notes = String(props.notes ?? props.description ?? '');
  const pdr = String(props['permitted-development-rights'] ?? '').trim();
  const mentionsHmo = HMO_RE.test(`${name} ${notes}`);
  let hmoRight: Article4Area['hmoRight'];
  if (pdr !== '') hmoRight = HMO_PDR.test(pdr) ? 'yes' : 'no'; // structured, authoritative
  else hmoRight = mentionsHmo ? 'yes' : 'unknown'; // fall back to free text
  return { reference: String(props.reference ?? ''), name, notes, pdr, hmoRight, mentionsHmo };
}

/** Article 4 directions recorded at a point. England-only dataset. */
export async function fetchArticle4AtPoint(lat: number, lng: number, fetchImpl: typeof fetch = fetch): Promise<Article4Result> {
  try {
    const res = await fetchImpl(`${API}/entity.json?dataset=${DATASET}&longitude=${lng}&latitude=${lat}&limit=25`);
    if (!res.ok) return { areas: [], ok: false };
    const body = (await res.json()) as { entities?: Record<string, unknown>[] };
    return { areas: (body.entities ?? []).map(toArea), ok: true };
  } catch {
    return { areas: [], ok: false };
  }
}

/** Article 4 polygons intersecting a bbox, as GeoJSON, for the shaded map layer. */
export async function fetchArticle4InBbox(
  bounds: { west: number; south: number; east: number; north: number },
  fetchImpl: typeof fetch = fetch,
): Promise<GeoJSON.FeatureCollection> {
  const { west, south, east, north } = bounds;
  const poly = `POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`;
  try {
    const res = await fetchImpl(
      `${API}/entity.geojson?dataset=${DATASET}&geometry_relation=intersects&geometry=${encodeURIComponent(poly)}&limit=200`,
    );
    if (!res.ok) return { type: 'FeatureCollection', features: [] };
    return (await res.json()) as GeoJSON.FeatureCollection;
  } catch {
    return { type: 'FeatureCollection', features: [] };
  }
}

export interface Article4Flag {
  /** 'inside' = a direction is recorded here; 'clear' = none recorded; 'wales'/'unknown' = no usable data. */
  state: 'inside' | 'clear' | 'wales' | 'unknown';
  mentionsHmo: boolean;
  headline: string;
  detail: string;
}

const CAVEAT = 'Coverage is incomplete and councils change these — always confirm with the council before you buy.';

/**
 * The honest verdict flag from a point lookup. Pure — tested. `country` is the
 * ONSPD code so Welsh postcodes (outside this England dataset) say so plainly.
 */
export function article4Flag(result: Article4Result, country: string): Article4Flag {
  if (country === 'W92000004') {
    return {
      state: 'wales',
      mentionsHmo: false,
      headline: 'Article 4 not checked here',
      detail:
        'The national dataset covers England only. In Wales, check with the council.',
    };
  }
  if (!result.ok) {
    return { state: 'unknown', mentionsHmo: false, headline: 'Article 4 couldn’t be checked', detail: `The planning data service didn’t respond. ${CAVEAT}` };
  }
  if (result.areas.length === 0) {
    return {
      state: 'clear',
      mentionsHmo: false,
      headline: 'No Article 4 direction recorded here',
      detail: `Nothing in the national planning dataset at this point — but ${CAVEAT}`,
    };
  }
  const hmoYes = result.areas.some((a) => a.hmoRight === 'yes');
  const allNo = result.areas.every((a) => a.hmoRight === 'no');
  if (hmoYes) {
    return {
      state: 'inside',
      mentionsHmo: true,
      headline: 'Article 4 recorded here — likely affects small HMOs',
      detail: `The recorded Article 4 direction here removes the small-HMO (C3→C4) permitted-development right, so a small HMO would likely need planning permission. ${CAVEAT}`,
    };
  }
  if (allNo) {
    return {
      state: 'inside',
      mentionsHmo: false,
      headline: 'Article 4 direction recorded here (not small-HMO)',
      detail: `An Article 4 direction is recorded here, but the recorded right it removes is not the small-HMO (C3→C4) right. ${CAVEAT}`,
    };
  }
  return {
    state: 'inside',
    mentionsHmo: false,
    headline: 'Article 4 direction recorded here',
    detail: `An Article 4 direction is recorded here. The record doesn’t specify which right it removes — it may or may not restrict small HMOs. ${CAVEAT}`,
  };
}

/** Ray-casting point-in-ring (ring = [[lng,lat],…]). */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Point-in-polygon honouring holes; polygon = [outer, hole1, …]. */
export function pointInPolygon(lng: number, lat: number, polygon: number[][][]): boolean {
  if (polygon.length === 0 || !pointInRing(lng, lat, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h += 1) if (pointInRing(lng, lat, polygon[h])) return false; // in a hole
  return true;
}

/** Point-in-MultiPolygon / Polygon GeoJSON geometry. */
export function pointInGeometry(lng: number, lat: number, geometry: GeoJSON.Geometry): boolean {
  if (geometry.type === 'Polygon') return pointInPolygon(lng, lat, geometry.coordinates as number[][][]);
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][]).some((poly) => pointInPolygon(lng, lat, poly));
  }
  return false;
}
