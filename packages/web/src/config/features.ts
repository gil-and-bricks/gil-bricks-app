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
  /** The section overview strip on the analyser pages (N2): a scrollable row of
   * jump chips under the sticky bar, plus the "back to inputs" link and the
   * comparables module folded behind its one-line summary. Off: no strip, no
   * back link, the comparables module is open as it always was. The maths and
   * assumptions accordions stay collapsed either way — they always were. */
  sectionOverview: boolean;
  /** The four-strategy segmented switcher pinned in the analyser's sticky stack
   * (N3). Off: the switcher stays where it was — a row of pills inside the page,
   * above the verdict card. Either way it is ONE control, never two. */
  segmentedStrategy: boolean;
  /** Phone-first comparables (N3): a card per sale below 640px instead of the
   * 11-column table, and the filters folded into one "Filters" sheet with a
   * count of what is active. Off: the table and the open filter strip, as
   * before. The map stays load-on-demand either way. */
  compsMobile: boolean;
  /** The desktop analyser layout (N4): inputs and assumptions on the left, a
   * sticky results rail (verdict, figures, costs) on the right, and the section
   * overview as a vertical list beside the page. Pure CSS over the same DOM —
   * off means the single-column page at every width, exactly as before. */
  desktopSplit: boolean;
  /** The grouped header and the five-item bottom bar with a More sheet (N4).
   * Off: the flat header list (Area Data + four strategies) and the old
   * five-strategy bottom bar. The /tools and /bridging-finance pages exist either way. */
  navV2: boolean;
  /** The bridging finance enquiry page (F1) at /bridging-finance: the
   * explanation, the sign-in gate and the two-step form. Off: the route still
   * exists and explains what is coming, but no form renders and the API
   * answers 404 — nothing can be submitted. */
  bridgingFinance: boolean;
}

export const features: FeatureFlags = {
  dealScore: true,
  dealPipeline: true,
  stickyVerdict: true,
  sectionOverview: true,
  segmentedStrategy: true,
  compsMobile: true,
  desktopSplit: true,
  navV2: true,
  bridgingFinance: true,
};

/** The sticky bar can only show a Deal Score, so it is live only when BOTH flags
 * are on — one helper, so no component re-derives (and mis-derives) this. */
export function stickyVerdictActive(): boolean {
  return features.stickyVerdict && features.dealScore;
}
