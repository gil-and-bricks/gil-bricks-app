/**
 * DP1 — THE DURATION BANDS, and the honest note about where they come from.
 *
 * WHAT IS SOURCED AND WHAT IS NOT, said plainly. The operator's guidance is
 * qualitative: light cosmetic work is weeks, a full standard refurb is months,
 * structural work is longer. The week counts below are a BANDING of those
 * words. They are not a dataset, nobody surveyed them, and the product never
 * implies otherwise — which is precisely why every duration it prints is a
 * range, carries the word estimate, shows the four parts it is made of, and can
 * be replaced by the user's own builder's figure.
 *
 * Change a band here and every screen and every pack inherits it. One edit.
 *
 * THE RUNWAY IS THE POINT. A builder's "three weeks" is three weeks ON TOOLS.
 * The investor's money is tied up from the day they commit to the day rent or a
 * sale starts, which is lead-in + on tools + snagging + void. Modelling only
 * the middle one is the mistake this exists to stop, so the parts are separate
 * and all four are shown.
 */
import type { DurationConfig } from '@gil-bricks/core';

export const REFURB_DURATION: DurationConfig = {
  /** Time on tools. Weeks. */
  onTools: {
    // Decoration, flooring, gardens — surfaces, no trades queueing behind each other.
    cosmetic: { from: 2, to: 4 },
    // Kitchen, bathroom, rewire, plumbing, heating, plastering, windows: a
    // sequence of trades, each waiting on the one before.
    standard: { from: 8, to: 16 },
    // Damp, roof, structural: surveys and specialists before anyone starts.
    structural: { from: 16, to: 30 },
  },
  /** Finding and booking a builder, materials, any permissions. Before anyone starts. */
  leadIn: { from: 2, to: 6 },
  /** The list of small things after the job is "finished". */
  snagging: { from: 1, to: 3 },
  /** Empty, after the work, before rent or a sale begins. */
  voidPeriod: { from: 4, to: 8 },

  /** The heaviest thing ticked sets the band — keys from config/refurb.ts. */
  structuralItems: ['damp', 'roof'],
  standardItems: ['ripOut', 'windows', 'rewire', 'plumbing', 'heating', 'plastering', 'kitchen', 'bathroom'],
};

/** Every word the duration field says. */
export const DURATION_COPY = {
  heading: 'How long the work takes',
  /** The field is never a bare number: this is always beside it. */
  estimateLabel: 'Estimate',
  basis: (band: string): string => `Estimated from the ${band} scope you ticked.`,
  basisBuilder: 'On-tools time is your builder’s figure. The rest is estimated.',
  parts: {
    leadIn: 'Before anyone starts',
    onTools: 'On tools',
    snagging: 'Snagging',
    voidPeriod: 'Empty before rent or sale',
  },
  /** The whole point, said once where the number is. */
  runway: 'This is the whole runway, not just time on tools.',
  ownLabel: 'Your builder’s on-tools figure (weeks)',
  ownFrom: 'From',
  ownTo: 'To',
  ownHint: 'Replaces the on-tools estimate. Lead-in, snagging and void stay.',
  none: 'Tick some refurb work and an estimate appears here.',
  bandNames: { cosmetic: 'cosmetic', standard: 'standard', structural: 'structural' } as Record<string, string>,
} as const;
