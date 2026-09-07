/**
 * Force feature flags for a test file, and put every flag back exactly as it
 * was (A1).
 *
 * The reversibility charter promises the product still holds together with all
 * flags off. Nothing checked that, so it rotted: 16 tests across six files
 * assumed the repo's default flag state instead of forcing the flags they
 * exercise, and went red the moment the flags were switched off — hiding the
 * one state the charter cares about.
 *
 * Every file that exercises a flagged behaviour declares what it needs:
 *
 *   withFlags({ dealDates: true, evidenceChips: true });
 *
 * It restores from a SNAPSHOT taken when the file loaded, not by assigning
 * `true` — assigning a literal is a set, not a restore, and quietly rewrites
 * the default for whatever runs next.
 */
import { afterAll, beforeEach } from 'vitest';
import { features, type FeatureFlags } from '../config/features';

export function withFlags(on: Partial<FeatureFlags>): void {
  const kept: FeatureFlags = { ...features };
  beforeEach(() => {
    Object.assign(features, on);
  });
  afterAll(() => {
    Object.assign(features, kept);
  });
}
