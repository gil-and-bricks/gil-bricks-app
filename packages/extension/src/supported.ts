/**
 * The ONLY sites this extension offers itself on. Kept as a pure function so the
 * background gating is unit-testable against real portal URLs without a browser
 * or any network call. Mirrors the manifest host_permissions exactly.
 */
const HOSTS = ['rightmove.co.uk', 'zoopla.co.uk'];

export function isSupportedUrl(url?: string | null): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
