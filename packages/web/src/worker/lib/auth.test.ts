import { describe, expect, it } from 'vitest';
import { canSaveAnotherDeal, MAX_DEALS_PER_USER } from './deals';
import { SESSION_DAYS, signSession, verifySession } from './jwt';
import { decodeAuthState, encodeAuthState, pkceChallenge, randomToken, safeNextPath } from './oauth';

const CLAIMS = { sub: 'u1', email: 'a@b.c', name: 'A', avatar: '' };

describe('session JWT', () => {
  it('signs and verifies round-trip', async () => {
    const jwt = await signSession(CLAIMS, 'secret-1');
    const claims = await verifySession(jwt, 'secret-1');
    expect(claims?.sub).toBe('u1');
    expect(claims?.email).toBe('a@b.c');
  });
  it('expires after 30 days', async () => {
    const now = 1_700_000_000;
    const jwt = await signSession(CLAIMS, 's', now);
    expect(await verifySession(jwt, 's', now + SESSION_DAYS * 86400 - 1)).not.toBeNull();
    expect(await verifySession(jwt, 's', now + SESSION_DAYS * 86400)).toBeNull();
  });
  it('rejects a tampered payload', async () => {
    const jwt = await signSession(CLAIMS, 's');
    const [h, b, sig] = jwt.split('.');
    const forged = btoa(JSON.stringify({ ...CLAIMS, sub: 'attacker', iat: 0, exp: 9999999999 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(await verifySession(`${h}.${forged}.${sig}`, 's')).toBeNull();
  });
  it('rejects the wrong secret and garbage', async () => {
    const jwt = await signSession(CLAIMS, 'right');
    expect(await verifySession(jwt, 'wrong')).toBeNull();
    expect(await verifySession('not-a-jwt', 'right')).toBeNull();
    expect(await verifySession('', 'right')).toBeNull();
  });
});

describe('PKCE + state', () => {
  it('random tokens are unique and url-safe', () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('challenge is the S256 of the verifier (RFC 7636 test vector)', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
  it('auth state survives encode/decode and clamps fields', () => {
    const p = decodeAuthState(encodeAuthState({ state: 's1', verifier: 'v1', next: '/flip/analyser?x=1', marketing: '1', turnstile: 't' }));
    expect(p).toEqual({ state: 's1', verifier: 'v1', next: '/flip/analyser?x=1', marketing: '1', turnstile: 't' });
    expect(decodeAuthState('!!!garbage')).toBeNull();
    expect(decodeAuthState(encodeAuthState({ state: 's', verifier: 'v', next: 'https://evil.com', marketing: 'x', turnstile: '' }))?.next).toBe('/');
  });
});

describe('safeNextPath (open-redirect guard)', () => {
  it('allows same-origin paths', () => {
    expect(safeNextPath('/brrrr/analyser?postcode=CF37+1HR')).toBe('/brrrr/analyser?postcode=CF37+1HR');
  });
  it.each([
    [null, '/'],
    ['', '/'],
    ['https://evil.com', '/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['javascript:alert(1)', '/'],
    ['/ok path', '/'],
  ])('%s → %s', (input, want) => {
    expect(safeNextPath(input as string | null)).toBe(want);
  });
});

describe('saved-deals cap', () => {
  it('allows below the cap and blocks at it', () => {
    expect(canSaveAnotherDeal(0)).toBe(true);
    expect(canSaveAnotherDeal(MAX_DEALS_PER_USER - 1)).toBe(true);
    expect(canSaveAnotherDeal(MAX_DEALS_PER_USER)).toBe(false);
  });
});
