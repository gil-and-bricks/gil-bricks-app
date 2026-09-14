/**
 * DP2 — A PRINT-RESOLUTION MAP, CAPTURED IN THIS BROWSER, FROM OUR OWN TILES.
 *
 * WHY THIS IS POSSIBLE AT £0. The basemap is Protomaps PMTiles on our own R2
 * bucket, rendered by MapLibre in the user's browser. Reading that rendered
 * canvas as a PNG needs no static-map API, no key and no request to anybody —
 * it is a picture of something the browser had already drawn.
 *
 * WHY IT IS OFFSCREEN AND OVERSIZED. Printed at about 120mm wide, a 1400px
 * image lands near 300dpi, which is the standard a photograph in a printed
 * document is held to. The container is positioned off the left edge rather
 * than hidden, because a display:none element has no WebGL context and would
 * capture nothing.
 *
 * WHY IT CAN RETURN NULL, AND WHY THAT IS FINE. WebGL may be unavailable, the
 * GPU may cap the texture size, the tiles may not settle. Every one of those
 * returns null and the pack prints its ranked comparables list instead — which
 * is a real answer, not a degraded one. A blank rectangle where a map should be
 * would be worse than no map at all.
 *
 * ATTRIBUTION IS NOT OPTIONAL. OpenStreetMap's terms require that non-
 * interactive media name the ODbL licence in print; a link or a QR code is not
 * sufficient. The line is printed beside the map by PackDocument, from config.
 */
import type { MapData } from '../../components/analyser/mapImpl';

/** Near 300dpi at the size the pack prints it. */
const SHOT_W = 1400;
const SHOT_H = 900;

export interface MapShotResult {
  png: string | null;
  /** Why there is no map, when there is none. Reported, never swallowed. */
  reason: string;
}

export async function captureMap(data: MapData, accent: string): Promise<MapShotResult> {
  if (typeof document === 'undefined') return { png: null, reason: 'no-document' };

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${SHOT_W}px;height:${SHOT_H}px;pointer-events:none`;

  document.body.append(host);

  let handle: { destroy(): void; snapshot(): Promise<string | null> } | null = null;
  try {
    // Loaded here, not at the top: MapLibre is a large module and a pack with
    // no comparables section should never pay for it.
    const { mountMap } = await import('../../components/analyser/mapImpl');
    let blank = '';
    handle = mountMap(host, data, {
      interactive: false,
      preserveBuffer: true,
      // THEIR COLOUR, NOT OURS. The map reads --accent off the document root,
      // which is the app's lime — our brand, printed on a document a sourcer
      // sends their own investor. The first capture came out in lime.
      accent,
      onBlank: (why) => { blank = why; },
    });
    const png = await handle.snapshot();
    if (png === null) return { png: null, reason: blank || 'no-canvas' };
    return { png, reason: '' };
  } catch (err) {
    return { png: null, reason: err instanceof Error ? err.message.slice(0, 80) : 'failed' };
  } finally {
    try { handle?.destroy(); } catch { /* a map that never mounted has nothing to tear down */ }
    host.remove();
  }
}
