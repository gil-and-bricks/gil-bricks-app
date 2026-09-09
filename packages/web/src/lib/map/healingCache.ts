/**
 * The pmtiles cache that lets go of a failure (C3).
 *
 * THE BUG THIS FIXES. pmtiles' own SharedPromiseCache stores the PROMISE for
 * the archive header and for each directory, and it never removes one that
 * REJECTS. So a single failed range request — a phone that loses signal for a
 * moment, a rate-limited response, one aborted fetch — leaves a rejected
 * promise in the cache, and every tile asked for afterwards awaits that same
 * rejected promise. The basemap disappears and never comes back, however much
 * you zoom or pan, because nothing is ever fetched again. Reproduced against
 * the live site: blocking ONE range request for four seconds killed the map
 * permanently, and 49 "Failed to fetch" errors followed it.
 *
 * The pre-warm in mapImpl could not save it: retrying getHeader() only re-awaits
 * the same poisoned promise.
 *
 * THE FIX. Drop the entry when the promise rejects, so the next request tries
 * again. A blip is then a blip.
 */
import { SharedPromiseCache } from 'pmtiles';
import type { Entry, Header, Source } from 'pmtiles';

/** The rejection a map raises itself when it cancels an in-flight fetch — a
 *  zoom that supersedes another. pmtiles already evicts those; leave them be. */
export function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';
}

export class HealingPmtilesCache extends SharedPromiseCache {
  override async getHeader(source: Source): Promise<Header> {
    try {
      return await super.getHeader(source);
    } catch (err) {
      // The header is cached under the source key alone, so this is exact.
      this.cache.delete(source.getKey());
      throw err;
    }
  }

  override async getDirectory(
    source: Source,
    offset: number,
    length: number,
    header: Header,
    signal?: AbortSignal,
  ): Promise<Entry[]> {
    try {
      return await super.getDirectory(source, offset, length, header, signal);
    } catch (err) {
      // A directory is cached under a key the library composes privately. Rather
      // than re-deriving a format we do not own, drop everything. That is blunt:
      // it discards the header, the root directory and every leaf directory
      // cached so far (the library holds up to 100 entries), so the next few
      // tiles re-fetch the header and the directories they need — a handful of
      // small range requests. A real failure is rare, and the alternative is a
      // key format that could drift silently and leave the poison in place.
      if (!isAbortError(err)) this.cache.clear();
      throw err;
    }
  }
}
