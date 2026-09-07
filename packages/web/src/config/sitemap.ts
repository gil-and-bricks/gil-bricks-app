/**
 * What search engines are told about (A1).
 *
 * Search is half the acquisition story and neither robots.txt nor sitemap.xml
 * existed — the live /robots.txt was Cloudflare's own default file, with
 * nothing of ours in it (docs/AUDIT.md §5.1).
 *
 * ONE list, read by both endpoints. It is built from the same config the rest
 * of the product uses — the strategies from @gil-bricks/core, the tools from
 * TOOLS — so a new strategy or a new tool appears in the sitemap without anyone
 * remembering to add it. Only the flat pages are written out by hand, and
 * `sitemap.test.ts` fails if one of those is a page that does not exist, or if
 * a page hidden from search ever reaches this list.
 */
import { strategies } from '@gil-bricks/core';
import { TOOLS } from './tools';
import { features } from './features';

/**
 * Pages that are noindex, and must therefore never be advertised. The reasons
 * are in `noindex.test.ts`, which owns the decision; this is the same set, and
 * a test holds the two together.
 */
export const HIDDEN_FROM_SEARCH: readonly string[] = [
  '/account',
  '/deals',
  '/start',
  '/styleguide',
  '/terms',
  '/privacy',
];

/**
 * Indexable pages that are not generated from another config list.
 *
 * `/transaction` is deliberately absent: it is a query-param page (?id=…) and
 * renders an empty shell without one, so listing it would advertise a blank.
 * `/404` is absent for the obvious reason.
 */
const FLAT_ROUTES: readonly string[] = [
  '/',
  '/area-data',
  '/comparables',
  '/extension',
  '/extension/privacy',
  '/bridging-finance',
];

/** Every URL path worth crawling, in the order a reader would meet them. */
export function sitemapPaths(): string[] {
  const paths: string[] = [...FLAT_ROUTES];
  for (const s of strategies) {
    paths.push(s.route, `${s.route}/analyser`);
  }
  // A page behind a switched-off flag redirects, so it must not be advertised.
  if (features.creditPage) paths.push('/credit');
  if (features.toolsSection) {
    paths.push('/tools');
    for (const t of TOOLS.filter((t) => t.enabled)) paths.push(`/tools/${t.slug}`);
  }
  return paths;
}

/**
 * The absolute URL, with the trailing slash the build actually serves — the
 * four tool pages carry a canonical in that form, and a sitemap that disagreed
 * with a canonical would be worse than no sitemap.
 */
export function absoluteUrl(base: string, path: string): string {
  const root = base.replace(/\/+$/, '');
  if (path === '/') return `${root}/`;
  return `${root}${path}/`;
}
