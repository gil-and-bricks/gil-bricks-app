/**
 * Sticky verdict bar (N1) — every user-facing word and every tunable, so the bar
 * can be reworded or retuned with no code change (Reversibility charter). The
 * bar itself is switched by `features.stickyVerdict`.
 */
export const STICKY_VERDICT = {
  /** If the bar would eat more than this share of the viewport (high zoom, tiny
   * screen) it un-sticks and scrolls with the page — WCAG reflow, never a wall. */
  maxViewportShare: 0.3,
  /** A visual viewport this much shorter than the layout viewport means the
   * on-screen keyboard is up — the bar hides until it closes. */
  keyboardViewportRatio: 0.75,
  /** How long after the last change the screen reader hears the new verdict —
   * one announcement per settled edit, not one per keystroke. */
  announceDelayMs: 500,
  /** The one brief tint on the score chip when the score moves. */
  tintMs: 250,
  /** The CSS custom property carrying the bar's live height: drives
   * scroll-padding-top and tells anything else (tooltips) what the top costs. */
  heightVar: '--sticky-h',
  copy: {
    /** Accessible name of the bar as a landmark region. */
    region: 'Deal verdict',
    /** The tap-to-expand control (collapsed / expanded). */
    expand: 'Show the whole verdict line',
    collapse: 'Hide the whole verdict line',
    /** The link in the expanded panel down to the full verdict card. */
    jump: 'Jump to the full verdict',
    /** What the screen reader hears when the verdict changes — the whole verdict,
     * never a bare number. `score` is already formatted ("7.9"). */
    /** The whole verdict in one sentence: score, tier, the binding headline and —
     * when the analyser found one — the lever, the most useful line we produce
     * ("A £8,000 lower price would turn this Green"). Never a bare number. */
    announce: (score: string, verdict: string, headline: string, lever: string): string =>
      `Deal score ${score} out of 10 — ${verdict}. ${headline}${lever === '' ? '' : ` ${lever}`}`,
  },
} as const;
