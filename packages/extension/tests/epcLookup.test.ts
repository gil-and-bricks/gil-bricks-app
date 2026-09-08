import { describe, expect, it } from 'vitest';
import { lookupEpcArea, EPC_ENDPOINT } from '../src/epcLookup';

/**
 * The extension asks OUR Worker, never the register (E1).
 *
 * The extension cannot hold the register's bearer token — a token in a
 * published package is a published token, which is exactly why runtime EPC
 * calls were ruled out here before. These tests pin the property that makes
 * the feature safe to have at all.
 */
const res = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

describe('the extension never talks to the register itself', () => {
  it('calls our own app, on our own endpoint', async () => {
    const seen: string[] = [];
    const fetcher = (async (url: string) => { seen.push(String(url)); return res({ ok: true, sqm: 70, source: 'register' }); }) as unknown as typeof fetch;
    await lookupEpcArea('CF37 1DL', '8', '', { fetch: fetcher, base: 'https://example.test' });
    expect(seen[0]).toContain('https://example.test' + EPC_ENDPOINT);
    expect(seen[0]).not.toContain('get-energy-performance-data');
  });

  it('sends no Authorization header, because it has no token to send', async () => {
    let init: RequestInit | undefined;
    const fetcher = (async (_u: string, i: RequestInit) => { init = i; return res({ ok: true, sqm: 70, source: 'register' }); }) as unknown as typeof fetch;
    await lookupEpcArea('CF37 1DL', '8', '', { fetch: fetcher, base: 'https://example.test' });
    expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/authorization/i);
  });

  it('passes the flat through, so a block of flats resolves to one flat', async () => {
    const seen: string[] = [];
    const fetcher = (async (url: string) => { seen.push(String(url)); return res({ ok: true, sqm: 45, source: 'register' }); }) as unknown as typeof fetch;
    await lookupEpcArea('CF37 1DL', '8', 'Flat 2', { fetch: fetcher, base: 'https://example.test' });
    const q = new URL(seen[0]).searchParams;
    expect(q.get('saon')).toBe('Flat 2');
    expect(q.get('paon')).toBe('8');
    expect(q.get('postcode')).toBe('CF37 1DL');
  });

  it('gets the SAME answer shape the web app gets', async () => {
    const fetcher = (async () => res({ ok: true, sqm: 70, source: 'register', certificateNumber: 'C1' })) as unknown as typeof fetch;
    const got = await lookupEpcArea('CF37 1DL', '8', '', { fetch: fetcher, base: 'https://example.test' });
    expect(got).toEqual({ ok: true, sqm: 70, source: 'register', certificateNumber: 'C1' });
  });
});

describe('the extension fails honestly too', () => {
  it('a dead endpoint is unavailable, never a wrong number', async () => {
    const fetcher = (async () => res({}, 500)) as unknown as typeof fetch;
    expect(await lookupEpcArea('CF37 1DL', '8', '', { fetch: fetcher })).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('a thrown fetch is unavailable', async () => {
    const fetcher = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await lookupEpcArea('CF37 1DL', '8', '', { fetch: fetcher })).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('a body that is not our shape is unavailable, not trusted', async () => {
    const fetcher = (async () => new Response('<html>nope</html>', { status: 200 })) as unknown as typeof fetch;
    expect(await lookupEpcArea('CF37 1DL', '8', '', { fetch: fetcher })).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('no postcode is asked about before a request is made', async () => {
    let called = false;
    const fetcher = (async () => { called = true; return res({}); }) as unknown as typeof fetch;
    expect(await lookupEpcArea('', '8', '', { fetch: fetcher })).toEqual({ ok: false, reason: 'needs-postcode' });
    expect(called).toBe(false);
  });
});
