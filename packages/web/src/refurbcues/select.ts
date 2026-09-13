/**
 * R3 — WHICH TIP TO SHOW, and never the same one twice.
 *
 * Pure functions: given the library, a room and what this person has already
 * seen, return the tip. No DOM, no storage, no network — so "by my tenth deal I
 * must not be seeing the same five tips" is a property that can be proved.
 */
import { CUES, libraryReady } from './library';
import type { CueConfidence, CueRoom, RefurbCue } from './types';

/**
 * Value order. Conclusive first because it is worth most; weak last because it
 * is barely evidence and, per the brief, "should barely be shown at all".
 * 'strong' sits second: the observation is reliable even where the implication
 * is not, which is exactly the research's own middle rung.
 */
const WEIGHT: Record<CueConfidence, number> = { conclusive: 0, strong: 1, indicative: 2, weak: 3 };

/**
 * The candidates for a photo, best first.
 *
 * WHEN A ROOM IS TAGGED we serve that room's cues, then the general ones. When
 * it is NOT, we serve everything in value order, worded generally — and we
 * never imply the room was detected, because it was not: the user taps it or
 * nobody does.
 */
export function candidates(room: CueRoom | null): RefurbCue[] {
  if (!libraryReady()) return [];
  const matches = room === null
    ? [...CUES]
    : [...CUES.filter((c) => c.room === room), ...CUES.filter((c) => c.room === 'any')];
  return matches.sort((a, b) => WEIGHT[a.confidence] - WEIGHT[b.confidence]);
}

/**
 * The one tip to show, or null when this person has seen them all.
 *
 * `seen` is the person's whole history across every property, so a cue used on
 * deal one never returns on deal ten. Returning null rather than recycling is
 * the point: the screen then says so, honestly.
 */
export function nextCue(room: CueRoom | null, seen: ReadonlySet<string>, alreadyShown: ReadonlySet<string>): RefurbCue | null {
  for (const cue of candidates(room)) {
    if (seen.has(cue.key) || alreadyShown.has(cue.key)) continue;
    return cue;
  }
  return null;
}

/** Has this person exhausted what we can offer for this room? */
export function exhausted(room: CueRoom | null, seen: ReadonlySet<string>): boolean {
  return libraryReady() && candidates(room).every((c) => seen.has(c.key));
}
