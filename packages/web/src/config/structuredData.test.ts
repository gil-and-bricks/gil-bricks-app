/**
 * S1 — THE STRUCTURED DATA'S RULES, tested where they can be tested.
 *
 * WHY THIS FILE DOES NOT READ dist/. It used to, and CI went red: vitest runs
 * BEFORE the build, so every assertion here threw ENOENT on a fresh checkout
 * while passing on my machine, which had built. That is the rule CLAUDE.md
 * states outright — a test that reads a built artefact must be the file that
 * OWNS the build — and it is the second time this sprint pair has caught me
 * with it (DP3's `?raw` types were the first).
 *
 * So the split is: the honesty rules that are properties of the GENERATOR live
 * here, where they run on every commit. The claims that can only be checked
 * against rendered HTML — that a noindex page carries none, that the refresh
 * date really reached the page — live in scripts/check-seo.mjs, which runs
 * after the build like every other gate.
 */
import { describe, expect, it } from 'vitest';
import { dataset, graph, organisation, softwareApplication, SD_COPY } from './structuredData';

const parse = (s: string): Record<string, unknown> => JSON.parse(s) as Record<string, unknown>;

describe('structured data — the honesty rules', () => {
  it('NEVER emits a rating or a review, on any type', () => {
    /**
     * The rule that matters most. This product has no reviews; a fabricated
     * rating is the commonest cause of a manual action and it would be a lie.
     * Asserted over the SERIALISED output so a nested property cannot hide.
     */
    const all = graph([
      organisation(),
      softwareApplication({ name: 'x', description: 'y', url: 'https://proplaunch.ai/', features: ['a'] }),
      dataset({ name: 'x', description: 'y', url: 'https://proplaunch.ai/a/', asOf: '2026-01-01', covers: '2026-01', spatial: 'England and Wales' }),
    ]);
    expect(all).not.toMatch(/aggregateRating|ratingValue|reviewCount|"Review"/);
  });

  it('prices the product at zero, because it is free — and never otherwise', () => {
    const app = softwareApplication({ name: 'x', description: 'y', url: 'https://proplaunch.ai/', features: [] });
    expect((app.offers as { price: string }).price).toBe('0');
    expect((app.offers as { priceCurrency: string }).priceCurrency).toBe('GBP');
    expect(app.isAccessibleForFree).toBe(true);
  });

  it('every URL it publishes is absolute and on the live domain', () => {
    for (const node of [organisation(),
      softwareApplication({ name: 'x', description: 'y', url: 'https://proplaunch.ai/z/', features: [] }),
      dataset({ name: 'x', description: 'y', url: 'https://proplaunch.ai/a/', asOf: '', spatial: 'England and Wales' })]) {
      for (const k of ['url', '@id', 'logo']) {
        const v = (node as Record<string, unknown>)[k];
        if (typeof v !== 'string') continue;
        expect(v, k).toMatch(/^https:\/\/proplaunch\.ai\//);
      }
    }
  });

  it('a Dataset names the real licence and the real area', () => {
    const d = dataset({ name: 'x', description: 'y', url: 'https://proplaunch.ai/a/', asOf: '2026-01-01', covers: '2026-01', spatial: SD_COPY.spatial });
    expect(d.license).toMatch(/nationalarchives\.gov\.uk\/doc\/open-government-licence/);
    expect(d.spatialCoverage).toBe('England and Wales');
    expect(d.dateModified).toBe('2026-01-01');
    expect(d.temporalCoverage).toBe('2026-01');
  });

  it('omits the date entirely rather than inventing one when the manifest is unreachable', () => {
    // Non-fatal by design: a deploy must never depend on a bucket being up, and
    // an absent date is honest where a guessed one is not.
    const d = dataset({ name: 'x', description: 'y', url: 'https://proplaunch.ai/a/', asOf: '', covers: '', spatial: 'England and Wales' });
    expect(d.dateModified).toBeUndefined();
    expect(d.temporalCoverage).toBeUndefined();
  });

  it('emits a valid graph with a context and typed, identified nodes', () => {
    const g = parse(graph([organisation()]));
    expect(g['@context']).toBe('https://schema.org');
    for (const n of g['@graph'] as Record<string, unknown>[]) {
      expect(typeof n['@type']).toBe('string');
      expect(typeof n['@id']).toBe('string');
    }
  });

  it('never emits FAQPage, because there is no FAQ on this site', () => {
    const all = graph([organisation(), softwareApplication({ name: 'x', description: 'y', url: 'https://proplaunch.ai/', features: [] })]);
    expect(all).not.toContain('FAQPage');
  });
});
