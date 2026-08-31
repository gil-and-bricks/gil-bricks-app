/** Minimal HS256 JWT via WebCrypto — no dependencies, secrets never leave env. */

const enc = new TextEncoder();

const b64url = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const b64urlDecode = (s: string): Uint8Array => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export interface SessionClaims {
  sub: string;
  email: string;
  name: string;
  avatar: string;
  iat: number;
  exp: number;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export const SESSION_DAYS = 30;

export async function signSession(
  claims: Omit<SessionClaims, 'iat' | 'exp'>,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const full: SessionClaims = { ...claims, iat: nowSeconds, exp: nowSeconds + SESSION_DAYS * 86400 };
  const head = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify(full)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

/** Returns the claims, or null for anything invalid, tampered or expired. */
export async function verifySession(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<SessionClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  try {
    const ok = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      b64urlDecode(sig) as BufferSource,
      enc.encode(`${head}.${body}`),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as SessionClaims;
    if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) return null;
    if (typeof claims.sub !== 'string' || claims.sub === '') return null;
    return claims;
  } catch {
    return null;
  }
}
