import { describe, expect, it } from 'vitest';
import worker, { type Env } from './index';
import { signSession } from './lib/jwt';
import { SESSION_COOKIE } from './lib/cookies';

const stubEnv = (over: Partial<Env> = {}): Env =>
  ({
    ASSETS: { fetch: async () => new Response('asset') },
    DB: {
      prepare: () => ({
        bind: function () { return this; },
        first: async () => ({ marketing_consent: 1 }),
        run: async () => ({ success: true }),
      }),
      batch: async () => [],
    } as unknown as Env['DB'],
    JWT_SECRET: 'test-secret',
    GOOGLE_CLIENT_SECRET: 'x',
    TURNSTILE_SECRET: 'x',
    KIT_API_KEY: 'x',
  }) as Env;

describe('worker routes', () => {
  it('/api/me without a cookie → 200 with user: null (signed out is an answer, not an error)', async () => {
    const res = await worker.fetch(new Request('https://site.test/api/me'), stubEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });
  it('/api/me with a garbage cookie → 200 with user: null', async () => {
    const res = await worker.fetch(
      new Request('https://site.test/api/me', { headers: { Cookie: `${SESSION_COOKIE}=garbage` } }),
      stubEnv(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });
  it('/api/me with a valid session → profile with consent', async () => {
    const jwt = await signSession({ sub: 'u1', email: 'a@b.c', name: 'A', avatar: 'av' }, 'test-secret');
    const res = await worker.fetch(
      new Request('https://site.test/api/me', { headers: { Cookie: `${SESSION_COOKIE}=${jwt}` } }),
      stubEnv(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: 'a@b.c', name: 'A', avatar: 'av', marketingConsent: true });
  });
  it('/auth/login redirects to Google with PKCE + state and sets the state cookie', async () => {
    const res = await worker.fetch(new Request('https://site.test/auth/login?next=/flip/analyser&marketing=1'), stubEnv());
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('Location') ?? '');
    expect(loc.origin).toBe('https://accounts.google.com');
    expect(loc.searchParams.get('code_challenge_method')).toBe('S256');
    expect(loc.searchParams.get('redirect_uri')).toBe('https://site.test/auth/callback');
    expect(loc.searchParams.get('state')).toBeTruthy();
    expect(res.headers.get('Set-Cookie')).toContain('auth_state=');
    expect(res.headers.get('Set-Cookie')).toContain('HttpOnly');
  });
  it('/auth/callback with mismatched state → error page, no session', async () => {
    const res = await worker.fetch(
      new Request('https://site.test/auth/callback?state=forged&code=c', { headers: { Cookie: 'auth_state=bogus' } }),
      stubEnv(),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get('Set-Cookie') ?? '').not.toContain('session=ey');
  });
  it('/auth/logout clears the cookie and guards next=', async () => {
    const res = await worker.fetch(new Request('https://site.test/auth/logout?next=https://evil.com', { method: 'POST' }), stubEnv());
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/');
    expect(res.headers.get('Set-Cookie')).toContain(`${SESSION_COOKIE}=;`);
  });
  it('cross-site POSTs are refused (Sec-Fetch-Site)', async () => {
    const res = await worker.fetch(
      new Request('https://site.test/auth/logout', { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } }),
      stubEnv(),
    );
    expect(res.status).toBe(403);
    const ok = await worker.fetch(
      new Request('https://site.test/auth/logout', { method: 'POST', headers: { 'Sec-Fetch-Site': 'same-origin' } }),
      stubEnv(),
    );
    expect(ok.status).toBe(302);
  });
  it('unknown /api path → 404 json; other paths → assets', async () => {
    expect((await worker.fetch(new Request('https://site.test/api/nope'), stubEnv())).status).toBe(404);
    expect(await (await worker.fetch(new Request('https://site.test/flip/analyser'), stubEnv())).text()).toBe('asset');
  });
});
