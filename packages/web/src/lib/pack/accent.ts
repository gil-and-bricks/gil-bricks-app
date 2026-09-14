/**
 * DP2 — THEIR COLOUR, AND WHAT IS READABLE ON IT.
 *
 * The user picks one accent and it lands on bands, rules, oversized numerals and
 * the duotone filter. Somewhere it will end up behind text, and a colour picker
 * will cheerfully hand back a pale yellow. So the partner colour is COMPUTED
 * from the accent's own relative luminance rather than assumed to be white —
 * which is the mistake the brand tokens made once already, shipping white on
 * pink at 3.56:1.
 *
 * WCAG relative luminance, as the specification defines it.
 */
const channel = (v: number): number => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

export function luminance(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (m === null) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(m[1].slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two hex colours, 1:1 to 21:1. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Black or white — whichever the eye can actually read on their colour. */
export function onAccent(hex: string): string {
  return contrast(hex, '#ffffff') >= contrast(hex, '#000000') ? '#ffffff' : '#111111';
}

/**
 * The paper the document is printed on. Not white — a warm off-white, which is
 * what stops the page reading as a browser default.
 */
export const PACK_PAPER = '#fbfaf7';

/**
 * Can their accent be used as TEXT on the paper?
 *
 * This is the check that matters, and it is not the one I reached for first.
 * The obvious test — "is anything readable ON this colour" — turns out to be
 * useless: measured across all 256 greys, the best of black-or-white never
 * drops below 4.61:1, so every colour passes it and the function says nothing.
 *
 * What genuinely fails is the accent used as a text colour on the page: the
 * eyebrow, the oversized numeral, the hero figure. A pale yellow measures
 * 1.29:1 there and is unreadable. So this measures that, and the composer warns
 * on it rather than silently shipping a page nobody can read.
 */
export function accentReadsOnPaper(hex: string): boolean {
  return contrast(hex, PACK_PAPER) >= 4.5;
}
