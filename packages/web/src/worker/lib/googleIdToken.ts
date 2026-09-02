/**
 * Google ID-token verification against Google's published JWKS
 * (https://www.googleapis.com/oauth2/v3/certs), RS256 via WebCrypto.
 * Checks signature, issuer, audience and expiry — the full server-side
 * verification Google's docs require when not using their SDK.
 */

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface GoogleIdClaims {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

const b64urlDecode = (s: string): Uint8Array => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

// JWKS cached in the isolate; Google rotates slowly and a cold fetch is cheap.
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;

async function getJwks(): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < 60 * 60 * 1000) return jwksCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`JWKS fetch HTTP ${res.status}`);
  const body = (await res.json()) as { keys: Jwk[] };
  jwksCache = { keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

/** Returns verified claims or null. Never throws on a bad token — only on JWKS transport failure. */
export async function verifyGoogleIdToken(idToken: string, audience: string): Promise<GoogleIdClaims | null> {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  const [headB64, bodyB64, sigB64] = parts;
  let header: { alg?: string; kid?: string };
  let claims: GoogleIdClaims & { iss?: string; aud?: string; exp?: number };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(headB64)));
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(bodyB64)));
  } catch {
    return null;
  }
  if (header.alg !== 'RS256' || !header.kid) return null;

  let jwk = (await getJwks()).find((k) => k.kid === header.kid);
  if (!jwk) {
    // Key rotation: an unknown kid busts the 1h cache once before giving up.
    jwksCache = null;
    jwk = (await getJwks()).find((k) => k.kid === header.kid);
    if (!jwk) return null;
  }
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlDecode(sigB64) as BufferSource,
    new TextEncoder().encode(`${headB64}.${bodyB64}`),
  );
  if (!ok) return null;
  if (!ISSUERS.includes(claims.iss ?? '')) return null;
  if (claims.aud !== audience) return null;
  if (typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) return null;
  if (typeof claims.sub !== 'string' || typeof claims.email !== 'string') return null;
  return { sub: claims.sub, email: claims.email, email_verified: claims.email_verified, name: claims.name, picture: claims.picture };
}
