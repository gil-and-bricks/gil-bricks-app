import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS, pushToKit, shouldAttempt } from './outbox';

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('shouldAttempt (backoff)', () => {
  const T0 = Date.parse('2026-08-31T12:00:00Z');
  const sub = { action: 'subscribe' };
  it('fresh rows attempt immediately', () => {
    expect(shouldAttempt({ ...sub, attempts: 0, last_attempt: null }, T0)).toBe(true);
  });
  it('retry k waits 15min × 2^(k-1)', () => {
    const last = new Date(T0).toISOString();
    expect(shouldAttempt({ ...sub, attempts: 1, last_attempt: last }, T0 + 14 * 60_000)).toBe(false);
    expect(shouldAttempt({ ...sub, attempts: 1, last_attempt: last }, T0 + 15 * 60_000)).toBe(true);
    expect(shouldAttempt({ ...sub, attempts: 3, last_attempt: last }, T0 + 59 * 60_000)).toBe(false);
    expect(shouldAttempt({ ...sub, attempts: 3, last_attempt: last }, T0 + 60 * 60_000)).toBe(true);
  });
  it('subscribes cap at MAX_ATTEMPTS', () => {
    expect(shouldAttempt({ ...sub, attempts: MAX_ATTEMPTS, last_attempt: null }, T0 + 1e12)).toBe(false);
  });
  it('UNSUBSCRIBES never give up — capped 2h backoff forever', () => {
    const last = new Date(T0).toISOString();
    const unsub = { action: 'unsubscribe', attempts: 9, last_attempt: last };
    expect(shouldAttempt(unsub, T0 + 119 * 60_000)).toBe(false);
    expect(shouldAttempt(unsub, T0 + 120 * 60_000)).toBe(true);
  });
});

describe('pushToKit', () => {
  it('subscribe posts email + first name with the key header, 201 → ok', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const result = await pushToKit(
      { email: 'a@b.c', first_name: 'Gil', action: 'subscribe' },
      'key-1',
      (async (url: string, init: RequestInit) => {
        captured = { url, init };
        return jsonRes({}, 201);
      }) as unknown as typeof fetch,
    );
    expect(result.ok).toBe(true);
    expect(captured!.url).toBe('https://api.kit.com/v4/subscribers');
    expect((captured!.init.headers as Record<string, string>)['X-Kit-Api-Key']).toBe('key-1');
    expect(JSON.parse(captured!.init.body as string)).toEqual({ email_address: 'a@b.c', first_name: 'Gil' });
  });
  it('subscribe 200 (update) and 202 (async) also count as ok', async () => {
    for (const status of [200, 202]) {
      const r = await pushToKit({ email: 'a@b.c', first_name: '', action: 'subscribe' }, 'k', (async () => jsonRes({}, status)) as unknown as typeof fetch);
      expect(r.ok).toBe(true);
    }
  });
  it('subscribe failure carries the status, never the key', async () => {
    const r = await pushToKit({ email: 'a@b.c', first_name: '', action: 'subscribe' }, 'sekrit', (async () => jsonRes({}, 500)) as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, error: 'kit subscribe HTTP 500' });
  });
  it('unsubscribe finds by email then posts to /{id}/unsubscribe', async () => {
    const calls: string[] = [];
    const r = await pushToKit(
      { email: 'a@b.c', first_name: '', action: 'unsubscribe' },
      'k',
      (async (url: string) => {
        calls.push(url);
        if (url.includes('email_address=')) return jsonRes({ subscribers: [{ id: 42 }] });
        return new Response(null, { status: 204 });
      }) as unknown as typeof fetch,
    );
    expect(r.ok).toBe(true);
    expect(calls[1]).toBe('https://api.kit.com/v4/subscribers/42/unsubscribe');
  });
  it('unsubscribe when never subscribed → honest ok with a note', async () => {
    const r = await pushToKit({ email: 'a@b.c', first_name: '', action: 'unsubscribe' }, 'k', (async () => jsonRes({ subscribers: [] })) as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, note: 'not-in-kit' });
  });
  it('network failure → retriable error', async () => {
    const r = await pushToKit({ email: 'a@b.c', first_name: '', action: 'subscribe' }, 'k', (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, error: 'kit unreachable' });
  });
});
