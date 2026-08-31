/**
 * The heavy half of the map (S7.1) — maplibre-gl + pmtiles + the style.
 * ONLY ever loaded via dynamic import when a map is first opened, so page
 * loads never pay for it. One module-level protocol registration; style and
 * tiles are cached by the browser for instant reopens.
 */
import {
  addProtocol,
  AttributionControl,
  Map as LibreMap,
  NavigationControl,
  Popup,
  LngLatBounds,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { IControl } from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Comp } from '../../lib/comparables/engine';
import { circleRing, clusterForVariant, escapeHtml as esc, isRenderedTileEvent, pinState, shouldCluster } from '../../lib/map/geo';
import { buildMapStyle, TILES_SOURCE_ID, tilesHttpUrl } from '../../lib/map/style';
import { fmtMoney } from '../../lib/maths/format';
import { sqmToSqft } from '../../lib/maths/area';

let protocol: Protocol | null = null;

/**
 * Register the pmtiles protocol ONCE, backed by a PERSISTENT PMTiles archive.
 * Why persistent: the pmtiles SharedPromiseCache never evicts a REJECTED
 * header/directory promise, so a fetch aborted by an unmount (fast List⇄Map
 * toggle) or a transient blip poisons the cache and the basemap never loads
 * again — the "pins but no streets / works on the 3rd try" bug. The archive
 * lives at module scope, independent of any map lifecycle, and is pre-warmed
 * with retries so its header/root directory resolve SUCCESSFULLY before any
 * map can abort them. resetTiles() rebuilds it to break a poisoned cycle.
 */
function ensureProtocol(): void {
  if (protocol) return;
  // v6 ships the worker as a separate module; under Vite its default URL
  // resolves into our hashed chunk and the worker dies silently — point it
  // at the self-hosted copy (scripts/copy-map-worker.mjs).
  setWorkerUrl('/map/vendor/maplibre-gl-worker.mjs');
  protocol = new Protocol();
  addProtocol('pmtiles', protocol.tile);
  addArchive();
}

function addArchive(): void {
  const archive = new PMTiles(tilesHttpUrl());
  protocol!.add(archive);
  // pre-warm the header + root directory with a few retries, on our own
  // (never a map's) fetch — so it lands cached-resolved, not poisoned.
  let tries = 0;
  const warm = () => {
    archive.getHeader().catch(() => {
      if (tries++ < 4) setTimeout(warm, 500 * 2 ** tries);
    });
  };
  warm();
}

/** Rebuild the pmtiles archive to discard a poisoned cache (self-heal). */
function resetTiles(): void {
  if (!protocol) {
    ensureProtocol();
    return;
  }
  // Protocol keys instances by URL; re-adding a fresh PMTiles replaces the
  // poisoned one so the next map fetches into a clean cache.
  addArchive();
}
export { resetTiles };

const LIME = '#dcff00';
const INK = '#070014';

export interface MapData {
  subject: { lat: number; lng: number };
  radiusMiles: number;
  comps: Comp[];
  selectedId: string | null;
  /** Article 4 direction polygons to shade (HMO analyser only). */
  article4?: GeoJSON.FeatureCollection | null;
  /** 'density' = subtle small dots for the Area Data map; 'comps' = full pins. */
  variant?: 'comps' | 'density';
}

export interface MapHandle {
  update(data: MapData): void;
  setHovered(id: string | null): void;
  destroy(): void;
}

export interface MapCallbacks {
  interactive?: boolean;
  /** Fired once the basemap has actually painted a tile (proof of a live GL context). */
  onRendered?: () => void;
  /** Fired if the map can't render — WebGL context lost, a fatal style/tile error,
   * or no tile painted within the watchdog window. Lets the UI fall back honestly. */
  onBlank?: (reason: string) => void;
}

const monthName = (d: string): string => {
  const [y, m] = d.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
};

function compsGeoJson(data: MapData): FeatureCollection {
  const prices = data.comps.map((c) => c.price);
  return {
    type: 'FeatureCollection',
    features: data.comps.map((c) => {
      const pin = pinState(c, prices, data.selectedId);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
        properties: {
          id: c.id,
          price: c.price,
          label: fmtMoney(c.price),
          date: monthName(c.date.slice(0, 7)),
          address: [c.saon, c.paon, c.street].filter((x) => x !== '').join(' '),
          town: c.town,
          type: c.type,
          tenure: c.tenure,
          persqft: c.ppsqm !== null ? Math.round(c.ppsqm / sqmToSqft(1)) : null,
          state: pin.state,
          radius: pin.radius,
        },
      };
    }),
  };
}

