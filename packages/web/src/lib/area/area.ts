/**
 * Pure helpers for the Area Data dashboard. UKHPI maths is COUNTRY-level
 * (England or Wales) — we do not have local-authority granularity yet
 * (logged as a future upgrade in DECISIONS_LOG S5.1).
 */
import type { Sale } from '@gil-bricks/core';
import { AREA_COPY } from '../../config/area';

/** % change of the index over `years` ending at endMonth; null when either month is missing. */
export function hpiChangePct(index: Record<string, number>, endMonth: string, years: number): number | null {
  const [y, m] = endMonth.split('-').map(Number);
  const startMonth = `${y - years}-${String(m).padStart(2, '0')}`;
  const a = index[startMonth];
  const b = index[endMonth];
  if (a === undefined || b === undefined || a === 0) return null;
  return Math.round(((b - a) / a) * 1000) / 10;
}

/** Monthly index points for the `years` ending at endMonth, oldest first. Missing months are skipped. */
export function hpiSeries(index: Record<string, number>, endMonth: string, years: number): { month: string; value: number }[] {
  const [ey, em] = endMonth.split('-').map(Number);
  const out: { month: string; value: number }[] = [];
  for (let k = (ey - years) * 12 + (em - 1); k <= ey * 12 + (em - 1); k += 1) {
    const month = `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;
    const v = index[month];
    if (v !== undefined) out.push({ month, value: v });
  }
  return out;
}

/** Plain-English deprivation words for a 1–10 decile (1 = most deprived tenth). */
export function decileWords(decile: number): string {
  const words = AREA_COPY.deprivation.decileWords;
  if (decile === 1) return words.mostDeprived;
  if (decile === 10) return words.leastDeprived;
  if (decile <= 3) return words.moreDeprived;
  if (decile <= 5) return words.belowMiddle;
  if (decile <= 7) return words.aboveMiddle;
  return words.lessDeprived;
}

/** Most common town across the sector's sales; ties to the first alphabetically. */
export function modalTown(sales: Pick<Sale, 'town'>[]): string | null {
  const tally = new Map<string, number>();
  for (const s of sales) {
    const t = s.town.trim();
    if (t === '') continue;
    tally.set(t, (tally.get(t) ?? 0) + 1);
  }
  let best: { town: string; n: number } | null = null;
  for (const [town, n] of tally) {
    if (best === null || n > best.n || (n === best.n && town < best.town)) best = { town, n };
  }
  return best ? best.town : null;
}

/** "2026-07" → "July 2026" for as-of labels. */
export function monthLabel(yyyyMm: string): string {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const [y, m] = yyyyMm.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
