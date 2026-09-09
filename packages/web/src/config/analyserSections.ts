/**
 * The analyser's section map (N2) — the overview strip's chips and every word
 * around them. The list is in PAGE order (the strip is a map of the page, so a
 * chip must never scroll you backwards), and a chip only renders when its
 * section is actually on the page, so a strategy without a section never shows
 * a dead link. Nothing depends on this order being right, though: the scrollspy
 * sorts by measured position. Rename, reorder or drop a chip here; no component
 * changes. Switched by features.sectionOverview.
 */
export interface AnalyserSection {
  /** The element id the chip links to — the anchor works with no JavaScript. */
  id: string;
  /** The chip's label. Short: the strip is one line on a 390px screen. */
  label: string;
  /**
   * Which glyph the left rail draws beside the label (C2). A NAME, not artwork:
   * the shapes live in SectionStrip.astro because they are drawing, not copy.
   * The icon is decorative and aria-hidden — the label is always there, so the
   * icon never carries meaning on its own.
   */
  icon: 'home' | 'pin' | 'pencil' | 'verdict' | 'chart' | 'coins' | 'list' | 'tag';
}

export const ANALYSER_SECTIONS: readonly AnalyserSection[] = [
  { id: 'sec-property', label: 'Property', icon: 'home' },
  { id: 'sec-area', label: 'Area', icon: 'pin' },
  { id: 'sec-inputs', label: 'Inputs', icon: 'pencil' },
  { id: 'sec-verdict', label: 'Verdict', icon: 'verdict' },
  { id: 'sec-figures', label: 'Figures', icon: 'chart' },
  { id: 'sec-costs', label: 'Costs', icon: 'coins' },
  // C1 — COMPARABLES BEFORE VALUATION. You work through the evidence and
  // satisfy yourself it is right BEFORE you are shown a valuation built on it.
  // The strip is a map of the page, so this order and the page's must agree.
  { id: 'sec-comps', label: 'Comparables', icon: 'list' },
  { id: 'valuation', label: 'Valuation', icon: 'tag' },
];

export const SECTION_STRIP = {
  /** How far below the pinned stack a section may still sit and count as "the
   * one you are reading" — the jump leaves a little breathing room, and the
   * chip must light up for the section you actually landed on. */
  spyTolerancePx: 16,
  /** Accessible name of the strip (it is a nav landmark, not a tab list). */
  navLabel: 'Jump to a section on this page',
  /** The quiet way back up after you have jumped down (N2 item 4). The visible
   * words ARE the link's accessible name (WCAG 2.5.3) — the arrow is decoration. */
  backToInputs: 'Back to inputs',
  /**
   * The line on the comparables disclosure. It is OPEN by default now (C1), so
   * this is the control that closes it — it must not read as an invitation to
   * open something that is already open.
   */
  compsSummary: (count: number, typicalPerSqm: string | null): string =>
    typicalPerSqm === null
      ? `${count} comparable ${count === 1 ? 'sale' : 'sales'}`
      : `${count} comparable ${count === 1 ? 'sale' : 'sales'} · typical ${typicalPerSqm}`,
  /** The CSS custom property carrying the strip's pinned height, so anything
   * else that must clear the pinned stack (tooltips) reads it from here. */
  heightVar: '--strip-h',
  /** Native <details> labels for the workings that fold away. */
  maths: 'How is this calculated?',
  /** When two workings share a card, the second names its own figure. */
  mathsFor: (what: string): string => `How is ${what} calculated?`,
  /** The three rows inside the show-the-maths accordion, in this order. The
   * figures beside them come from @gil-bricks/core — these are only the
   * labels. (The standalone tools print the same three words from their own
   * config, so a tool page never has to import the analyser's.) */
  mathsRows: { formula: 'Formula', numbers: 'Your numbers', result: 'Result' },
  assumptions: 'Assumptions — all editable',
} as const;

/**
 * The strategy switcher pinned in the sticky stack (N3). The four names come
 * from the strategy configs in @gil-bricks/core — never re-typed here.
 */
export const STRATEGY_SWITCHER = {
  /** Accessible name of the switcher. It is a NAV of four links (four URLs),
   * not a tablist: each strategy is its own page. */
  navLabel: 'Analyse this property as',
  /** Said only to screen readers, on the strategy you are already looking at. */
  currentHint: 'current strategy',
} as const;
