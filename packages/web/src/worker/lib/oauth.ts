/** PKCE + state helpers and the open-redirect guard for the Google flow. */

const b64url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return b64url(buf);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

/**
 * next= must be a SAME-ORIGIN PATH: starts with a single "/", no scheme, no
 * protocol-relative "//", no backslashes, no whitespace/control characters.
 * Anything else falls back to "/".
 */
export function safeNextPath(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  if (raw.includes('\\')) return '/';
  if (/\s/.test(raw)) return '/';
  for (const ch of raw) if (ch.charCodeAt(0) < 32) return '/';
  return raw;
}

export interface AuthStatePayload {
  state: string;
  verifier: string;
  next: string;
  /** Marketing checkbox at the moment login started ('1' | '0'). */
  marketing: string;
  /** Turnstile token from the login wall (verified only when an account is created). */
  turnstile: string;
}

export function encodeAuthState(p: AuthStatePayload): string {
  return b64url(new TextEncoder().encode(JSON.stringify(p)));
}

export function decodeAuthState(s: string): AuthStatePayload | null {
  try {
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as AuthStatePayload;
    if (typeof p.state !== 'string' || typeof p.verifier !== 'string') return null;
    return {
      state: p.state,
      verifier: p.verifier,
      next: safeNextPath(p.next ?? null),
      marketing: p.marketing === '1' ? '1' : '0',
      turnstile: typeof p.turnstile === 'string' ? p.turnstile : '',
    };
  } catch {
    return null;
  }
}
