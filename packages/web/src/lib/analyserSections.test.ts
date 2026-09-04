import { describe, expect, it } from 'vitest';
import { ANALYSER_SECTIONS, SECTION_STRIP } from '../config/analyserSections';
import { activeSectionId, chipScrollLeft, stackUnsticks, visibleSections } from './analyserSections';

describe('section overview strip (N2)', () => {
  it('shows config order, and ONLY sections that are on the page', () => {
    const chips = visibleSections(['sec-comps', 'sec-property', 'sec-verdict']);
    expect(chips.map((c) => c.id)).toEqual(['sec-property', 'sec-verdict', 'sec-comps']);
  });

  it('never invents a chip for a section a strategy does not have', () => {
    expect(visibleSections([]).length).toBe(0);
    expect(visibleSections(['sec-area']).map((c) => c.label)).toEqual(['Area']);
  });

  it('every configured chip has a label and a non-empty anchor id', () => {
    for (const s of ANALYSER_SECTIONS) {
      expect(s.id.trim().length, s.label).toBeGreaterThan(0);
      expect(s.label.trim().length, s.id).toBeGreaterThan(0);
    }
    expect(new Set(ANALYSER_SECTIONS.map((s) => s.id)).size).toBe(ANALYSER_SECTIONS.length);
  });

  it('the active chip is the section you are reading, not the one arriving', () => {
    const tops = [
      { id: 'sec-property', top: -800 },
      { id: 'sec-verdict', top: -120 },
      { id: 'sec-comps', top: 400 },
    ];
    expect(activeSectionId(tops, 96)).toBe('sec-verdict');
    // above everything: the first section stays current
    expect(activeSectionId([{ id: 'sec-property', top: 300 }, { id: 'sec-verdict', top: 900 }], 96)).toBe('sec-property');
    // a section sitting just under the stack IS the one you landed on — the jump
    // leaves a few pixels of breathing room and the chip must still light up
    expect(activeSectionId([{ id: 'sec-property', top: -10 }, { id: 'sec-verdict', top: 96 }], 96)).toBe('sec-verdict');
    expect(activeSectionId([{ id: 'sec-property', top: -10 }, { id: 'sec-verdict', top: 110 }], 96)).toBe('sec-verdict');
    expect(activeSectionId([{ id: 'sec-property', top: -10 }, { id: 'sec-verdict', top: 140 }], 96)).toBe('sec-property');
    expect(activeSectionId([], 96)).toBeNull();
  });

  it('sorts by MEASURED position — some sections nest inside others, so the order they arrive in means nothing', () => {
    // handed in config order, but on the page the cost tile sits INSIDE the
    // figures grid and the inputs sit below the verdict heading
    const tops = [
      { id: 'sec-inputs', top: -300 },
      { id: 'sec-verdict', top: -500 },
      { id: 'sec-costs', top: -40 },
      { id: 'sec-figures', top: -220 },
      { id: 'valuation', top: 700 },
    ];
    expect(activeSectionId(tops, 96)).toBe('sec-costs');
    // and the fallback is the TOPMOST section, not the first one handed in
    expect(activeSectionId([{ id: 'sec-costs', top: 900 }, { id: 'sec-property', top: 400 }], 96)).toBe('sec-property');
  });

  it('scrolls the strip only when the chip is out of view, and never past zero', () => {
    const strip = { scrollLeft: 0, width: 390 };
    expect(chipScrollLeft({ left: 40, width: 80 }, strip)).toBe(0);          // already visible
    expect(chipScrollLeft({ left: 360, width: 80 }, strip)).toBe(66);        // off the right edge
    expect(chipScrollLeft({ left: -30, width: 80 }, strip)).toBe(0);         // off the left, clamped
    expect(chipScrollLeft({ left: -30, width: 80 }, { scrollLeft: 200, width: 390 })).toBe(154);
  });

  it('the pinned stack un-sticks on the same rule as the bar alone', () => {
    expect(stackUnsticks(53, 44, 844)).toBe(false);
    expect(stackUnsticks(53, 44, 300)).toBe(true);   // 97/300 = 32%
    expect(stackUnsticks(53, 0, 844)).toBe(false);
  });

  it('the comparables summary reads as one plain line, singular and plural', () => {
    expect(SECTION_STRIP.compsSummary(14, '£245/sq ft')).toBe('14 comparable sales · typical £245/sq ft · tap to explore');
    expect(SECTION_STRIP.compsSummary(1, '£245/sq ft')).toBe('1 comparable sale · typical £245/sq ft · tap to explore');
    expect(SECTION_STRIP.compsSummary(9, null)).toBe('9 comparable sales · tap to explore');
  });
});
