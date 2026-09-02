/** Cookie helpers for the session + short-lived auth-state cookies. */

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

// __Host- prefix: browser-enforced Secure + Path=/ + no Domain — immune to
// subdomain cookie-tossing once the custom domain lands.
export const SESSION_COOKIE = '__Host-session';
export const AUTH_STATE_COOKIE = 'auth_state';

export function sessionCookie(jwt: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${jwt}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function authStateCookie(value: string): string {
  // 10 minutes is plenty for a round-trip to Google.
  return `${AUTH_STATE_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=600`;
}

export function clearAuthStateCookie(): string {
  return `${AUTH_STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=0`;
}
