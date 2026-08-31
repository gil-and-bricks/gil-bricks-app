/**
 * Analyser state lives in the URL query string — shareable and restorable,
 * nothing personal. Signals drive the live recompute.
 */
import { signal } from '@preact/signals';

export interface SubjectState {
  postcode: string;
  price: string;
  type: '' | 'D' | 'S' | 'T' | 'F';
  area: string;
  beds: string;
  baths: string;
  refurb: '' | 'none' | 'light' | 'moderate' | 'heavy';
  age: '' | 'pre1900' | '1900-1949' | '1950-1999' | '2000plus';
  garden: '' | 'none' | 'yes';
  parking: '' | '0' | '1' | '2plus';
  paon: string;
  saon: string;
}

export interface CompsFilterState {
  radius: '0.25' | '0.5' | '1';
  period: '6' | '12';
  ctype: 'all' | 'D' | 'S' | 'DS' | 'T' | 'houses' | 'F';
  tenure: 'any' | 'F' | 'L';
  cage: 'all' | 'new' | 'old';
  minArea: string;
  maxArea: string;
  minPrice: string;
  maxPrice: string;
  excluded: string; // comma-joined ids
  /** Comps presentation: list (accessible default) or map (S7.1). */
  view: 'list' | 'map';
}

export type UrlState = SubjectState & CompsFilterState;

export const DEFAULTS: UrlState = {
  postcode: '', price: '', type: '', area: '', beds: '', baths: '',
  refurb: '', age: '', garden: '', parking: '', paon: '', saon: '',
  radius: '0.5', period: '12', ctype: 'all', tenure: 'any', cage: 'all',
  minArea: '', maxArea: '', minPrice: '', maxPrice: '', excluded: '', view: 'list',
};

export const state = signal<UrlState>({ ...DEFAULTS });

/** Strategy-specific params (keys defined by StrategyConfig fields). */
export const strategyParams = signal<Record<string, string>>({});
let strategyDefaults: Record<string, string> = {};

const ALLOWED: Partial<Record<keyof UrlState, string[]>> = {
  type: ['', 'D', 'S', 'T', 'F'],
  refurb: ['', 'none', 'light', 'moderate', 'heavy'],
  age: ['', 'pre1900', '1900-1949', '1950-1999', '2000plus'],
  garden: ['', 'none', 'yes'],
  parking: ['', '0', '1', '2plus'],
  radius: ['0.25', '0.5', '1'],
  period: ['6', '12'],
  ctype: ['all', 'D', 'S', 'DS', 'T', 'houses', 'F'],
  tenure: ['any', 'F', 'L'],
  cage: ['all', 'new', 'old'],
  view: ['list', 'map'],
};

export function parseQuery(search: string): UrlState {
  const q = new URLSearchParams(search);
  const out = { ...DEFAULTS } as unknown as Record<string, string>;
  for (const key of Object.keys(DEFAULTS)) {
    const v = q.get(key);
    if (v === null) continue;
    const allowed = ALLOWED[key as keyof UrlState];
    // hand-edited links clamp to the default rather than surfacing raw errors
    if (allowed && !allowed.includes(v)) continue;
    out[key] = v;
  }
  return out as unknown as UrlState;
}

export function toQuery(s: UrlState, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) {
    if (v !== '' && v !== (DEFAULTS as unknown as Record<string, string>)[k]) q.set(k, v);
  }
  for (const [k, v] of Object.entries(extra)) {
    if (v !== '' && v !== strategyDefaults[k]) q.set(k, v);
  }
  const str = q.toString();
  return str === '' ? '' : `?${str}`;
}

let writeTimer: ReturnType<typeof setTimeout> | undefined;

function writeUrl(): void {
  if (typeof window === 'undefined') return;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    history.replaceState(null, '', `${location.pathname}${toQuery(state.value, strategyParams.value)}`);
  }, 250);
}

export function update(patch: Partial<UrlState>): void {
  state.value = { ...state.value, ...patch };
  writeUrl();
}

export function updateStrategy(patch: Record<string, string>): void {
  strategyParams.value = { ...strategyParams.value, ...patch };
  writeUrl();
}

export interface StrategyFieldSpec {
  key: string;
  kind: 'number' | 'select';
  default: string;
  options?: { value: string }[];
}

/** Called by the verdict island: registers its fields and hydrates values
 * from the URL. Hand-edited links CLAMP to the default (selects must match
 * an option; numbers must parse) — the same contract as parseQuery. Field
 * keys must never collide with UrlState keys (enforced by a test). */
export function initStrategyParams(fields: StrategyFieldSpec[]): void {
  const defaults: Record<string, string> = {};
  for (const f of fields) defaults[f.key] = f.default;
  strategyDefaults = defaults;
  const q = typeof window !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const out: Record<string, string> = { ...defaults };
  for (const f of fields) {
    const v = q.get(f.key);
    if (v === null) continue;
    if (f.kind === 'select') {
      if ((f.options ?? []).some((o) => o.value === v)) out[f.key] = v;
    } else if (v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0)) {
      out[f.key] = v;
    }
  }
  strategyParams.value = out;
}

export function initFromUrl(): void {
  if (typeof window !== 'undefined') {
    state.value = parseQuery(location.search);
  }
}

const POSTCODE_RE = /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/;

/** The form is valid enough to compute when these hold. */
export function isReady(s: UrlState): boolean {
  return POSTCODE_RE.test(s.postcode.trim()) && Number(s.price) > 0 && s.type !== '';
}

/** The comparables-only page needs just a postcode (S7.1). */
export function isCompsReady(s: UrlState): boolean {
  return POSTCODE_RE.test(s.postcode.trim());
}
