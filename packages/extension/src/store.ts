/**
 * chrome.storage.local helpers (E6). Uses only the "storage" permission. All
 * reads fail soft to a default so a fresh install / private window still works.
 */
async function getLocal<T>(key: string, fallback: T): Promise<T> {
  try {
    const r = await chrome.storage.local.get(key);
    return (r?.[key] as T) ?? fallback;
  } catch {
    return fallback;
  }
}
async function setLocal(key: string, value: unknown): Promise<void> {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch {
    /* quota / unavailable — non-fatal */
  }
}

// Rent is remembered PER postcode-sector so repeat triage in the same patch is one tap.
const rentKey = (sector: string) => `gb:rent:${sector}`;
export const getRent = (sector: string) => getLocal<string>(rentKey(sector), '');
export const setRent = (sector: string, rent: string) => setLocal(rentKey(sector), rent);

// Assumptions (deposit, rate, …) are global across listings.
export const getAssumptions = () => getLocal<Record<string, string>>('gb:assumptions', {});
export const setAssumptions = (a: Record<string, string>) => setLocal('gb:assumptions', a);

// The user's default strategy.
export const getStrategy = () => getLocal<string>('gb:strategy', 'btl');
export const setStrategy = (s: string) => setLocal('gb:strategy', s);

// A manually-entered floor area, remembered per listing id.
const areaKey = (id: string) => `gb:area:${id}`;
export const getManualArea = (id: string) => getLocal<string>(areaKey(id), '');
export const setManualArea = (id: string, v: string) => setLocal(areaKey(id), v);

// Global settings (every input that's NOT a triage unknown), by field key.
export const getSettings = () => getLocal<Record<string, string>>('gb:settings', {});
export const setSettings = (s: Record<string, string>) => setLocal('gb:settings', s);

// Personal criteria (the user's own bars) — stored as-is (numbers).
import type { Criteria } from '@gil-bricks/core';
export const getCriteria = () => getLocal<Criteria>('gb:criteria', {});
export const setCriteria = (c: Criteria) => setLocal('gb:criteria', c);

// Per-listing triage unknowns (end value, refurb, rooms, room rent). Rent is
// kept per-sector (above) so it carries across listings in the same patch.
const unkKey = (id: string) => `gb:unk:${id}`;
export const getUnknowns = (id: string) => getLocal<Record<string, string>>(unkKey(id), {});
export const setUnknowns = (id: string, u: Record<string, string>) => setLocal(unkKey(id), u);
