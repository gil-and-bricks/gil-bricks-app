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

let fetched: Promise<Me | null> | null = null;

export function loadMe(): Promise<Me | null> {
  if (!fetched) {
    fetched = fetch('/api/me')
      .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
      .catch(() => null)
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
