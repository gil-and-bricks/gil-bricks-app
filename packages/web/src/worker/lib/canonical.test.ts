/**
 * DM1 — ONE ADDRESS, AND THE TWO EXCEPTIONS THAT KEEP THE OLD ONE USEFUL.
 *
 * The valuable assertions here are the NEGATIVE ones. Redirecting too much is
 * how this breaks: a 301 on /api/attention silently kills the daily check in
 * every extension installed before the move, because that fetch holds a host
 * permission for the old host and none for the new one. A failed cross-origin
 * fetch looks exactly like a quiet product, not like a bug.
 */
import { describe, expect, it } from 'vitest';
import { coreConfig } from '@gil-bricks/core';
import { CANONICAL_HOST, LEGACY_HOST, canonicalRedirect } from './canonical';

const at = (u: string): Response | null => canonicalRedirect(new URL(u));
const to = (u: string): string | null => at(u)?.headers.get('location') ?? null;

describe('the canonical host is the one config actually serves', () => {
  it('matches coreConfig.appBaseUrl — a redirect to somewhere we do not serve is worse than none', () => {
    expect(`https://${CANONICAL_HOST}`).toBe(coreConfig.appBaseUrl);
  });
});

describe('pages on a moved host hand over', () => {
  it('sends the legacy host’s pages to the canonical one, path and query intact', () => {
    expect(to(`https://${LEGACY_HOST}/`)).toBe('https://proplaunch.ai/');
    expect(to(`https://${LEGACY_HOST}/deals/`)).toBe('https://proplaunch.ai/deals/');
    expect(to(`https://${LEGACY_HOST}/brrrr/analyser/?postcode=CF37+1HR&price=120000`))
      .toBe('https://proplaunch.ai/brrrr/analyser/?postcode=CF37+1HR&price=120000');
  });

  it('answers 301, not 302 — a permanent move is what search engines and browsers should cache', () => {
    expect(at(`https://${LEGACY_HOST}/`)?.status).toBe(301);
  });

  it('sends www there too', () => {
    expect(to('https://www.proplaunch.ai/pack/')).toBe('https://proplaunch.ai/pack/');
  });
});

describe('what the legacy host must KEEP SERVING', () => {
  /**
   * Every one of these is a published artifact that cannot be edited by us.
   * If any starts redirecting, something already in somebody's hands breaks.
   */
  it('never redirects the API the installed extension calls', () => {
    expect(at(`https://${LEGACY_HOST}/api/attention`)).toBeNull();
    expect(at(`https://${LEGACY_HOST}/api/epc?postcode=CF37+1HR`)).toBeNull();
    expect(at(`https://${LEGACY_HOST}/api/health`)).toBeNull();
  });

  it('never redirects an OAuth round trip already in flight', () => {
    expect(at(`https://${LEGACY_HOST}/auth/callback?code=x&state=y`)).toBeNull();
  });

  it('never redirects a broker’s single-use link', () => {
    expect(at(`https://${LEGACY_HOST}/broker/factfind?t=abc`)).toBeNull();
    expect(at(`https://${LEGACY_HOST}/broker/enquiry?t=abc`)).toBeNull();
  });
});

describe('what www does NOT get exempted from', () => {
  /**
   * The exemption is the legacy host's alone. www has no installed extension,
   * no minted link and no session — and `redirectUri()` is built from the
   * serving origin, so a sign-in begun on www would ask Google to return to a
   * URI nobody registered. It has to hand over BEFORE that happens.
   */
  it('redirects /auth on www, so a sign-in can only begin on the canonical host', () => {
    expect(to('https://www.proplaunch.ai/auth/login')).toBe('https://proplaunch.ai/auth/login');
  });

  it('redirects /api and /broker on www as well', () => {
    expect(to('https://www.proplaunch.ai/api/health')).toBe('https://proplaunch.ai/api/health');
    expect(to('https://www.proplaunch.ai/broker/factfind?t=abc')).toBe('https://proplaunch.ai/broker/factfind?t=abc');
  });
});

describe('everything else is left alone', () => {
  it('does not touch the canonical host', () => {
    expect(at('https://proplaunch.ai/deals/')).toBeNull();
    expect(at('https://proplaunch.ai/api/health')).toBeNull();
  });

  it('does not touch localhost — the gates boot a real Worker there', () => {
    expect(at('http://localhost:8788/deals/')).toBeNull();
    expect(at('http://127.0.0.1:8791/')).toBeNull();
  });

  it('does not touch a preview URL, which is a longer name on the same suffix', () => {
    expect(at('https://abc123-gil-bricks-app.gil-782.workers.dev/deals/')).toBeNull();
  });

  it('does not touch some other site that happens to mention us', () => {
    expect(at('https://gil-bricks-app.gil-782.workers.dev.evil.example/deals/')).toBeNull();
  });
});
