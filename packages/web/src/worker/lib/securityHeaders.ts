import { coreConfig } from '@gil-bricks/core';

/**
 * S1 — THE SECURITY HEADERS, in one place, applied at the Worker's single exit.
 *
 * WHAT WAS MISSING: all of them. The deployed site sent no CSP, no frame
 * protection, no referrer policy, no nosniff and no HSTS. The broker pages were
 * the exception and already set their own strict cache/robots/referrer trio.
 *
 * THE TWO THAT MATTER MOST HERE, and why:
 *
 *  1. `frame-ancestors 'none'` — nothing else stopped this whole site being put
 *     in an invisible iframe over somebody else's page. A signed-in person could
 *     then be steered into clicking a real control of ours: "Delete everything"
 *     on the account page is one click and is not undoable.
 *
 *  2. `Referrer-Policy` — the analyser holds the WHOLE DEAL IN ITS URL: the
 *     postcode, the house number, the price, the beds, and now every refurb line
 *     somebody ticked. The product deliberately links out to Rightmove, Zoopla
 *     and Google. With no policy, the full query string travelled to those
 *     third parties in the Referer header on every one of those clicks.
 *
 * ON `script-src` AND 'unsafe-inline': Astro emits inline bootstrap scripts for
 * its islands, so a strict script-src would need a per-build hash or nonce for
 * each. That is a real piece of work and getting it wrong takes the site down,
 * so the CSP here keeps 'unsafe-inline' for scripts and is honest about it: it
 * is NOT yet an XSS backstop. What it does do is close frame-ancestors,
 * object-src, base-uri and form-action, which are the injection routes that need
 * no script at all. Tightening script-src is written up in the decisions log.
 */

/**
 * THE DATA BUCKET'S ORIGIN, READ FROM THE ONE PLACE IT IS WRITTEN.
 *
 * It used to be the r2.dev hostname typed out here and again in public/_headers
 * and twice more in the tests. Moving the bucket to its own domain (DM1) meant
 * finding all four. It is derived now, so the next move is one edit in
 * coreConfig and nothing here changes at all.
 */
const DATA_ORIGIN = new URL(coreConfig.dataBaseUrl).origin;

/** Everything the app legitimately talks to. Anything else is refused. */
const CONNECT = [
  "'self'",
  'https://data.police.uk',
  'https://environment.data.gov.uk',
  'https://www.planning.data.gov.uk',
  'https://landregistry.data.gov.uk',
  DATA_ORIGIN,
  'https://challenges.cloudflare.com',
].join(' ');

/**
 * THE PORTALS' OWN IMAGE SERVERS.
 *
 * F1 and R3 both rest on one position: the agent's floor plan and the listing's
 * photographs are THEIR copyright, so we never fetch them, never hold their
 * bytes and never store them — the user's own browser renders them from the
 * portal's server with `<img src>`, exactly as the listing page it already
 * loaded does. What travels through our handoff is an address.
 *
 * Both features shipped without this line, so the policy that was written
 * before either of them existed blocked every one of those images. The floor
 * plan was a black rectangle and every photo read "That photo would not load",
 * with the real reason only in the console.
 *
 * This is `img-src` ONLY. These hosts may paint pixels; they may not run a
 * script, open a connection or frame anything — and nothing here weakens the
 * rule that we make no request to a portal ourselves.
 */
const PORTAL_IMAGES = [
  'https://media.rightmove.co.uk',
  'https://*.zoocdn.com',
].join(' ');

const CSP = [
  "default-src 'self'",
  // See the note above: not yet an XSS backstop, and deliberately labelled.
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  // Google avatars load straight from Google on signed-in pages.
  `img-src 'self' data: blob: https://*.googleusercontent.com ${DATA_ORIGIN} ${PORTAL_IMAGES}`,
  "font-src 'self' data:",
  `connect-src ${CONNECT}`,
  // Turnstile's widget, and the click-to-load YouTube embed.
  "frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com https://www.youtube.com",
  "worker-src 'self' blob:",
  // The four that need no script to exploit, and cost nothing to close.
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

/** Features this product does not use. Denied outright rather than left open. */
const PERMISSIONS = [
  'accelerometer=()', 'autoplay=()', 'camera=()', 'display-capture=()',
  'encrypted-media=()', 'fullscreen=(self)', 'geolocation=()', 'gyroscope=()',
  'magnetometer=()', 'microphone=()', 'midi=()', 'payment=()', 'usb=()',
  'interest-cohort=()',
].join(', ');

export const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': PERMISSIONS,
  // THIS NOW MATTERS. It used to be belt-and-braces: workers.dev sits under the
  // .dev TLD, which is HSTS-preloaded, so browsers already refused plaintext
  // whatever we sent. proplaunch.ai is not preloaded, so this header is the
  // only thing upgrading a returning visitor — it is load-bearing from DM1 on.
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
};

/**
 * Applied to EVERY response the Worker returns, at the one place they all pass
 * through, so a new route cannot be added without them. A header the handler
 * has already set deliberately — the broker pages' `no-referrer`, say — is
 * never overwritten.
 */
export function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
