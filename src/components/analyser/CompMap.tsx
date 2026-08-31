/**
 * The light half of the map (S7.1): a container that dynamically imports
 * mapImpl (maplibre + style + pmtiles) on FIRST open only — Lighthouse never
 * pays for the map on page load. Data updates flow through the same handle.
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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void import('./mapImpl')
      .then((m) => {
        if (cancelled || !el.current) return;
        handle.current = m.mountMap(el.current, { subject, radiusMiles, comps, selectedId });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      handle.current?.destroy();
      handle.current = null;
    };
    // mount once; updates go through the handle below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handle.current?.update({ subject, radiusMiles, comps, selectedId } satisfies MapData);
  }, [subject.lat, subject.lng, radiusMiles, comps, selectedId]);

  useEffect(() => {
    handle.current?.setHovered(hoveredCompId.value);
  }, [hoveredCompId.value]);

  if (failed) {
    return <p class="hint" role="alert">The map couldn't load — the table view has everything.</p>;
  }
  return <div class="comp-map" ref={el} aria-label="Map of comparable sales — the table view carries the same data" role="application" />;
}
