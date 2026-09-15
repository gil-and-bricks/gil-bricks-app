/**
 * X1 item 7 — THE OFFICIAL INSTAGRAM AND YOUTUBE MARKS, ONE SOURCE.
 *
 * WHY THIS FILE EXISTS. The marks were drawn twice: the web app carried
 * Instagram's real gradient and YouTube's real red, and the extension panel
 * carried a monochrome path traced by hand. Two drawings of the same two marks
 * is one drawing too many — and the panel's was the wrong one, because neither
 * company permits their mark to be recoloured. This is now the only place
 * either mark is described, and both surfaces render from it.
 *
 * WHY THE TWO ARE NOT THE SAME SIZE. A square Instagram glyph and a wide
 * YouTube badge at identical dimensions are never optically equal. They are
 * matched by the GEOMETRIC MEAN of their boxes (√(w×h)), which is what makes
 * two filled badges of different proportions carry the same visual weight:
 * matching height makes the wide one look bigger, matching width makes it look
 * smaller. The numbers below are the sizes at which the PAINTED PIXEL COUNTS
 * agree — measured, not judged by eye.
 *
 * WHY YOUTUBE'S viewBox IS CROPPED. Its artwork occupies y 3.9 → 20.1 of a
 * 24-unit box, so in a full `0 0 24 24` box a third of the height is empty and
 * the mark renders a third shorter than Instagram's. The box IS the mark here.
 *
 * WHY THE GRADIENT IDS ARE NAMESPACED. An SVG gradient is referenced by id
 * across the whole document. The header and the footer both render Instagram,
 * and two identical ids on one page make the second mark paint itself with the
 * first one's gradient. Every caller passes a `place` and gets its own ids.
 *
 * NEITHER MARK IS FETCHED: inline SVG, self-hosted, no CDN, no request.
 */

export type SocialMarkKind = 'instagram' | 'youtube';

export interface MarkStop { offset: string; color: string; opacity?: string }
export interface MarkGradient { id: string; cx: string; cy: string; r: string; stops: MarkStop[] }
export interface MarkShape { tag: 'rect' | 'path'; attrs: Record<string, string> }

export interface SocialMark {
  kind: SocialMarkKind;
  viewBox: string;
  gradients: MarkGradient[];
  shapes: MarkShape[];
}

/**
 * The measured sizes, in px, per surface. `panel` is the extension's side panel,
 * which is narrower than the web header and carries the marks slightly smaller.
 */
export const SOCIAL_MARK_SIZES = {
  header: { instagram: { w: 22, h: 22 }, youtube: { w: 26.4, h: 17.8 } },
  footer: { instagram: { w: 24, h: 24 }, youtube: { w: 28.8, h: 19.4 } },
  panel: { instagram: { w: 20, h: 20 }, youtube: { w: 24, h: 16.2 } },
} as const;

export type SocialMarkPlace = keyof typeof SOCIAL_MARK_SIZES;

/** Instagram's own gradient, verbatim from the brand assets. */
const IG_STOPS_A: MarkStop[] = [
  { offset: '0', color: '#FFDD55' },
  { offset: '0.5', color: '#FF543E' },
  { offset: '1', color: '#C837AB' },
];
const IG_STOPS_B: MarkStop[] = [
  { offset: '0', color: '#3771C8' },
  { offset: '1', color: '#6600FF', opacity: '0' },
];

