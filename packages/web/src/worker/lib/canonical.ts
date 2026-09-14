/**
 * DM1 — THE PRODUCT HAS ONE ADDRESS, and everything else points at it.
 *
 * WHAT REDIRECTS AND WHAT DELIBERATELY DOES NOT.
 *
 * Pages on the old workers.dev host, and on www, move to the canonical host
 * with a 301. That is the whole point: a link somebody already has, a tab the
 * published extension opens, a search result — all of them land on the real
 * domain.
 *
 * BUT /api/*, /auth/*, /broker/* AND /dev/* ARE NEVER REDIRECTED. The Chrome
 * extension already in the store has host permission for the OLD host only.
 * Its daily check is a credentialed `fetch` to /api/attention; a 301 to a host
 * it holds no permission for is a FAILED FETCH, not a followed redirect — so
 * redirecting those paths would break every copy installed before the update,
 * silently, until Chrome pushed the new version. Opening a tab is different: a
 * tab follows a redirect with no permission at all, which is why pages can move
 * today and the API cannot.
 *
 * The same reasoning protects an OAuth round trip already in flight and a
 * broker's single-use link already sent.
 *
 * LOCALHOST IS UNTOUCHED, so the gates that boot a real Worker locally still
 * see the app rather than a redirect to production. Preview URLs are untouched
 * too: the match is the exact old hostname, and a preview is a longer one.
 */
export const CANONICAL_HOST = 'proplaunch.ai';

/**
 * THE LEGACY HOST. Everything published before the move points here, so it is
 * the only host that gets the keep-serving exemption below.
 */
export const LEGACY_HOST = 'gil-bricks-app.gil-782.workers.dev';

/**
 * www, WHICH IS A DIFFERENT CASE ENTIRELY and redirects everything.
 *
 * Nothing was ever published against www: no installed extension holds a
 * permission for it, no broker link was minted against it, no session cookie
 * exists on it. So it hands over the WHOLE request, /auth included — and that
 * last part matters. `redirectUri()` builds Google's callback from whichever
 * origin served the request, so a sign-in begun on www would ask Google to
 * return to https://www.proplaunch.ai/auth/callback, a URI nobody has
 * registered, and the user would get redirect_uri_mismatch. Redirecting first
 * means the sign-in can only ever start on the canonical host.
 */
export const REDIRECT_EVERYTHING_HOSTS: readonly string[] = ['www.proplaunch.ai'];

/** Every hostname that hands over to the canonical one. */
export const MOVED_HOSTS: readonly string[] = [LEGACY_HOST, ...REDIRECT_EVERYTHING_HOSTS];

/** Paths that keep answering on the LEGACY host only, for the reasons above. */
const KEEP_SERVING = ['/api/', '/auth/', '/broker/', '/dev/'];

/**
 * A 301 to the canonical host, or null when this request should be served
 * where it stands. Pure, so a test can ask it about any URL.
 */
export function canonicalRedirect(url: URL): Response | null {
  if (!MOVED_HOSTS.includes(url.hostname)) return null;
  // The exemption is the LEGACY host's alone. www hands over everything.
  if (url.hostname === LEGACY_HOST && KEEP_SERVING.some((p) => url.pathname.startsWith(p))) return null;
  const to = new URL(url.toString());
  to.hostname = CANONICAL_HOST;
  to.protocol = 'https:';
  to.port = '';
  return new Response(null, { status: 301, headers: { location: to.toString() } });
}
