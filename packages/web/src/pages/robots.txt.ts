/**
 * robots.txt (A1, extended in S1). An ENDPOINT, not a file in public/, so the
 * host it names is read from site.config.ts like every other URL in this
 * product — golden rule 4 says the identity has exactly one home.
 *
 * S1: THIS FILE IS NOW THE WHOLE POLICY.
 *
 * It used to emit only `Allow: /` and a sitemap line, and Cloudflare's MANAGED
 * robots.txt was prepended to it at the edge. That managed block was carrying
 * every training-crawler Disallow the product relies on — from a dashboard
 * toggle, outside the repository, covered by no test and invisible in a diff.
 * It also meant the served file contained TWO `User-agent: *` groups, which the
 * standard does not define a merge for.
 *
 * The agents and the reasoning are in src/config/crawlers.ts; this route only
 * renders them. robots.test.ts fails if any of the five search-and-answer
 * crawlers is ever disallowed, and that test is proved to bite by disallowing
 * each of them in turn.
 */
import type { APIRoute } from 'astro';
import { siteConfig } from '../site.config';
import { absoluteUrl } from '../config/sitemap';
import { CONTENT_SIGNAL, SEARCH_CRAWLERS, TRAINING_CRAWLERS } from '../config/crawlers';

export const GET: APIRoute = () => {
  // NO Disallow lines, deliberately. The six private pages carry
  // `<meta name="robots" content="noindex, nofollow">`, and a crawler can only
  // obey that if it is allowed to FETCH the page. Blocking them here would stop
  // Google ever seeing the noindex, and a blocked URL can still be listed from
  // other pages' links — five of the six are linked from every page's header or
  // footer. Crawlable + noindex is what actually keeps them out; the sitemap
  // simply does not advertise them (src/config/sitemap.ts).
  const lines: string[] = [];

  /**
   * NAMED AND ALLOWED, FIRST. Every one of these would be permitted anyway by
   * the wildcard below — that is exactly why they are written out. An implicit
   * allow is one careless edit away from an implicit deny and nobody would
   * notice; a named group fails a test instead.
   *
   * Most specific group wins under the standard, so naming them also makes them
   * immune to a future tightening of `User-agent: *`.
   */
  for (const c of SEARCH_CRAWLERS) {
    lines.push(`User-agent: ${c.agent}`, 'Allow: /', '');
  }

  /** Training crawlers: they take, and return nothing. */
  for (const c of TRAINING_CRAWLERS) {
    lines.push(`User-agent: ${c.agent}`, 'Disallow: /', '');
  }

  // NO Disallow lines for the wildcard, deliberately. The private pages carry
  // `<meta name="robots" content="noindex, nofollow">`, and a crawler can only
  // obey that if it is allowed to FETCH the page. Blocking them here would stop
  // Google ever seeing the noindex, and a blocked URL can still be listed from
  // other pages' links — most are linked from every page's header or footer.
  // Crawlable + noindex is what actually keeps them out; the sitemap simply does
  // not advertise them (src/config/sitemap.ts).
  lines.push(
    'User-agent: *',
    `Content-Signal: ${CONTENT_SIGNAL}`,
    'Allow: /',
    '',
    `Sitemap: ${absoluteUrl(siteConfig.liveUrl, '/sitemap.xml').replace(/\/$/, '')}`,
    '',
  );
  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