const IG_GLYPH = 'M12 5.8c-1.7 0-1.9 0-2.6.04-.7.03-1.1.15-1.4.26-.36.14-.62.3-.89.57-.27.27-.43.53-.57.89-.11.3-.23.7-.26 1.4C6.2 9.66 6.2 9.88 6.2 12s0 2.34.04 3.04c.03.7.15 1.1.26 1.4.14.36.3.62.57.89.27.27.53.43.89.57.3.11.7.23 1.4.26.7.04.92.04 2.64.04s1.94 0 2.64-.04c.7-.03 1.1-.15 1.4-.26.36-.14.62-.3.89-.57.27-.27.43-.53.57-.89.11-.3.23-.7.26-1.4.04-.7.04-.92.04-3.04s0-2.34-.04-3.04c-.03-.7-.15-1.1-.26-1.4a2.4 2.4 0 0 0-.57-.89 2.4 2.4 0 0 0-.89-.57c-.3-.11-.7-.23-1.4-.26-.7-.04-.92-.04-2.64-.04Zm0 1.14c1.69 0 1.89 0 2.56.04.62.03.95.13 1.17.22.3.11.5.25.72.47.22.22.36.43.47.72.09.22.19.55.22 1.17.03.67.04.87.04 2.56s0 1.89-.04 2.56c-.03.62-.13.95-.22 1.17-.11.3-.25.5-.47.72-.22.22-.43.36-.72.47-.22.09-.55.19-1.17.22-.67.03-.87.04-2.56.04s-1.89 0-2.56-.04c-.62-.03-.95-.13-1.17-.22a1.9 1.9 0 0 1-.72-.47 1.9 1.9 0 0 1-.47-.72c-.09-.22-.19-.55-.22-1.17-.03-.67-.04-.87-.04-2.56s0-1.89.04-2.56c.03-.62.13-.95.22-1.17.11-.3.25-.5.47-.72.22-.22.43-.36.72-.47.22-.09.55-.19 1.17-.22.67-.03.87-.04 2.56-.04Zm0 1.94a3.12 3.12 0 1 0 0 6.24 3.12 3.12 0 0 0 0-6.24Zm0 5.14a2.02 2.02 0 1 1 0-4.04 2.02 2.02 0 0 1 0 4.04Zm3.97-5.26a.73.73 0 1 1-1.46 0 .73.73 0 0 1 1.46 0Z';

/** YouTube's badge and its play triangle. The red is theirs, and is never altered. */
const YT_BADGE = 'M23.5 6.5a3 3 0 0 0-2.1-2.1C19.5 3.9 12 3.9 12 3.9s-7.5 0-9.4.5A3 3 0 0 0 .5 6.5 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.5 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.5Z';
const YT_PLAY = 'M9.6 15.6V8.4l6.2 3.6Z';

/**
 * One mark, ready to render, with its gradient ids namespaced to `place`.
 * `place` is part of the id and nothing else — the geometry never varies.
 */
export function socialMark(kind: SocialMarkKind, place: string): SocialMark {
  if (kind === 'youtube') {
    return {
      kind,
      // Cropped to the artwork, so the element's box IS the mark.
      viewBox: '0 3.9 24 16.2',
      gradients: [],
      shapes: [
        { tag: 'path', attrs: { fill: '#FF0000', d: YT_BADGE } },
        { tag: 'path', attrs: { fill: '#fff', d: YT_PLAY } },
      ],
    };
  }
  const a = `pl-ig-a-${place}`;
  const b = `pl-ig-b-${place}`;
  return {
    kind,
    viewBox: '0 0 24 24',
    gradients: [
      { id: a, cx: '0.3', cy: '1.05', r: '1.3', stops: IG_STOPS_A },
      { id: b, cx: '0.12', cy: '0.02', r: '0.75', stops: IG_STOPS_B },
    ],
    shapes: [
      { tag: 'rect', attrs: { x: '0', y: '0', width: '24', height: '24', rx: '7', fill: `url(#${a})` } },
      { tag: 'rect', attrs: { x: '0', y: '0', width: '24', height: '24', rx: '7', fill: `url(#${b})` } },
      { tag: 'path', attrs: { fill: '#fff', d: IG_GLYPH } },
    ],
  };
}

/** Both marks, for a surface that renders the pair. */
export const SOCIAL_MARKS: readonly SocialMarkKind[] = ['instagram', 'youtube'] as const;
