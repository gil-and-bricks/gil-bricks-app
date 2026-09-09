/**
 * Start the map's small assets while its big one is still downloading (C3).
 *
 * Measured on a phone at 4G, pressing "Map": the 270KB map module took 1.4s,
 * and only THEN did the stylesheet, the sprite, the archive header and the
 * glyphs begin — everything the map needs was serialised behind the code that
 * asks for it. These two are known before any of that code exists, so they can
 * start on the same tick the person presses the button.
 */
import { FIRST_GLYPH_URL } from './fonts';

/** MapLibre's own stylesheet, self-hosted. Fetched on FIRST map open only —
 *  importing it would put an 83KB render-blocking <link> on every analyser
 *  page, map or no map (N3). */
export const MAP_CSS_HREF = '/map/vendor/maplibre-gl.css';

function addLink(rel: string, href: string, as?: string): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`link[href="${href}"]`) !== null) return;
  const el = document.createElement('link');
  el.rel = rel;
  el.href = href;
  if (as !== undefined) el.as = as;
  // a failed fetch removes the tag so the NEXT mount tries again, rather than
  // leaving every future map behind a link that will never load
  el.onerror = () => el.remove();
  document.head.appendChild(el);
}

/** Idempotent: safe to call from the light half AND again from the heavy one. */
export function warmMapAssets(): void {
  addLink('stylesheet', MAP_CSS_HREF);
  addLink('preload', FIRST_GLYPH_URL, 'fetch');
}
