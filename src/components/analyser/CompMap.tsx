/**
 * The light half of the map (S7.1): a container that dynamically imports
 * mapImpl (maplibre + style + pmtiles) on FIRST open only — Lighthouse never
 * pays for the map on page load. Data updates flow through the same handle.
 *
 * A render-health watchdog means a blank map (WebGL lost/unavailable on a
 * real device, or tiles that never paint) SELF-REPORTS to the honest table
 * fallback instead of showing an empty box.
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
            setStatus('blank');
          },
        });
      })
      .catch(() => !cancelled && setStatus('failed'));
    return () => {
      cancelled = true;
      handle.current?.destroy();
      handle.current = null;
    };
    // remount on explicit retry (attempt) — mount once otherwise
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    handle.current?.update({ subject, radiusMiles, comps, selectedId } satisfies MapData);
  }, [subject.lat, subject.lng, radiusMiles, comps, selectedId]);

  useEffect(() => {
    handle.current?.setHovered(hoveredCompId.value);
  }, [hoveredCompId.value]);

  const broken = status === 'blank' || status === 'failed';

  return (
    <>
      {broken && (
        <p class="hint map-fallback" role="alert">
          The map couldn't display here — the table below has every sale.{' '}
          <button type="button" class="linklike" onClick={() => setAttempt((n) => n + 1)}>
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
