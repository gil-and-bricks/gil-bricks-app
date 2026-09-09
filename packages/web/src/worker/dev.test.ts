/**
 * THE DEV ROUTES ARE IMPOSSIBLE IN PRODUCTION (A1).
 *
 * /dev/preview renders five surfaces with fake broker details. It is gated on
 * DEV_LOGIN — a value that exists only in .dev.vars, which `wrangler deploy`
 * never uploads — plus a local host. That claim had no test behind it, in a
 * product whose whole rulebook is enforced by tests. It has one now.
 */
import { describe, expect, it } from 'vitest';
import { isLocalHost, isPreviewEnv, handleDevPreview, phoneNote } from './dev';
import type { Env } from './index';

const env = (devLogin?: string): Env => ({ DEV_LOGIN: devLogin } as unknown as Env);
const req = (url: string): Request => new Request(url);

describe('isLocalHost', () => {
  it('accepts the machine you are sitting at, and a private address on your own wifi', () => {
    for (const h of ['localhost', '127.0.0.1', '10.0.0.5', '192.168.1.102', '172.16.4.1', '172.31.255.254', 'mac.local']) {
      expect(isLocalHost(h), h).toBe(true);
    }
  });

  it('refuses a public hostname that merely LOOKS private', () => {
    // Every one of these is a registrable domain somebody else can own, and a
    // prefix match used to let them all through.
    for (const h of ['10.example.com', '192.168.evil.co.uk', '172.16.attacker.net', 'gil-bricks-app.gil-782.workers.dev', 'example.com', '8.8.8.8', '172.15.0.1', '172.32.0.1', '11.0.0.1']) {
      expect(isLocalHost(h), h).toBe(false);
    }
  });
});

describe('the preview cannot exist in production', () => {
  it('is refused without DEV_LOGIN, however local the host looks', () => {
    expect(isPreviewEnv(env(undefined), req('http://localhost:8787/dev/preview'))).toBe(false);
    expect(isPreviewEnv(env('off'), req('http://127.0.0.1:8787/dev/preview'))).toBe(false);
  });

  it('is refused on a public host, even with DEV_LOGIN somehow set', () => {
    expect(isPreviewEnv(env('on'), req('https://gil-bricks-app.gil-782.workers.dev/dev/preview'))).toBe(false);
    expect(isPreviewEnv(env('on'), req('https://10.example.com/dev/preview'))).toBe(false);
  });

  it('answers a bare 404 in production, saying nothing about itself', async () => {
    const res = handleDevPreview(req('https://gil-bricks-app.gil-782.workers.dev/dev/preview'), env(undefined));
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toBe('Not Found');
    expect(body.toLowerCase()).not.toContain('preview');
  });

  it('renders locally with DEV_LOGIN on, and tells search engines to keep out', async () => {
    const res = handleDevPreview(req('http://localhost:8787/dev/preview'), env('on'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toContain('five surfaces');
  });

  /**
   * The note said "Four of the five work on a phone" while TWO of them needed
   * a laptop: the bridging enquiry form is a sign-in card until you are signed
   * in, and sign-in only works on localhost because that is the registered
   * OAuth redirect. The number and the flags were two separate facts, so one
   * went stale silently. The number is counted from the list now.
   */
  describe('the phone note', () => {
    it('counts the surfaces instead of asserting a number', () => {
      expect(phoneNote()).toBe(
        'Three of the five work on a phone. The bridging enquiry form and the broker fact-find need the laptop, because signing in needs localhost.',
      );
    });

    it('and the page prints what it counted', async () => {
      const body = await handleDevPreview(req('http://localhost:8787/dev/preview'), env('on')).text();
      expect(body).toContain('Three of the five work on a phone.');
      expect(body, 'the stale number must not come back').not.toContain('Four of the five');
      // both laptop-only surfaces are marked in the list itself, not just the note
      expect((body.match(/Laptop only/g) ?? []).length).toBe(2);
    });
  });
});
