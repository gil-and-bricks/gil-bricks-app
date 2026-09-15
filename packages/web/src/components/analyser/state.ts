/**
 * Analyser state lives in the URL query string — shareable and restorable,
 * nothing personal. Signals drive the live recompute.
 */
import { signal } from '@preact/signals';
import { CRITERIA_PARAMS } from '@gil-bricks/core';
import { criteriaQueryParams } from './criteria';

export interface SubjectState {
  postcode: string;
  price: string;
  type: '' | 'D' | 'S' | 'T' | 'F';
  area: string;
  beds: string;
  baths: string;
  age: '' | 'pre1900' | '1900-1949' | '1950-1999' | '2000plus';
  garden: '' | 'none' | 'yes';
  parking: '' | '0' | '1' | '2plus';
  paon: string;
  saon: string;
}

export interface CompsFilterState {
  /**
   * C1 — 'auto' IS THE DEFAULT ON ALL THREE OF THESE, and it is a sentinel, not
   * a value. It means "use the product's own definition of a comparable" —
   * half a mile, the last 12 months, the subject's own type — and it lets the
   * one widening step move the radius and the window without the select
   * afterwards claiming a number that is not what the list is showing.
   *
   * That disagreement is the whole reason for the sentinel. With a concrete
   * '12' in state, a thin set widened to 24 months would leave "12 months"
   * sitting above 24-month sales, and it would be believed. The 'auto' option's
   * LABEL reports what is actually in force, read off the result the engine
   * returned, so the control cannot say one thing while the list says another.
   */
  radius: 'auto' | '0.25' | '0.5' | '1';
  period: 'auto' | '6' | '12' | '24';
  /**
   * 'auto' here means MATCH THE SUBJECT'S OWN TYPE.
   *
   * It used to default to 'all', which was passed straight to the engine as "no
   * type filter" — so a flat was valued off detached-house £/sqm, and a separate
   * module existed to warn about that afterwards.
   *
   * It is a sentinel rather than seeding `ctype` with the subject's letter
   * because the select must SAY what it is doing: "Same type as this property"
   * is honest, whereas silently showing "Terraced" would look like a choice the
   * person made. Choosing anything else overrides it.
   */
  ctype: 'auto' | 'all' | 'D' | 'S' | 'DS' | 'T' | 'houses' | 'F';
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
  age: '', garden: '', parking: '', paon: '', saon: '',
  radius: 'auto', period: 'auto', ctype: 'auto', tenure: 'any', cage: 'all',
  minArea: '', maxArea: '', minPrice: '', maxPrice: '', excluded: '', view: 'list',
};

export const state = signal<UrlState>({ ...DEFAULTS });

/** Strategy-specific params (keys defined by StrategyConfig fields). */
export const strategyParams = signal<Record<string, string>>({});
let strategyDefaults: Record<string, string> = {};

const ALLOWED: Partial<Record<keyof UrlState, string[]>> = {
  type: ['', 'D', 'S', 'T', 'F'],
  age: ['', 'pre1900', '1900-1949', '1950-1999', '2000plus'],
  garden: ['', 'none', 'yes'],
  parking: ['', '0', '1', '2plus'],
  radius: ['auto', '0.25', '0.5', '1'],
  // C1 — 24 is the widening ladder's second rung; see comparables/rules.ts. It
  // must survive a URL round-trip or a shared widened link would snap back.
  period: ['auto', '6', '12', '24'],
  ctype: ['auto', 'all', 'D', 'S', 'DS', 'T', 'houses', 'F'],
  tenure: ['any', 'F', 'L'],
  cage: ['all', 'new', 'old'],
  view: ['list', 'map'],
};

/**
 * R1 — did this URL come from before the refurb section existed? The old
 * "Light / Moderate / Heavy" dropdown wrote `refurb=` and nothing read it. A
 * saved deal or a shared link can still carry it, and the section says once
 * that the figure carried over rather than leaving an empty list unexplained.
 */
export const legacyRefurbLevel = signal(false);

export function parseQuery(search: string): UrlState {
  const q = new URLSearchParams(search);
  if ((q.get('refurb') ?? '') !== '') legacyRefurbLevel.value = true;
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
  // FIRST, so anything the form owns overwrites it below rather than the other
  // way round: these are the deal's own facts, not a competing source of truth.
  for (const [k, v] of Object.entries(carried)) q.set(k, v);
  for (const [k, v] of Object.entries(s)) {
    if (v !== '' && v !== (DEFAULTS as unknown as Record<string, string>)[k]) q.set(k, v);
  }
  for (const [k, v] of Object.entries(extra)) {
    if (v !== '' && v !== strategyDefaults[k]) q.set(k, v);
  }
  // D4 review — the person's own minimums ride on every URL this page writes,
  // including the one a SAVE stores. Without them the analyser judged by their
  // bar and the board silently re-judged by ours.
  for (const [k, v] of Object.entries(criteriaQueryParams())) q.set(k, v);
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
/**
 * WHAT ARRIVED WITH THE DEAL AND IS NOT PART OF THE FORM.
 *
 * The URL this page writes used to be rebuilt from the form's own state alone —
 * the property fields, the strategy fields and the D4 criteria. Anything else
 * that arrived was silently discarded on the FIRST write, before the page had
 * even been touched. The listing's photographs (`ph`) and its floor plan (`fp`)
 * are exactly that: they came from the listing, they belong to the deal, and
 * nobody can retype them. Editing one number threw them away and everything
 * downstream then correctly rendered nothing, because there was nothing left.
 *
 * So they are captured once, at load, and re-emitted on every URL this page
 * writes — including the one a SAVE stores, so a deal reopened from the
 * pipeline still has its photographs. Owned keys always win, so this can never
 * resurrect a stale value for a field the person is editing.
 */
let carried: Record<string, string> = {};

export function initStrategyParams(fields: StrategyFieldSpec[]): void {
  const defaults: Record<string, string> = {};
  for (const f of fields) defaults[f.key] = f.default;
  strategyDefaults = defaults;
  const q = typeof window !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

  // Everything the writer does NOT own is carried through untouched.
  const owned = new Set<string>([
    ...Object.keys(DEFAULTS as unknown as Record<string, string>),
    ...fields.map((f) => f.key),
    ...Object.values(CRITERIA_PARAMS),
  ]);
  const keep: Record<string, string> = {};
  for (const [k, v] of q.entries()) if (!owned.has(k) && v !== '') keep[k] = v;
  carried = keep;
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
