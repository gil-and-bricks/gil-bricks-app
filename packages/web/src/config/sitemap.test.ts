/**
 * The sitemap tells the truth (A1).
 *
 * Two ways a sitemap goes wrong: it advertises a page that does not exist, or
 * it advertises one we deliberately hide. Both are checked here against the
 * real pages directory and against noindex.test.ts's own HIDDEN set.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { absoluteUrl, HIDDEN_FROM_SEARCH, sitemapPaths } from './sitemap';

const PAGES = fileURLToPath(new URL('../pages/', import.meta.url));

/** The route a page file serves, e.g. tools/equity.astro -> /tools/equity. */
const routesOnDisk = (): string[] => {
  const walk = (dir: string, prefix: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      if (d.isDirectory()) return walk(join(dir, d.name), `${prefix}/${d.name}`);
      if (!d.name.endsWith('.astro')) return [];
      const base = d.name.replace(/\.astro$/, '');
      return [base === 'index' ? (prefix === '' ? '/' : prefix) : `${prefix}/${base}`];
    });
  return walk(PAGES, '');
};

describe('sitemap.xml', () => {
  const paths = sitemapPaths();

  it('lists something worth crawling', () => {
    expect(paths.length).toBeGreaterThan(10);
  });

  it('every listed page really exists', () => {
    const onDisk = new Set(routesOnDisk());
    // The four strategy routes come from a [strategy] dynamic page.
    const dynamic = /^\/(buy-to-let|flip|brrrr|hmo)(\/analyser)?$/;
    const missing = paths.filter((p) => !onDisk.has(p) && !dynamic.test(p));
    expect(missing, 'a sitemap entry with no page behind it').toEqual([]);
  });

  it('never advertises a page hidden from search', () => {
    const leaked = paths.filter((p) => HIDDEN_FROM_SEARCH.includes(p));
    expect(leaked, 'a noindex page in the sitemap').toEqual([]);
  });

  it('the hidden set is exactly the pages that carry noindex — the WHOLE tree', () => {
    // Recursive on purpose: the nested pages (/extension/*, /tools/*) are
    // exactly where a page could be noindexed and still advertised, and a
    // top-level-only scan would never see it (A1 review).
    const walk = (dir: string, prefix: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        if (d.isDirectory()) return walk(join(dir, d.name), `${prefix}/${d.name}`);
        if (!d.name.endsWith('.astro')) return [];
        if (!/\bnoindex\b/.test(readFileSync(join(dir, d.name), 'utf8'))) return [];
        const base = d.name.replace(/\.astro$/, '');
        return [base === 'index' ? (prefix === '' ? '/' : prefix) : `${prefix}/${base}`];
      });
    expect([...HIDDEN_FROM_SEARCH].sort()).toEqual(walk(PAGES, '').sort());
  });

  it('lists no duplicates', () => {
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('builds absolute URLs with the trailing slash the build serves', () => {
    expect(absoluteUrl('https://example.test', '/')).toBe('https://example.test/');
    expect(absoluteUrl('https://example.test/', '/tools/equity')).toBe('https://example.test/tools/equity/');
  });
});
