/**
 * robots.txt (A1). An ENDPOINT, not a file in public/, so the host it names is
 * read from site.config.ts like every other URL in this product — golden rule 4
 * says the identity has exactly one home.
 *
 * Publishing this replaces Cloudflare's default managed robots.txt, which said
 * nothing about us and named no sitemap.
 */
import type { APIRoute } from 'astro';
import { siteConfig } from '../site.config';
import { absoluteUrl } from '../config/sitemap';

export const GET: APIRoute = () => {
  // NO Disallow lines, deliberately. The six private pages carry
  // `<meta name="robots" content="noindex, nofollow">`, and a crawler can only
  // obey that if it is allowed to FETCH the page. Blocking them here would stop
  // Google ever seeing the noindex, and a blocked URL can still be listed from
  // other pages' links — five of the six are linked from every page's header or
  // footer. Crawlable + noindex is what actually keeps them out; the sitemap
  // simply does not advertise them (src/config/sitemap.ts).
  const lines = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${absoluteUrl(siteConfig.liveUrl, '/sitemap.xml').replace(/\/$/, '')}`,
    '',
  ];
  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
