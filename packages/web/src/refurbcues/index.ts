/**
 * R3 — THE ONLY DOOR IN OR OUT OF THE CUE MODULE.
 *
 * Everything the refurb section needs, and nothing of how it works. The library,
 * the selection rules, the seen-set and the carousel all live behind this, so
 * the whole feature can be deleted in one cut.
 *
 * THE IMAGE POSITION IS F1's, UNCHANGED: photos are addresses on the portal's
 * own server, rendered by the browser with `<img src>`. This module makes no
 * network call of its own, holds no bytes, and every capture API is banned in
 * it by test. What crosses this boundary is cue keys and cost-item keys.
 */
export { PhotoCarousel, type CarouselProps } from './carousel';
export { CUE_ROOMS, type CueRoom, type CueConfidence, type RefurbCue } from './types';
export { candidates, exhausted, nextCue } from './select';
export { flushSeen, loadSeen, merge, readLocal, writeLocal } from './seen';
export { CUES, REGULATIONS, libraryReady } from './library';

/** A photo URL we will display: the portal's, over https, never bytes we hold. */
export function isDisplayablePhotoUrl(url: string): boolean {
  if (typeof url !== 'string' || url.trim() === '') return false;
  const lowered = url.trim().toLowerCase();
  if (/^(blob:|data:|filesystem:)/.test(lowered)) return false;
  return /^https:\/\//.test(lowered);
}

/** The photos carried in a handoff, filtered to what we will show. */
export function photosFromParam(raw: string | null): string[] {
  if (raw === null || raw.trim() === '') return [];
  return raw.split(/\s+/).map((u) => u.trim()).filter(isDisplayablePhotoUrl);
}
