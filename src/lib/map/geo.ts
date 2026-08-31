/** Pure map-data helpers (S7.1) — geometry, cluster threshold, pin states. */
import type { Comp } from '../comparables/engine';

export const METRES_PER_MILE = 1609.344;

/** Escape a dynamic value before it enters popup HTML — data strings are
 * never trusted, even from clean sources like Land Registry PPD. */
export function escapeHtml(v: unknown): string {
  return String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export function milesToMetres(miles: number): number {
  return miles * METRES_PER_MILE;
}

/**
 * A radius circle as a GeoJSON polygon ring (64 points, closed) sized
 * EXACTLY to the selected radius, correct for latitude.
 */
export function circleRing(lat: number, lng: number, miles: number, points = 64): [number, number][] {
  const R = 6371008.8; // mean earth radius, metres
  const d = milesToMetres(miles) / R;
  const latR = (lat * Math.PI) / 180;
  const ring: [number, number][] = [];
  for (let i = 0; i <= points; i += 1) {
    const bearing = (2 * Math.PI * i) / points;
    const lat2 = Math.asin(Math.sin(latR) * Math.cos(d) + Math.cos(latR) * Math.sin(d) * Math.cos(bearing));
    const lng2 =
      (lng * Math.PI) / 180 +
      Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(latR), Math.cos(d) - Math.sin(latR) * Math.sin(lat2));
    ring.push([Number(((lng2 * 180) / Math.PI).toFixed(6)), Number(((lat2 * 180) / Math.PI).toFixed(6))]);
  }
  return ring;
}

/** Clustering kicks in only when the pin count gets noisy. */
export const CLUSTER_THRESHOLD = 25;

export function shouldCluster(compCount: number): boolean {
  return compCount > CLUSTER_THRESHOLD;
}

export interface PinState {
  /** 'normal' | 'excluded' | 'selected' */
  state: 'normal' | 'excluded' | 'selected';
  /** Pin radius in px, scaled slightly by price within the batch. */
  radius: number;
}

/**
 * Pin visual state: selected wins, excluded dims; radius scales gently with
 * price rank across the batch (min→max ≈ 5→9px).
 */
export function pinState(comp: Pick<Comp, 'id' | 'included' | 'price'>, allPrices: number[], selectedId: string | null): PinState {
  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);
  const t = max > min ? (comp.price - min) / (max - min) : 0.5;
  const radius = Math.round((5 + 4 * t) * 10) / 10;
  if (selectedId !== null && comp.id === selectedId) return { state: 'selected', radius };
  if (!comp.included) return { state: 'excluded', radius };
  return { state: 'normal', radius };
}
