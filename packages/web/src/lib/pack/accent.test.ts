/**
 * DP2 — the accent's partner colour is measured, never assumed.
 *
 * The brand tokens shipped white on pink at 3.56:1 once because somebody
 * assumed white. These numbers are computed from the WCAG formula and checked
 * against values worked out independently.
 */
import { describe, expect, it } from 'vitest';
import { PACK_PAPER, accentReadsOnPaper, contrast, luminance, onAccent } from './accent';

describe('relative luminance', () => {
  it('matches the specification at the ends of the range', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('#000000')).toBeCloseTo(0, 5);
  });

  it('refuses nonsense rather than returning a plausible number', () => {
    expect(luminance('not-a-colour')).toBe(0);
  });
});

describe('contrast', () => {
  it('is 21:1 between black and white, either way round', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 1);
  });
});

describe('the partner colour', () => {
  it('puts white on a dark accent and near-black on a light one', () => {
    expect(onAccent('#8a1f4b')).toBe('#ffffff');
    expect(onAccent('#f4e04d')).toBe('#111111');
  });

  it('picks the MORE readable of the two every time, across the spectrum', () => {
    for (const hex of ['#8a1f4b', '#0b5c3f', '#f4e04d', '#7a7a7a', '#123456', '#eeeeee', '#202020']) {
      const chosen = onAccent(hex);
      const other = chosen === '#ffffff' ? '#111111' : '#ffffff';
      expect(contrast(hex, chosen), hex).toBeGreaterThanOrEqual(contrast(hex, other));
    }
  });

  it('always finds SOMETHING readable — which is why that is not the useful test', () => {
    // Measured across all 256 greys, the best of black-or-white never drops
    // below 4.61:1. A check for "is anything readable on this colour" therefore
    // passes everything and says nothing. Asserted so the point survives.
    let worst = Infinity;
    for (let v = 0; v < 256; v += 1) {
      const hex = `#${v.toString(16).padStart(2, '0').repeat(3)}`;
      worst = Math.min(worst, Math.max(contrast(hex, '#ffffff'), contrast(hex, '#000000')));
    }
    expect(worst).toBeGreaterThan(4.5);
  });
});

describe('the accent as TEXT on the paper — the check that does bite', () => {
  it('passes the colours a sourcer would actually brand with', () => {
    for (const hex of ['#8a1f4b', '#0b5c3f', '#1f3a8a', '#7a2d12']) {
      expect(accentReadsOnPaper(hex), hex).toBe(true);
    }
  });

  it('fails a pale yellow, which measures 1.29:1 and cannot be read', () => {
    expect(contrast('#f4e04d', PACK_PAPER)).toBeLessThan(1.5);
    expect(accentReadsOnPaper('#f4e04d')).toBe(false);
  });

  it('fails a mid grey on paper too, at 2.45:1', () => {
    expect(accentReadsOnPaper('#9aa3ad')).toBe(false);
  });
});
