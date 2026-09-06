/**
 * WHICH PAGES ARE HIDDEN FROM SEARCH, AND WHY (P7).
 *
 * /deals scores 66 for SEO on Lighthouse while every public page scores 100.
 * The whole gap is ONE audit — `is-crawlable`, "Page is blocked from indexing" —
 * and it is correct: a private pipeline of somebody's deals must not be in
 * Google. This test makes that DELIBERATE rather than accidental: the set is
 * written down, and a page joining or leaving it fails here.
 *
 * A page is hidden only for a reason that survives being said out loud.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PAGES = fileURLToPath(new URL('../pages/', import.meta.url));

/** Hidden from search, with the reason each. Nothing else may be. */
const HIDDEN: Record<string, string> = {
  'account.astro': 'someone’s own account page — private, and useless to a stranger',
  'deals.astro': 'someone’s own deal pipeline — private; this is the Lighthouse 66 and it is correct',
  'start.astro': 'a short pointer at the right tool; the tools it points to are the pages worth finding',
  'styleguide.astro': 'an internal reference, linked from nowhere',
  'terms.astro': 'a document for people already using the app, reached from the footer',
  'privacy.astro': 'the same — reached from the footer, never a search result we want to compete on',
};

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (
  d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith('.astro') ? [join(dir, d.name)] : []
));

describe('pages hidden from search are hidden on purpose', () => {
  const files = walk(PAGES);

  it('finds every page', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it('exactly the documented pages carry noindex — no more, no fewer', () => {
    const hidden = files
      .filter((f) => /\bnoindex\b/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(PAGES.length).split('\\').join('/'))
      .sort();
    expect(hidden).toEqual(Object.keys(HIDDEN).sort());
  });

  it('every hidden page has a reason written down', () => {
    for (const [page, why] of Object.entries(HIDDEN)) {
      expect(why.length, page).toBeGreaterThan(20);
    }
  });

  it('the pages that earn traffic are all indexable', () => {
    for (const page of ['index.astro', 'area-data.astro', 'comparables.astro', 'tools/index.astro',
      'tools/equity.astro', 'tools/rental-yield.astro', 'credit.astro', 'bridging-finance.astro',
      'extension/index.astro', '[strategy]/analyser.astro', '[strategy]/index.astro']) {
      const src = readFileSync(join(PAGES, page), 'utf8');
      expect(/\bnoindex\b/.test(src), `${page} must stay indexable`).toBe(false);
    }
  });
});
