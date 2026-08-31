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
import type { Comp } from '../../lib/comparables/engine';
import type { MapData, MapHandle } from './mapImpl';
import { hoveredCompId } from './mapSync';

export interface CompMapProps {
  subject: { lat: number; lng: number };
  radiusMiles: number;
  comps: Comp[];
  selectedId: string | null;
}

export function CompMap({ subject, radiusMiles, comps, selectedId }: CompMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'blank' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const autoRetried = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    void import('./mapImpl')
      .then((m) => {
        if (cancelled || !el.current) return;
        handle.current = m.mountMap(el.current, { subject, radiusMiles, comps, selectedId }, {
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
    handle.current?.update({ subject, radiusMiles, comps, selectedId } satisfies MapData);
  }, [subject.lat, subject.lng, radiusMiles, comps, selectedId]);

  useEffect(() => {
    handle.current?.setHovered(hoveredCompId.value);
  }, [hoveredCompId.value]);

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
    </>
  );
}
