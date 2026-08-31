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
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Comp } from '../../lib/comparables/engine';
import { circleRing, escapeHtml as esc, pinState, shouldCluster } from '../../lib/map/geo';
import { buildMapStyle } from '../../lib/map/style';
import { fmtMoney } from '../../lib/maths/format';
import { sqmToSqft } from '../../lib/maths/area';

let protocolRegistered = false;
function ensureProtocol(): void {
  if (protocolRegistered) return;
  // v6 ships the worker as a separate module; under Vite its default URL
  // resolves into our hashed chunk and the worker dies silently — point it
  // at the self-hosted copy (scripts/copy-map-worker.mjs).
  setWorkerUrl('/map/vendor/maplibre-gl-worker.mjs');
  addProtocol('pmtiles', new Protocol().tile);
  protocolRegistered = true;
}

const LIME = '#dcff00';
const INK = '#070014';

export interface MapData {
  subject: { lat: number; lng: number };
  radiusMiles: number;
  comps: Comp[];
  selectedId: string | null;
}

export interface MapHandle {
  update(data: MapData): void;
  setHovered(id: string | null): void;
  destroy(): void;
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

export function mountMap(container: HTMLElement, data: MapData, opts: { interactive?: boolean } = {}): MapHandle {
  ensureProtocol();
  const interactive = opts.interactive !== false;
  const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const map = new LibreMap({
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
  map.addControl(
    new AttributionControl({
      compact: true,
      customAttribution: 'Sold data © Crown copyright, OGL v3',
    }),
    'bottom-right',
  );
  if (interactive) map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

  // test hook: live checks drive the real map through the container
  (container as HTMLElement & { _map?: unknown })._map = map;

  let current = data;
  let popup: Popup | null = null;
  let pulseFrame = 0;
  let clustered = shouldCluster(data.comps.length);

  const addDataLayers = () => {
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

    clustered = shouldCluster(current.comps.length);
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
    map.addLayer({
      id: 'comp-pins',
      type: 'circle',
      source: 'comps',
      filter: ['!', ['has', 'point_count']],
      paint: {
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

  map.on('load', addDataLayers);
  // MapLibre reports tile/style failures as events, not exceptions — surface
  // them so a broken basemap is never a silent black box.
  map.on('error', (e) => console.error('map error:', e.error?.message ?? 'unknown'));

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
    const needCluster = shouldCluster(current.comps.length);
    if (needCluster !== clustered) {
      // cluster flag is source-level: rebuild the data layers
      for (const id of ['subject-dot', 'subject-pulse', 'comp-pins', 'cluster-count', 'clusters', 'radius-line', 'radius-fill']) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      for (const id of ['subject', 'comps', 'radius']) if (map.getSource(id)) map.removeSource(id);
      if (pulseFrame) cancelAnimationFrame(pulseFrame);
      addDataLayers();
      return;
    }
    (map.getSource('comps') as GeoJSONSource | undefined)?.setData(compsGeoJson(current));
    (map.getSource('radius') as GeoJSONSource | undefined)?.setData(circleGeoJson(current) as never);
    (map.getSource('subject') as GeoJSONSource | undefined)?.setData({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [current.subject.lng, current.subject.lat] },
      properties: {},
    } as never);
  };

  return {
    update(next: MapData) {
      const recentre = next.subject.lat !== current.subject.lat || next.subject.lng !== current.subject.lng;
      current = next;
      refresh();
      if (recentre) map.easeTo({ center: [next.subject.lng, next.subject.lat] });
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
      if (pulseFrame) cancelAnimationFrame(pulseFrame);
      popup?.remove();
      map.remove();
    },
  };
}
