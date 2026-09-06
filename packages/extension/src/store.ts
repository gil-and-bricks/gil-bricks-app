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

// First-run hint dismissal — shown once, never again after the user closes it.
export const getFirstRunDismissed = () => getLocal<boolean>('gb:firstRunDismissed', false);
export const setFirstRunDismissed = () => setLocal('gb:firstRunDismissed', true);

/**
 * Whether chrome.storage.local is actually usable (a private window or a
 * quota-blocked profile can make writes throw). Round-trips a tiny probe so the
 * panel can tell the user honestly that their settings won't be remembered
 * THIS session, rather than silently losing them.
 */
export async function storageAvailable(): Promise<boolean> {
  try {
    await chrome.storage.local.set({ 'gb:probe': 1 });
    await chrome.storage.local.remove('gb:probe');
    return true;
  } catch {
    return false;
  }
}

// D1: "Hide" on the in-page button means hide — the choice is remembered here,
// and the panel's Settings screen carries the switch that brings it back
// ("Show the button on listings"), so it is never a one-way door.
export const getOpenerHidden = () => getLocal<boolean>('gb:opener-hidden', false);
export const setOpenerHidden = (hidden: boolean) => setLocal('gb:opener-hidden', hidden);

// P10 — the daily attention badge. Default ON (the operator asked for that), and
// OFF has to mean silent: the background clears the badge and stops fetching.
export const getReminders = () => getLocal<boolean>('gb:reminders', true);
export const setReminders = (on: boolean) => setLocal('gb:reminders', on);

// The last local day a notification was shown — the "at most one a day" guard: a
// service worker that wakes twice reads the same day and stays quiet.
export const getLastNotified = () => getLocal<string>('gb:lastNotified', '');
export const setLastNotified = (day: string) => setLocal('gb:lastNotified', day);

// And the deadlines already announced ("<dealId>:<day>"), so a date left
// uncleared cannot fire a notification every morning for ever. Capped: this is a
// short memory of what has been said, not a log.
export const getNotifiedKeys = () => getLocal<string[]>('gb:notifiedKeys', []);
export const setNotifiedKeys = (keys: string[]) => setLocal('gb:notifiedKeys', keys);

/**
 * The last attention count and WHEN it was taken. The panel shows it only while
 * it is as fresh as the badge is (ATTENTION.freshHours), so the two surfaces can
 * never say different things about the same board (P10 review).
 */
export interface AttentionSnapshot { count: number; at: number }
export const getAttention = () => getLocal<AttentionSnapshot>('gb:attention', { count: 0, at: 0 });
export const setAttention = (a: AttentionSnapshot) => setLocal('gb:attention', a);
