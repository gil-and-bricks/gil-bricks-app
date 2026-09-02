/**
 * Small value normalisers shared by the extractors. Each returns null on
 * anything it can't confidently parse, so the caller marks the field `missing`
 * rather than guessing.
 */
import type { ListingUpdate } from './types';

const SQM_PER_SQFT = 0.09290304;

/** "£170,000" | "170000" | 170000 → 170000; null if not a number. */
export function parseMoney(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const digits = v.replace(/[^0-9.]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Square feet → square metres (rounded), or null. */
export function sqftToSqm(sqft: unknown): number | null {
  const n = typeof sqft === 'number' ? sqft : Number(sqft);
  return Number.isFinite(n) && n > 0 ? Math.round(n * SQM_PER_SQFT) : null;
}

/** "09/06/2026" (dd/mm/yyyy) → "2026-06-09"; passes through ISO; null otherwise. */
export function toIsoDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const uk = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());
  if (uk) return `${uk[3]}-${uk[2]}-${uk[1]}`;
  return null;
}

/** "Reduced on 09/06/2026" | "Added on 30/05/2026" → {reason,date}; null otherwise. */
export function parseListingUpdate(v: unknown): ListingUpdate | null {
  if (typeof v !== 'string') return null;
  const m = /^(\w+)\s+on\s+(\d{2}\/\d{2}\/\d{4})/i.exec(v.trim());
  if (!m) return null;
  const date = toIsoDate(m[2]);
  if (!date) return null;
  return { reason: m[1].toLowerCase(), date };
}

export interface RightmoveFloorArea {
  /** Midpoint in sqm (the stated convention when it's a range). */
  midSqm: number;
  minSqm: number;
  maxSqm: number;
  isRange: boolean;
}

/**
 * Rightmove sizings → floor area in sqm. Rightmove can publish a RANGE
 * (e.g. "4,216-4,910 sq ft / 392-456 sq m"); we parse both ends and NEVER
 * present the top as fact. Prefers a sqm entry, else converts sqft. Returns the
 * midpoint as the working value plus the full range. Null when no size given.
 */
export function rightmoveFloorArea(sizings: unknown): RightmoveFloorArea | null {
  if (!Array.isArray(sizings)) return null;
  let lo: number | null = null;
  let hi: number | null = null;
  for (const s of sizings) {
    const unit = String((s as any)?.unit ?? '').toLowerCase();
    const toSqm =
      unit.includes('sqm') || unit === 'm' || unit.includes('metre')
        ? (x: number) => Math.round(x)
        : unit.includes('sqft') || unit.includes('ft')
          ? (x: number) => sqftToSqm(x)
          : null;
    if (!toSqm) continue;
    const mn = Number((s as any)?.minimumSize);
    const mx = Number((s as any)?.maximumSize);
    const a = Number.isFinite(mn) && mn > 0 ? toSqm(mn) : null;
    const b = Number.isFinite(mx) && mx > 0 ? toSqm(mx) : null;
    if (a == null && b == null) continue;
    lo = a ?? b;
    hi = b ?? a;
    if (unit.includes('sqm')) break; // a sqm entry is authoritative
  }
  if (lo == null || hi == null) return null;
  const min = Math.min(lo, hi);
  const max = Math.max(lo, hi);
  return { midSqm: Math.round((min + max) / 2), minSqm: min, maxSqm: max, isRange: min !== max };
}

/**
 * Rightmove og:title → { bedrooms, propertyType, address } best-effort. Handles
 * both the canonical "N bedroom TYPE for sale in ADDRESS" and the share-card
 * "Check out this N bedroom TYPE for sale on Rightmove" (no address) forms.
 */
export function parseRightmoveOgTitle(title: string | undefined): { bedrooms: number | null; propertyType: string | null; address: string | null } {
  if (!title) return { bedrooms: null, propertyType: null, address: null };
  // Drop a trailing brand suffix (" | Rightmove", " - Rightmove", en/em dash).
  const clean = title.replace(/\s*[|\-–—]\s*Rightmove\s*$/i, '').trim();
  const bt = /(\d+)\s+bedroom\s+(.+?)\s+for sale/i.exec(clean);
  const addrM = /for sale in\s+(.+?)\s*$/i.exec(clean);
  let address = addrM ? addrM[1].trim() : null;
  // Addresses never contain a pipe; strip any leaked brand/segment after one.
  if (address && address.includes('|')) address = address.split('|')[0].trim();
  return {
    bedrooms: bt ? Number(bt[1]) || null : null,
    propertyType: bt ? bt[2].trim() || null : null,
    address: address || null,
  };
}

/** Extract a numeric Rightmove property id from a listing URL, or null. */
export function rightmoveIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = /\/properties\/(\d+)/.exec(url) ?? /property-(\d+)\.html/.exec(url);
  return m ? m[1] : null;
}
