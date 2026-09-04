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
}

export const ANALYSER_SECTIONS: readonly AnalyserSection[] = [
  { id: 'sec-property', label: 'Property' },
  { id: 'sec-area', label: 'Area' },
  { id: 'sec-inputs', label: 'Inputs' },
  { id: 'sec-verdict', label: 'Verdict' },
  { id: 'sec-figures', label: 'Figures' },
  { id: 'sec-costs', label: 'Costs' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'sec-comps', label: 'Comparables' },
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
  /** One-line summary the comparables module folds behind. */
  compsSummary: (count: number, typicalPerSqft: string | null): string =>
    typicalPerSqft === null
      ? `${count} comparable ${count === 1 ? 'sale' : 'sales'} · tap to explore`
      : `${count} comparable ${count === 1 ? 'sale' : 'sales'} · typical ${typicalPerSqft} · tap to explore`,
  /** The CSS custom property carrying the strip's pinned height, so anything
   * else that must clear the pinned stack (tooltips) reads it from here. */
  heightVar: '--strip-h',
  /** Native <details> labels for the workings that fold away. */
  maths: 'How is this calculated?',
  assumptions: 'Assumptions — all editable',
} as const;
