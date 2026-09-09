import { SharedPromiseCache, type Header, type RangeResponse, type Source } from 'pmtiles';
import { beforeEach, describe, expect, it } from 'vitest';
import { HealingPmtilesCache, isAbortError } from './healingCache';

/**
 * The map that disappeared when you zoomed (C3), pinned.
 *
 * pmtiles caches the PROMISE for the archive header and for every directory and
 * never removes one that rejected, so ONE failed range request killed the
 * basemap for the life of the page. Reproduced against the live site by
 * blocking a single request for four seconds: the map never came back, at any
 * zoom, and 49 "Failed to fetch" errors followed.
 *
 * Every test below runs TWICE — once against the library's own cache to show
 * the failure is real, once against ours to show it is fixed. Without the first
 * half the second half proves nothing.
 */

/** A 16KB archive: v3 header, an empty root directory, one leaf directory. */
const ROOT_OFFSET = 127;
const LEAF_OFFSET = 200;
const LEAF_BYTES = [0x01, 0x00, 0x01, 0x64, 0x01]; // one entry, varint-encoded

function archive(): Uint8Array {
  const buf = new Uint8Array(16384);
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, 19792, true); // "PM"
  buf[7] = 3; // spec version
  const u64 = (at: number, v: number) => {
    dv.setUint32(at, v >>> 0, true);
    dv.setUint32(at + 4, Math.floor(v / 2 ** 32), true);
  };
  u64(8, ROOT_OFFSET);
  u64(16, 1); // a single varint 0 — zero entries
  u64(40, LEAF_OFFSET);
  u64(48, LEAF_BYTES.length);
  u64(56, 1024);
  buf[96] = 1; // clustered
  buf[97] = 1; // internal compression: none, so no gzip in a unit test
  buf[98] = 1;
  buf[99] = 1; // mvt
  buf[101] = 14; // maxZoom
  buf[ROOT_OFFSET] = 0x00;
  buf.set(LEAF_BYTES, LEAF_OFFSET);
  return buf;
}

const BYTES = archive();

class FlakySource implements Source {
  failNext = 0;
  failWith: Error = new TypeError('Failed to fetch');
  calls = 0;

  getKey(): string {
    return 'https://example.test/ew.pmtiles';
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    this.calls += 1;
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw this.failWith;
    }
    return { data: BYTES.slice(offset, offset + length).buffer as ArrayBuffer };
  }
}

const abortError = (): Error => {
  const e = new Error('The operation was aborted.');
  e.name = 'AbortError';
  return e;
};

let source: FlakySource;
beforeEach(() => {
  source = new FlakySource();
});

describe('one failed range request must not kill the archive', () => {
  it('THE BUG: the library’s own cache never lets go of the failure', async () => {
    const cache = new SharedPromiseCache();
    source.failNext = 1;
    await expect(cache.getHeader(source)).rejects.toThrow('Failed to fetch');
    // the network is fine again — and it makes no difference
    await expect(cache.getHeader(source), 'poisoned for the life of the page').rejects.toThrow('Failed to fetch');
    expect(source.calls, 'it never even tried again').toBe(1);
  });

  it('THE FIX: ours tries again, and the map comes back', async () => {
    const cache = new HealingPmtilesCache();
    source.failNext = 1;
    await expect(cache.getHeader(source)).rejects.toThrow('Failed to fetch');
    const header = await cache.getHeader(source);
    expect(header.maxZoom).toBe(14);
    expect(source.calls, 'it fetched a second time').toBe(2);
  });

  it('and a header that worked is still cached, not refetched every tile', async () => {
    const cache = new HealingPmtilesCache();
    await cache.getHeader(source);
    await cache.getHeader(source);
    await cache.getHeader(source);
    expect(source.calls).toBe(1);
  });
});

describe('a directory that failed is retried too — that is the zoom case', () => {
  const dir = async (cache: SharedPromiseCache, header: Header) =>
    cache.getDirectory(source, LEAF_OFFSET, LEAF_BYTES.length, header);

  it('THE BUG: the library’s cache keeps the rejected directory', async () => {
    const cache = new SharedPromiseCache();
    const header = await cache.getHeader(source);
    source.failNext = 1;
    await expect(dir(cache, header)).rejects.toThrow('Failed to fetch');
    await expect(dir(cache, header), 'every tile under that leaf is dead').rejects.toThrow('Failed to fetch');
  });

  it('THE FIX: ours refetches and the tiles return', async () => {
    const cache = new HealingPmtilesCache();
    const header = await cache.getHeader(source);
    source.failNext = 1;
    await expect(dir(cache, header)).rejects.toThrow('Failed to fetch');
    const entries = await dir(cache, header);
    expect(entries).toHaveLength(1);
    expect(entries[0].length).toBe(100);
  });

  it('an ABORT is left alone — the library already handles those, and a zoom aborts a lot', async () => {
    const cache = new HealingPmtilesCache();
    const header = await cache.getHeader(source);
    source.failNext = 1;
    source.failWith = abortError();
    await expect(dir(cache, header)).rejects.toThrow('aborted');
    expect(cache.cache.has(source.getKey()), 'the good header survived the abort').toBe(true);
  });

  it('but a real failure clears the cache, so nothing poisoned can be left behind', async () => {
    const cache = new HealingPmtilesCache();
    const header = await cache.getHeader(source);
    expect(cache.cache.has(source.getKey())).toBe(true);
    source.failNext = 1;
    await expect(dir(cache, header)).rejects.toThrow('Failed to fetch');
    expect(cache.cache.size).toBe(0);
  });
});

describe('telling the two kinds of failure apart', () => {
  it('knows an abort from a network failure', () => {
    expect(isAbortError(abortError())).toBe(true);
    expect(isAbortError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
  });
});