function circleGeoJson(data: MapData): Feature {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [circleRing(data.subject.lat, data.subject.lng, data.radiusMiles)] },
    properties: {},
  };
}

const TYPE_WORDS: Record<string, string> = { D: 'Detached', S: 'Semi', T: 'Terraced', F: 'Flat', O: 'Other' };

export function mountMap(container: HTMLElement, data: MapData, opts: MapCallbacks = {}): MapHandle {
  ensureProtocol();
  const interactive = opts.interactive !== false;
  const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let map: LibreMap;
  try {
    map = new LibreMap({
      container,
      style: buildMapStyle() as never,
      center: [data.subject.lng, data.subject.lat],
      zoom: interactive ? 14 : 15,
      minZoom: 6,
      maxZoom: 18,
      attributionControl: false,
      cooperativeGestures: interactive, // never hijack page scroll on mobile
      interactive,
      fadeDuration: 100,
    });
  } catch (err) {
    // WebGL unavailable / blocked on this device — fail visibly, not blank.
    opts.onBlank?.(err instanceof Error ? err.message : 'webgl unavailable');
    return { update() {}, setHovered() {}, destroy() {} };
  }

  // --- render-health watchdog (the S7.1 mobile blank-map fix) ---------------
  // A live GL context that has painted a tile fires 'data' with a loaded tile.
  // If nothing paints within the window, or the WebGL context is lost (common
  // on real mobile GPUs under memory pressure — MapLibre does NOT auto-recover,
  // leaving the HTML controls visible over a blank canvas), we tell the UI.
  let healthy = false;
  const markHealthy = () => {
    if (healthy) return;
    healthy = true;
    clearTimeout(watchdog);
    opts.onRendered?.();
  };
  const watchdog = setTimeout(() => {
    if (!healthy) opts.onBlank?.('no tiles rendered');
  }, 12000);
  map.on('data', (e: { dataType?: string; sourceId?: string; tile?: unknown }) => {
    // ONLY the basemap counts — pins (GeoJSON) loading must not mask an absent basemap
    if (isRenderedTileEvent(e, TILES_SOURCE_ID)) markHealthy();
  });
  // WebGL context loss → blank canvas that never recovers on its own.
  const canvasEl = map.getCanvas();
  canvasEl.addEventListener(
    'webglcontextlost',
    (e) => {
      e.preventDefault(); // allow a potential restore, but treat as blank now
      clearTimeout(watchdog);
      opts.onBlank?.('webgl context lost');
    },
    { once: true },
  );
  map.addControl(
    new AttributionControl({
      compact: true,
      customAttribution: 'Sold data © Crown copyright, OGL v3',
    }),
    'bottom-right',
  );
  if (interactive) map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  if (interactive) {
    // "Reset view" control — re-frames the radius/comps.
    const reset: IControl = {
      onAdd() {
        const div = document.createElement('div');
        div.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = 'Reset view';
        btn.setAttribute('aria-label', 'Reset the map view');
        btn.className = 'map-reset-btn';
        btn.textContent = 'Reset';
        btn.addEventListener('click', () => fitToData());
        div.appendChild(btn);
        return div;
      },
      onRemove() {},
    };
    map.addControl(reset, 'top-right');
  }

  // test hook: live checks drive the real map through the container
  (container as HTMLElement & { _map?: unknown })._map = map;

  let current = data;
  let popup: Popup | null = null;
  let pulseFrame = 0;
  let clustered = clusterForVariant(data.variant, data.comps.length);

  const addDataLayers = () => {
    // Article 4 shaded areas render UNDER the data layer (HMO analyser).
    // The source is created ALWAYS (empty when none) so polygons that arrive
    // from the planning API AFTER 'load' render via setData instead of being
    // silently dropped — otherwise the map could contradict the verdict flag.
    {
      map.addSource('article4', {
        type: 'geojson',
        data: (current.article4 ?? { type: 'FeatureCollection', features: [] }) as never,
      });
      map.addLayer({ id: 'article4-fill', type: 'fill', source: 'article4', paint: { 'fill-color': 'rgba(220,255,0,0.10)' } });
      map.addLayer({
        id: 'article4-line',
        type: 'line',
        source: 'article4',
        paint: { 'line-color': LIME, 'line-width': 1, 'line-dasharray': [3, 2], 'line-opacity': 0.7 },
      });
    }

    if (current.radiusMiles > 0) {
      map.addSource('radius', { type: 'geojson', data: circleGeoJson(current) });
      map.addLayer({
        id: 'radius-fill',
        type: 'fill',
        source: 'radius',
        paint: { 'fill-color': 'rgba(220,255,0,0.12)' },
      });
      map.addLayer({
        id: 'radius-line',
        type: 'line',
        source: 'radius',
        paint: { 'line-color': LIME, 'line-width': 1.5 },
      });
    }

    clustered = clusterForVariant(current.variant, current.comps.length);
    map.addSource('comps', {
      type: 'geojson',
      data: compsGeoJson(current),
      cluster: clustered,
      clusterRadius: 44,
      clusterMaxZoom: 15,
    });
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'comps',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': LIME,
        'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 22],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(220,255,0,0.35)',
      },
    });
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'comps',
      filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Medium'], 'text-size': 13 },
      paint: { 'text-color': INK },
    });
    const density = current.variant === 'density';
    map.addLayer({
      id: 'comp-pins',
      type: 'circle',
      source: 'comps',
      filter: ['!', ['has', 'point_count']],
      paint: density
        ? {
            // subtle density dots for the Area Data map
            'circle-radius': 4,
            'circle-color': LIME,
            'circle-opacity': 0.55,
            'circle-stroke-width': 0.5,
            'circle-stroke-color': INK,
          }
        : {
            'circle-radius': ['get', 'radius'],
            'circle-color': ['case', ['==', ['get', 'state'], 'selected'], '#ffffff', LIME],
            'circle-opacity': ['case', ['==', ['get', 'state'], 'excluded'], 0.25, 1],
            'circle-stroke-width': ['case', ['==', ['get', 'state'], 'selected'], 2.5, 1],
            'circle-stroke-color': ['case', ['==', ['get', 'state'], 'selected'], LIME, INK],
            'circle-stroke-opacity': ['case', ['==', ['get', 'state'], 'excluded'], 0.25, 1],
          },
    });

    map.addSource('subject', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'Point', coordinates: [current.subject.lng, current.subject.lat] }, properties: {} },
    });
    map.addLayer({
      id: 'subject-pulse',
      type: 'circle',
      source: 'subject',
      paint: { 'circle-radius': 10, 'circle-color': LIME, 'circle-opacity': 0.25 },
    });
    map.addLayer({
      id: 'subject-dot',
      type: 'circle',
      source: 'subject',
      paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-width': 2.5, 'circle-stroke-color': LIME },
    });

    if (!reduceMotion && interactive) {
      const t0 = performance.now();
      const pulse = (t: number) => {
        const phase = ((t - t0) % 2400) / 2400;
        const r = 8 + 10 * phase;
        const o = 0.3 * (1 - phase);
        if (map.getLayer('subject-pulse')) {
          map.setPaintProperty('subject-pulse', 'circle-radius', r);
          map.setPaintProperty('subject-pulse', 'circle-opacity', o);
        }
        pulseFrame = requestAnimationFrame(pulse);
      };
      pulseFrame = requestAnimationFrame(pulse);
    }
  };

  map.on('load', () => {
    // one resize after first layout: if the container was 0-sized at
    // construction (a late-layout race on slow devices), this recovers it.
    map.resize();
    addDataLayers();
  });
  // MapLibre reports tile/style failures as events, not exceptions — surface
  // them so a broken basemap is never a silent black box.
  map.on('error', (e) => {
    const msg = e.error?.message ?? 'unknown';
    console.error('map error:', msg);
    // a failure to load the style/glyphs/sprite is fatal to rendering
    if (!healthy && /style|glyph|sprite|sourcemap|worker/i.test(msg)) opts.onBlank?.(msg);
  });

  if (interactive) {
    const expandCluster = async (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const src = map.getSource('comps') as GeoJSONSource;
      const zoom = await src.getClusterExpansionZoom(f.properties?.cluster_id as number);
      map.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom });
    };
    // the count text renders ABOVE the circle and captures its clicks
    map.on('click', 'clusters', expandCluster);
    map.on('click', 'cluster-count', expandCluster);
    map.on('click', 'comp-pins', (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as Record<string, string | number | null>;
      popup?.remove();
      popup = new Popup({ closeButton: true, maxWidth: '260px', className: 'map-popup' })
        .setLngLat((f.geometry as Point).coordinates as [number, number])
        .setHTML(
          `<p class="map-popup-price">${esc(p.label)}</p>` +
            `<p class="map-popup-line">${esc(p.address)}${p.town ? `, ${esc(p.town)}` : ''}</p>` +
            `<p class="map-popup-line">${esc(p.date)} · ${esc(TYPE_WORDS[String(p.type)] ?? p.type)} · ${p.tenure === 'F' ? 'Freehold' : 'Leasehold'}${
              p.persqft !== null ? ` · £${esc(p.persqft)}/sqft` : ''
            }</p>` +
            `<p class="map-popup-link"><a href="/transaction?id=${encodeURIComponent(String(p.id))}">Details →</a></p>`,
        )
        .addTo(map);
    });
    for (const layer of ['comp-pins', 'clusters', 'cluster-count']) {
      map.on('mouseenter', layer, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = '';
      });
    }
  }

  const refresh = () => {
    if (!map.isStyleLoaded()) return;
    const needCluster = clusterForVariant(current.variant, current.comps.length);
    if (needCluster !== clustered) {
      // cluster flag is source-level: rebuild the data layers
      for (const id of ['subject-dot', 'subject-pulse', 'comp-pins', 'cluster-count', 'clusters', 'radius-line', 'radius-fill', 'article4-line', 'article4-fill']) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      for (const id of ['subject', 'comps', 'radius', 'article4']) if (map.getSource(id)) map.removeSource(id);
      if (pulseFrame) cancelAnimationFrame(pulseFrame);
      addDataLayers();
      return;
    }
    (map.getSource('comps') as GeoJSONSource | undefined)?.setData(compsGeoJson(current));
    (map.getSource('radius') as GeoJSONSource | undefined)?.setData(circleGeoJson(current) as never);
    (map.getSource('article4') as GeoJSONSource | undefined)?.setData(
      (current.article4 ?? { type: 'FeatureCollection', features: [] }) as never,
    );
    (map.getSource('subject') as GeoJSONSource | undefined)?.setData({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [current.subject.lng, current.subject.lat] },
      properties: {},
    } as never);
  };

  /** Frame the radius ring (or the comps) — used by radius-change + Reset view. */
  const fitToData = () => {
    const anim = reduceMotion ? { duration: 0 } : { duration: 600 };
    if (current.radiusMiles > 0) {
      const ring = circleRing(current.subject.lat, current.subject.lng, current.radiusMiles);
      const b = new LngLatBounds(ring[0] as [number, number], ring[0] as [number, number]);
      for (const p of ring) b.extend(p as [number, number]);
      map.fitBounds(b, { padding: 32, ...anim });
    } else if (current.comps.length > 0) {
      const b = new LngLatBounds([current.comps[0].lng, current.comps[0].lat], [current.comps[0].lng, current.comps[0].lat]);
      for (const c of current.comps) b.extend([c.lng, c.lat]);
      map.fitBounds(b, { padding: 40, maxZoom: 16, ...anim });
    } else {
      map.easeTo({ center: [current.subject.lng, current.subject.lat], zoom: interactive ? 14 : 15, ...anim });
    }
  };

  return {
    update(next: MapData) {
      const recentre = next.subject.lat !== current.subject.lat || next.subject.lng !== current.subject.lng;
      const radiusChanged = next.radiusMiles !== current.radiusMiles;
      current = next;
      refresh();
      if (radiusChanged) fitToData();
      else if (recentre) map.easeTo({ center: [next.subject.lng, next.subject.lat], duration: reduceMotion ? 0 : 600 });
    },
    setHovered(id: string | null) {
      if (!map.getLayer('comp-pins')) return;
      map.setPaintProperty('comp-pins', 'circle-stroke-color', [
        'case',
        ['==', ['get', 'id'], id ?? ''],
        '#ffffff',
        ['case', ['==', ['get', 'state'], 'selected'], LIME, INK],
      ]);
      map.setPaintProperty('comp-pins', 'circle-stroke-width', [
        'case',
        ['==', ['get', 'id'], id ?? ''],
        3,
        ['case', ['==', ['get', 'state'], 'selected'], 2.5, 1],
      ]);
    },
    destroy() {
      clearTimeout(watchdog);
      if (pulseFrame) cancelAnimationFrame(pulseFrame);
      popup?.remove();
      map.remove();
    },
  };
}
