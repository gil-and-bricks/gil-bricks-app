/** Client-side session state — one /api/me fetch per page, shared by islands. */
import { signal } from '@preact/signals';

export interface Me {
  email: string;
  name: string;
  avatar: string;
  marketingConsent: boolean;
}

/** undefined = not yet known; null = signed out. */
export const me = signal<Me | null | undefined>(undefined);
/**
 * True when /api/me could not answer at all — an outage, not a signed-out
 * visitor. Every non-answer used to read as "signed out", so a signed-in person
 * whose deals were perfectly safe was told to sign in to see them (D3).
 */
export const meUnknown = signal<boolean>(false);

let fetched: Promise<Me | null> | null = null;

export function loadMe(): Promise<Me | null> {
  if (!fetched) {
    // 200 with `user: null` means signed out; a 401 from an older Worker means
    // the same thing. Both answer the question, neither is an error.
    fetched = fetch('/api/me')
      .then(async (r) => {
        if (r.ok) {
          const v = (await r.json()) as Me | { user: null };
          return v !== null && 'email' in v ? v : null;
        }
        // 401 answers the question. Anything else (5xx, a proxy, an outage) does
        // not — say we could not check, never that they are signed out.
        if (r.status !== 401) meUnknown.value = true;
        return null;
      })
      .catch(() => {
        meUnknown.value = true;
        return null;
      })
      .then((v) => {
        me.value = v;
        return v;
      });
  }
  return fetched;
}

/** Forget the cached session (e.g. after a 401 mid-page) so the next loadMe refetches. */
export function resetMe(): void {
  fetched = null;
  me.value = undefined;
  meUnknown.value = false;
}

/** Open the login wall from anywhere (the modal island listens). */
export function openLoginWall(): void {
  document.dispatchEvent(new CustomEvent('open-login-wall'));
}

export function cookiesBlocked(): boolean {
  try {
    return !navigator.cookieEnabled;
  } catch {
    return true;
  }
}
