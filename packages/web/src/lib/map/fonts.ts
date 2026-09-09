/**
 * The glyph stacks the basemap uses. A LEAF module: it imports nothing.
 *
 * That is the point. warm.ts needs the first glyph range, and warm.ts is loaded
 * eagerly with the analyser page; if it reached into style.ts for the name it
 * would pull the whole basemap style — and @protomaps/basemaps with it — out of
 * the lazily-imported map chunk and onto every analyser page. Measured on an A/B
 * build during the C3 review, which is how we found it.
 */
export const NOTO = 'Noto Sans';

/** Five faint layers asked for italic — address labels and three water labels —
 *  and its first glyph range is 80KB the map waited for last. Folded onto the
 *  upright stack in lib/map/style.ts. */
export const ITALIC_STACK = `${NOTO} Italic`;
export const UPRIGHT_STACK = `${NOTO} Regular`;

/** The glyph range every label needs first, warmed while the map's own code is
 *  still downloading (components/analyser/CompMap.tsx). */
export const FIRST_GLYPH_URL = `/map/fonts/${encodeURIComponent(UPRIGHT_STACK)}/0-255.pbf`;
