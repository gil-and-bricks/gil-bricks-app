/**
 * Feature flags — the ONE place a user-facing feature is switched on or off
 * (CLAUDE.md → Reversibility charter). Flipping a flag here IS the rollback:
 * no code change, no migration, nothing to unpick. Every flag is documented in
 * docs/FEATURE_FLAGS.md (what it turns on, what happens when it's off) and a
 * test fails if a flag is added here without that doc entry.
 *
 * Rules: one boolean per user-facing feature; a flag never lives anywhere else
 * (never in site.config.ts, env vars or a component); a flag that's been ON in
 * production for months may be retired by DELETING it and its `if` — never by
 * leaving a dead flag behind.
 */
export interface FeatureFlags {
  /** The 0–10 Deal Score chip + "what's holding it back" note on every analyser
   * verdict. Off: the verdict banner and tiles still show; nothing is scored and
   * saved deals carry no score. */
  dealScore: boolean;
  /** The deal pipeline: the board at /deals, stage moves, park/kill, the today
   * line, and the save-to-pipeline mirror. Off: /deals redirects to /account,
   * which shows the flat saved-deals list; saving still works; pipeline API
   * routes answer 404. */
  dealPipeline: boolean;
  /** The sticky verdict bar on the analyser pages (N1): score + tier colour +
   * the verdict line pinned under the header, updating in place as inputs
   * change. Off: no bar; the verdict card is the only place the score shows and
   * its banner is the polite live region again. Needs dealScore. */
  stickyVerdict: boolean;
}

export const features: FeatureFlags = {
  dealScore: true,
  dealPipeline: true,
  stickyVerdict: true,
};

/** The sticky bar can only show a Deal Score, so it is live only when BOTH flags
 * are on — one helper, so no component re-derives (and mis-derives) this. */
export function stickyVerdictActive(): boolean {
  return features.stickyVerdict && features.dealScore;
}
