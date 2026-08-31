/**
 * Street-level crime from data.police.uk (official open API, no key,
 * CORS-open — verified live 2026-08-31: access-control-allow-origin: *).
 * Numbers are incidents RECORDED via police.uk for the month — some forces
 * under-supply street-level data, so copy never editorialises.
 * Attribution: "Crime data: data.police.uk (OGL v3)".
 */

const API = 'https://data.police.uk/api';

export interface CrimeCategoryCount {
  category: string;
  label: string;
  count: number;
}

export interface CrimeSummary {
  /** "2026-06" */
  month: string;
  total: number;
  /** Top categories by count (up to 4), ties alphabetical by label. */
  top: CrimeCategoryCount[];
  /** 1 = the API's standard 1-mile point radius; 0.5 = shrunk after a too-many-results 503. */
  radiusMiles: 1 | 0.5;
}

export class CrimeUnavailableError extends Error {}

/** police.uk slugs → plain labels (their own display names). Unknown slugs fall back to sentence case. */
const CATEGORY_LABELS: Record<string, string> = {
  'anti-social-behaviour': 'Anti-social behaviour',
  'bicycle-theft': 'Bicycle theft',
  burglary: 'Burglary',
  'criminal-damage-arson': 'Criminal damage and arson',
  drugs: 'Drugs',
  'other-theft': 'Other theft',
  'possession-of-weapons': 'Possession of weapons',
  'public-order': 'Public order',
  robbery: 'Robbery',
  shoplifting: 'Shoplifting',
  'theft-from-the-person': 'Theft from the person',
  'vehicle-crime': 'Vehicle crime',
  'violent-crime': 'Violence and sexual offences',
  'other-crime': 'Other crime',
};

export function categoryLabel(slug: string): string {
  const known = CATEGORY_LABELS[slug];
  if (known) return known;
  const words = slug.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function crimeLastUpdatedUrl(): string {
  return `${API}/crime-last-updated`;
}

/** Standard point query — the API searches a fixed 1-mile radius. */
export function crimesStreetUrl(lat: number, lng: number, month: string): string {
  return `${API}/crimes-street/all-crime?lat=${lat}&lng=${lng}&date=${month}`;
}

/**
 * 32-gon of 0.5-mile radius around the point, in the API's lat,lng:lat,lng
 * poly format. 32 vertices keep the inscribed-polygon shortfall against a
 * true half-mile circle under 1% of area (an octagon dropped ~10%, which
 * made the card's "half a mile" claim overstate coverage); the card still
 * says "roughly half a mile".
 */
export function halfMilePoly(lat: number, lng: number): string {
  const R = 3958.8;
  const pts: string[] = [];
  for (let i = 0; i < 32; i += 1) {
    const a = (2 * Math.PI * i) / 32;
    const dLat = ((0.5 / R) * Math.cos(a) * 180) / Math.PI;
    const dLng = ((0.5 / R) * Math.sin(a) * 180) / Math.PI / Math.cos((lat * Math.PI) / 180);
    pts.push(`${(lat + dLat).toFixed(5)},${(lng + dLng).toFixed(5)}`);
  }
  return pts.join(':');
}

export function crimesStreetPolyUrl(lat: number, lng: number, month: string): string {
  return `${API}/crimes-street/all-crime?poly=${halfMilePoly(lat, lng)}&date=${month}`;
}

/** Group by category, total + top 4 (ties alphabetical by label). */
export function summariseCrimes(crimes: { category: string }[], month: string, radiusMiles: 1 | 0.5): CrimeSummary {
  const tally = new Map<string, number>();
  for (const c of crimes) tally.set(c.category, (tally.get(c.category) ?? 0) + 1);
  const top = [...tally.entries()]
    .map(([category, count]) => ({ category, label: categoryLabel(category), count }))
    .sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : 1))
    .slice(0, 4);
  return { month, total: crimes.length, top, radiusMiles };
}

/**
 * Latest-month summary near a point. The API 503s when a point query has
 * too many results — the documented remedy is a smaller custom polygon, so
 * we shrink to 0.5 miles and say so.
 */
export async function fetchCrimeSummary(lat: number, lng: number): Promise<CrimeSummary> {
  let month: string;
  try {
    const res = await fetch(crimeLastUpdatedUrl());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    month = ((await res.json()) as { date: string }).date.slice(0, 7);
  } catch {
    throw new CrimeUnavailableError('crime-last-updated failed');
  }
  let res: Response;
  let radius: 1 | 0.5 = 1;
  try {
    res = await fetch(crimesStreetUrl(lat, lng, month));
    if (res.status === 503) {
      radius = 0.5;
      res = await fetch(crimesStreetPolyUrl(lat, lng, month));
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    throw new CrimeUnavailableError('crimes-street failed');
  }
  try {
    const crimes = (await res.json()) as { category: string }[];
    return summariseCrimes(crimes, month, radius);
  } catch {
    throw new CrimeUnavailableError('bad crime payload');
  }
}
