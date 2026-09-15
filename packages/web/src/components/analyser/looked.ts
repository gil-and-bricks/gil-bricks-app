/**
 * C1 — THE RUNTIME SIDE OF THE COMPARABLES GATE.
 *
 * The DECISION is in lib/comparablesLooked.ts and is pure. This holds the
 * signals it reads, remembers a satisfied gate for the session, and nothing
 * else. Keeping the two apart is what lets the rule be tested without a DOM,
 * and what stops a component quietly inventing a fourth way to count as having
 * looked.
 *
 * NOTHING HERE WRITES A SIGNAL WHILE SOMETHING IS RENDERING. `lookedAt` is a
 * pure read, keyed by the subject; the state is only ever moved by the two
 * `mark` calls, which are events. A gate that reset itself mid-render would
 * flicker a valuation on and off under somebody typing a postcode.
 */
import { signal } from '@preact/signals';
import { hasLooked, STORE_PREFIX, subjectKey } from '../../lib/comparablesLooked';

interface GateState {
  /** The property these signals belong to. A different one starts again. */
  key: string;
  endOfListSeen: boolean;
  worked: boolean;
}

const gate = signal<GateState>({ key: '', endOfListSeen: false, worked: false });

const canObserve = (): boolean =>
  typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';

function remembered(key: string): boolean {
  try {
    return window.sessionStorage.getItem(`${STORE_PREFIX}${key}`) === '1';
  } catch {
    // A browser refusing storage is not evidence either way. The live signals
    // still answer; the gate simply asks again after a reload.
    return false;
  }
}

function remember(key: string): void {
  try {
    window.sessionStorage.setItem(`${STORE_PREFIX}${key}`, '1');
  } catch { /* storage refused — the live signals still hold for this view */ }
}

export type Subject = { postcode: string; paon: string; saon: string };

/** Has this property's comparables been looked at? Reads only. */
export function lookedAt(s: Subject): boolean {
  const key = subjectKey(s);
  const g = gate.value;
  const mine = g.key === key;
  return hasLooked({
    endOfListSeen: (mine && g.endOfListSeen) || remembered(key),
    worked: mine && g.worked,
    canObserve: canObserve(),
  });
}

function mark(s: Subject, field: 'endOfListSeen' | 'worked'): void {
  const key = subjectKey(s);
  const g = gate.value;
  const base = g.key === key ? g : { key, endOfListSeen: false, worked: false };
  if (base[field]) return;
  gate.value = { ...base, [field]: true };
  remember(key);
}

/** The end of the list came on screen. */
export const markEndOfListSeen = (s: Subject): void => mark(s, 'endOfListSeen');
/** A filter moved, or a sale was ticked or unticked. */
export const markWorked = (s: Subject): void => mark(s, 'worked');

/** Tests only: forget everything, so one case cannot leak into the next. */
export function __resetLooked(): void {
  gate.value = { key: '', endOfListSeen: false, worked: false };
  try { 
    for (const k of Object.keys(window.sessionStorage)) {
      if (k.startsWith(STORE_PREFIX)) window.sessionStorage.removeItem(k);
    }
  } catch { /* nothing stored */ }
}
