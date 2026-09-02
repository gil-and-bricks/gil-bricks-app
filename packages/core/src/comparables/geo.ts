/** Haversine distance in miles — mirrored in pipeline/build.mjs (spanMiles). */
export const EARTH_RADIUS_MILES = 3958.8;

export function distanceMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}
