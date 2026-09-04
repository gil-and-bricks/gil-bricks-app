import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { features, stickyVerdictActive } from './features';

/** Every flag in code has a row in docs/FEATURE_FLAGS.md (and vice versa) — the
 * operator's rollback sheet can never drift from what the build actually reads. */
describe('feature flags (Reversibility charter)', () => {
  const doc = readFileSync(fileURLToPath(new URL('../../../../docs/FEATURE_FLAGS.md', import.meta.url)), 'utf8');
  const documented = Array.from(doc.matchAll(/^\| `(\w+)` \|/gm)).map((m) => m[1]).sort();

  it('every flag in features.ts is documented, and every documented flag exists', () => {
    expect(documented).toEqual(Object.keys(features).sort());
  });

  it('every flag is a plain boolean (no strings, no env lookups)', () => {
    for (const [k, v] of Object.entries(features)) expect(typeof v, k).toBe('boolean');
  });

  it('the sticky bar depends on the Deal Score — one helper decides, both ways', () => {
    const saved = { ...features };
    try {
      features.dealScore = true; features.stickyVerdict = true;
      expect(stickyVerdictActive()).toBe(true);
      features.stickyVerdict = false;
      expect(stickyVerdictActive()).toBe(false);
      features.stickyVerdict = true; features.dealScore = false;
      expect(stickyVerdictActive()).toBe(false);
    } finally {
      Object.assign(features, saved);
    }
  });
});
