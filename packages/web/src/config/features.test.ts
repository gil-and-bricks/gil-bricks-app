import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { features, stickyVerdictActive } from './features';
import { EXTENSION_FLAGS } from '@gil-bricks/core';

/** Every flag in code has a row in docs/FEATURE_FLAGS.md (and vice versa) — the
 * operator's rollback sheet can never drift from what the build actually reads. */
describe('feature flags (Reversibility charter)', () => {
  const doc = readFileSync(fileURLToPath(new URL('../../../../docs/FEATURE_FLAGS.md', import.meta.url)), 'utf8');
  const documented = Array.from(doc.matchAll(/^\| `(\w+)` \|/gm)).map((m) => m[1]).sort();

  it('every flag in features.ts is documented, and every documented flag exists', () => {
    expect(documented).toEqual(Object.keys(features).sort());
  });

  /**
   * X2 — THE MIRROR CANNOT DRIFT.
   *
   * `onPageChips` is DEFINED in @gil-bricks/core, because the extension ships as
   * its own artefact and cannot import this file. This registry mirrors it so
   * every flag the product has is still listed in one place. A mirror that could
   * disagree with its source would be exactly the second source of truth the
   * charter forbids — so it is asserted, not trusted.
   */
  it('the extension flags mirrored here match their definition in core', () => {
    for (const [name, value] of Object.entries(EXTENSION_FLAGS)) {
      expect(
        (features as unknown as Record<string, boolean>)[name],
        `features.${name} disagrees with EXTENSION_FLAGS.${name} — one switch, two answers`,
      ).toBe(value);
    }
  });

  /**
   * X3 — the flag is the CAPABILITY; the operator's own switch in the panel is
   * the choice, and that is what defaults to off. The flag being true is what
   * lets the switch exist at all; turning the flag off withdraws the feature
   * whatever anyone has ticked.
   */
  it('the on-page chips are available for the operator to switch on', () => {
    expect(EXTENSION_FLAGS.onPageChips, 'see docs/FEATURE_FLAGS.md').toBe(true);
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
