/**
 * S1 — THE STRUCTURED DATA MUST MATCH THE PAGE IT DESCRIBES.
 *
 * Google's Rich Results Test will tell you a block is syntactically valid. It
 * cannot tell you the block is TRUE — that the application it describes is the
 * one on the page, that the free claim is really free, that the dataset date is
 * the date a person can see. That is the part that matters here and the part
 * this file checks, against the BUILT HTML rather than the source, because the
 * built HTML is what a crawler reads.
 *
 * It is skipped, loudly, if there is no build — a test that silently passes
 * when dist/ is absent is the shape this project has been burned by before.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '../../dist');
const html = (p: string): string => readFileSync(join(DIST, p), 'utf8');
const ld = (p: string): Record<string, unknown>[] => {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html(p));
  if (m === null) return [];
  const parsed = JSON.parse(m[1] as string) as { '@graph': Record<string, unknown>[] };
  return parsed['@graph'];
};
/** Rendered text of the page, tags stripped — what the claims must be true of. */
const visible = (p: string): string => html(p)
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/g, ' ')
  .replace(/\s+/g, ' ');

describe('structured data', () => {
  it('there is a build to check — this test is worthless without one', () => {
    expect(
      existsSync(join(DIST, 'index.html')),
      'No dist/. Run: npm run build -w packages/web',
    ).toBe(true);
  });

  it('every graph is valid JSON with a context and typed nodes', () => {
    for (const p of ['index.html', 'area-data/index.html', 'comparables/index.html', 'brrrr/analyser/index.html']) {
      const raw = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html(p));
      expect(raw, `${p} has no JSON-LD`).not.toBeNull();
      const parsed = JSON.parse((raw as RegExpExecArray)[1] as string) as Record<string, unknown>;
      expect(parsed['@context'], p).toBe('https://schema.org');
      for (const node of parsed['@graph'] as Record<string, unknown>[]) {
        expect(typeof node['@type'], `${p}: a node has no @type`).toBe('string');
        expect(typeof node['@id'], `${p}: a node has no @id`).toBe('string');
      }
    }
  });

  it('NEVER claims a rating, a review or a price that is not zero', () => {
    /**
     * The rule that matters most. A fabricated rating is the commonest cause of
     * a manual action, and it would simply be a lie: this product has no
     * reviews. Checked across every page that emits anything.
     */
    for (const p of ['index.html', 'area-data/index.html', 'comparables/index.html',
      'brrrr/analyser/index.html', 'flip/analyser/index.html', 'hmo/analyser/index.html',
      'buy-to-let/analyser/index.html']) {
      const raw = html(p);
      expect(raw, `${p} claims a rating`).not.toMatch(/aggregateRating|ratingValue|reviewCount/);
      expect(raw, `${p} claims a review`).not.toMatch(/"@type"\s*:\s*"Review"/);
      for (const node of ld(p)) {
        const offers = node.offers as { price?: string } | undefined;
        if (offers !== undefined) expect(offers.price, `${p} is not free`).toBe('0');
      }
    }
  });

  it('the free claim is one the page actually makes in words', () => {
    // Never richer than the page: if the markup says free, the page must too.
    for (const p of ['index.html', 'brrrr/analyser/index.html']) {
      const nodes = ld(p).filter((n) => n.offers !== undefined);
      if (nodes.length === 0) continue;
      expect(visible(p).toLowerCase(), `${p} markup says free but the page does not`).toMatch(/\bfree\b/);
    }
  });

  it('the Dataset carries a REAL refresh date, not an absent one', () => {
    /**
     * THIS TEST WAS VACUOUS WHEN IT WAS WRITTEN, and that is why it now asserts
     * instead of skipping.
     *
     * The first version did `if (asOf === undefined) continue;` and passed —
     * while `dateModified` was undefined on both pages, because `dataAsOf` in
     * site.config is deliberately empty and the real value is fetched by the
     * BROWSER from manifest.json. The freshness signal the sprint exists to
     * expose was not in the served HTML at all, and the test that was supposed
     * to check it said nothing. A skipped assertion is a lie unless the skip
     * itself fails.
     */
    for (const p of ['area-data/index.html', 'comparables/index.html']) {
      const ds = ld(p).find((n) => n['@type'] === 'Dataset') as Record<string, string> | undefined;
      expect(ds, `${p} has no Dataset`).toBeDefined();
      const asOf = (ds as Record<string, string>).dateModified;
      expect(asOf, `${p}: no dateModified — the refresh date is invisible to a crawler again`)
        .toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const covers = (ds as Record<string, string>).temporalCoverage;
      expect(covers, `${p}: no temporalCoverage`).toMatch(/^\d{4}-\d{2}$/);
      // And it must be the manifest's date, not one invented at build time:
      // a date in the future would mean somebody hardcoded it.
      expect(new Date(asOf).getTime(), `${p}: ${asOf} is in the future`).toBeLessThanOrEqual(Date.now());
    }
  });

  it('a Dataset names a real licence and the area it covers', () => {
    for (const p of ['area-data/index.html', 'comparables/index.html']) {
      const ds = ld(p).find((n) => n['@type'] === 'Dataset') as Record<string, string>;
      expect(ds.license).toMatch(/nationalarchives\.gov\.uk\/doc\/open-government-licence/);
      expect(ds.spatialCoverage).toBe('England and Wales');
    }
  });

  it('every URL it publishes is absolute and on the live domain', () => {
    for (const p of ['index.html', 'area-data/index.html', 'comparables/index.html', 'brrrr/analyser/index.html']) {
      for (const node of ld(p)) {
        for (const key of ['url', '@id']) {
          const v = node[key];
          if (typeof v !== 'string') continue;
          expect(v, `${p}.${key}`).toMatch(/^https:\/\/proplaunch\.ai\//);
        }
      }
    }
  });

  it('NO page we ask search engines to ignore describes itself to them', () => {
    for (const p of ['account/index.html', 'deals/index.html', 'privacy/index.html',
      'terms/index.html', 'pack/index.html', 'start/index.html', 'styleguide/index.html',
      'diagnostics/index.html']) {
      if (!existsSync(join(DIST, p))) continue;
      const raw = html(p);
      expect(raw, `${p} is noindex`).toMatch(/name="robots" content="noindex/);
      expect(raw, `${p} is noindex but carries structured data`).not.toContain('application/ld+json');
    }
  });

  it('no FAQPage is emitted, because there is no FAQ', () => {
    // If a real FAQ is ever written this test is the thing that must change
    // with it — deliberately, rather than a fabricated one slipping in.
    for (const p of ['index.html', 'area-data/index.html', 'comparables/index.html', 'brrrr/analyser/index.html']) {
      expect(html(p), `${p} claims an FAQ`).not.toContain('FAQPage');
    }
  });
});
