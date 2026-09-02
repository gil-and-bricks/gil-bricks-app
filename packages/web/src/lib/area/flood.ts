/**
 * Current flood alerts/warnings from the Environment Agency real-time
 * flood-monitoring API (official, no key, CORS-open — verified live
 * 2026-08-31). ENGLAND ONLY: live alerts for Wales come from Natural
 * Resources Wales, which we link out to (no open CORS JSON API — logged
 * in DECISIONS_LOG S5.2). Live alerts say NOTHING about long-term risk.
 */

const API = 'https://environment.data.gov.uk/flood-monitoring';

export interface FloodAlert {
  /** Human name of the affected area. */
  name: string;
  /** e.g. "Flood alert" / "Flood warning". */
  severity: string;
  /** 1 severe warning, 2 warning, 3 alert (4 = no longer in force, excluded). */
  severityLevel: number;
}

export class FloodUnavailableError extends Error {}

/** Current floods within `distKm` of the point. */
export function floodsUrl(lat: number, lng: number, distKm = 5): string {
  return `${API}/id/floods?lat=${lat}&long=${lng}&dist=${distKm}`;
}

interface RawFloodItem {
  description?: string;
  eaAreaName?: string;
  severity?: string;
  severityLevel?: number;
}

const SEVERITY_NAMES: Record<number, string> = { 1: 'Severe flood warning', 2: 'Flood warning', 3: 'Flood alert' };

/** Keep only alerts currently in force (severity 1–3), most severe first. */
export function summariseFloods(items: RawFloodItem[]): FloodAlert[] {
  return items
    .filter((i) => typeof i.severityLevel === 'number' && i.severityLevel >= 1 && i.severityLevel <= 3)
    .map((i) => ({
      name: (i.description ?? i.eaAreaName ?? 'Unnamed area').trim(),
      // fallback derives from the LEVEL so a missing string can never understate severity
      severity: i.severity ?? SEVERITY_NAMES[i.severityLevel as number],
      severityLevel: i.severityLevel as number,
    }))
    .sort((a, b) => a.severityLevel - b.severityLevel || (a.name < b.name ? -1 : 1));
}

export async function fetchFloodAlerts(lat: number, lng: number): Promise<FloodAlert[]> {
  let res: Response;
  try {
    res = await fetch(floodsUrl(lat, lng));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    throw new FloodUnavailableError('floods endpoint failed');
  }
  try {
    const body = (await res.json()) as { items?: RawFloodItem[] };
    return summariseFloods(body.items ?? []);
  } catch {
    throw new FloodUnavailableError('bad flood payload');
  }
}

/** Compliant outbound entry pages — verified live 2026-08-31 (all HTTP 200). */
export const OFFICIAL_LINKS = {
  floodRiskEngland: 'https://check-long-term-flood-risk.service.gov.uk/postcode',
  floodRiskWales: 'https://naturalresources.wales/flooding/check-your-flood-risk-by-postcode/?lang=en',
  floodAlertsWales: 'https://naturalresources.wales/flooding/?lang=en',
  councilTaxBands: 'https://www.gov.uk/council-tax-bands',
  findLocalCouncil: 'https://www.gov.uk/find-local-council',
  landRegistrySoldPrices: 'https://landregistry.data.gov.uk/',
} as const;
