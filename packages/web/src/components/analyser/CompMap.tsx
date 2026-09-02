/**
 * The light half of the map (S7.1): a container that dynamically imports
 * mapImpl (maplibre + style + pmtiles) on FIRST open only — Lighthouse never
 * pays for the map on page load. Data updates flow through the same handle.
 *
 * A render-health watchdog (keyed to the BASEMAP source) means a blank or
 * basemap-less map self-reports: it auto-retries once (rebuilding a poisoned
 * pmtiles cache), then falls back to the honest table pointer with a manual
 * retry — a blank map can never ship silently.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Comp } from '@gil-bricks/core';
import type { MapData, MapHandle } from './mapImpl';
import { hoveredCompId } from './mapSync';
import { fetchArticle4InBbox } from '../../lib/map/article4';

export interface CompMapProps {
  subject: { lat: number; lng: number };
  radiusMiles: number;
  comps: Comp[];
  selectedId: string | null;
  /** 'density' = subtle dots (Area Data map); 'comps' = full pins (default). */
  variant?: 'comps' | 'density';
  /** Load + shade Article 4 direction areas (HMO analyser only). */
  article4?: boolean;
}

export function CompMap({ subject, radiusMiles, comps, selectedId, variant = 'comps', article4 = false }: CompMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'blank' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [a4, setA4] = useState<GeoJSON.FeatureCollection | null>(null);
  const a4Ref = useRef<GeoJSON.FeatureCollection | null>(null);
  a4Ref.current = a4; // always the latest, so a mount that finishes AFTER the
  // async Article 4 fetch still seeds the map with the polygons (race fix)
  const autoRetried = useRef(false);

  // Article 4 polygons for a ~2-mile box around the subject (England dataset).
  useEffect(() => {
    if (!article4) return;
    let cancelled = false;
    const dLat = 0.03, dLng = 0.045; // ~2mi
    void fetchArticle4InBbox({ west: subject.lng - dLng, south: subject.lat - dLat, east: subject.lng + dLng, north: subject.lat + dLat })
      .then((fc) => !cancelled && setA4(fc));
    return () => {
      cancelled = true;
    };
  }, [article4, subject.lat, subject.lng]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    void import('./mapImpl')
      .then((m) => {
        if (cancelled || !el.current) return;
        handle.current = m.mountMap(el.current, { subject, radiusMiles, comps, selectedId, variant, article4: a4Ref.current }, {
          onRendered: () => !cancelled && setStatus('ok'),
          onBlank: (reason) => {
            if (cancelled) return;
            console.error('map blank:', reason);
            // once: rebuild a poisoned pmtiles cache and remount automatically
            if (!autoRetried.current) {
              autoRetried.current = true;
              m.resetTiles();
              setAttempt((n) => n + 1);
            } else {
              setStatus('blank');
            }
          },
        });
      })
      .catch(() => !cancelled && setStatus('failed'));
    return () => {
      cancelled = true;
      handle.current?.destroy();
      handle.current = null;
    };
    // remount on retry (attempt); mount once otherwise
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    handle.current?.update({ subject, radiusMiles, comps, selectedId, variant, article4: a4 } satisfies MapData);
  }, [subject.lat, subject.lng, radiusMiles, comps, selectedId, variant, a4]);

  useEffect(() => {
    if (variant === 'comps') handle.current?.setHovered(hoveredCompId.value);
  }, [hoveredCompId.value, variant]);

  const broken = status === 'blank' || status === 'failed';

  const manualRetry = () => {
    autoRetried.current = false; // allow the auto-heal to fire again on this fresh attempt
    setStatus('loading');
    setAttempt((n) => n + 1);
  };

  return (
    <>
      {broken && (
        <p class="hint map-fallback" role="alert">
          The map couldn't display here — the table below has every sale.{' '}
          <button type="button" class="linklike" onClick={manualRetry}>
            Try the map again
          </button>
        </p>
      )}
      <div
        class="comp-map"
        ref={el}
        hidden={broken}
        aria-label="Map of comparable sales — the table view carries the same data"
        role="application"
      />
      {article4 && a4 && a4.features.length > 0 && !broken && (
        <p class="hint map-a4-note">
          Shaded areas have an Article 4 direction recorded in the national planning dataset (England). Coverage is
          incomplete and councils change these — always confirm with the council before you buy.
        </p>
      )}
    </>
  );
}
