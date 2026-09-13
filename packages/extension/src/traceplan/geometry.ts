/**
 * TRACEPLAN — THE MATHS. Pure functions, no DOM, no state, no strings.
 *
 * Everything here works in TWO coordinate systems and never confuses them:
 *   - IMAGE pixels: where a corner sits on the floorplan bitmap. Zoom and pan
 *     never change these, which is why they are what we store in state.
 *   - SCREEN pixels: where that corner currently appears in the panel. Derived,
 *     transient, and never the source of truth.
 *
 * NOTHING IN THIS FILE EVER SEES THE IMAGE. It is handed numbers and hands back
 * numbers. That is deliberate: it is the half of the feature that has to be
 * right, and it is testable without a browser, a bitmap, or a finger.
 */

export interface Pt { x: number; y: number }

/** How the image is currently displayed: a scale and an offset, both screen px. */
export interface ViewTransform { scale: number; tx: number; ty: number }

export const toScreen = (p: Pt, v: ViewTransform): Pt => ({ x: p.x * v.scale + v.tx, y: p.y * v.scale + v.ty });
export const toImage = (p: Pt, v: ViewTransform): Pt => ({ x: (p.x - v.tx) / v.scale, y: (p.y - v.ty) / v.scale });

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * THE SCALE, from one printed dimension the user taps the ends of.
 *
 * `metresPerImagePx` is the whole calibration: every length in the room is this
 * number times its pixel length. Returns null rather than a wild figure when the
 * two taps are too close together to be a real reference — over a short span,
 * a finger's worth of error is a large share of the answer.
 */
export function metresPerPixel(a: Pt, b: Pt, realMetres: number, minPx: number): number | null {
  const px = distance(a, b);
  if (!Number.isFinite(px) || px < minPx) return null;
  if (!Number.isFinite(realMetres) || realMetres <= 0) return null;
  return realMetres / px;
}

/**
 * THE SHOELACE FORMULA — the area of any simple polygon from its vertices.
 *
 * Sum the cross products of consecutive vertex pairs and halve the absolute
 * value. It is exact for a polygon with straight sides, which a traced room is,
 * and it needs no triangulation and no assumption that the room is a rectangle.
 * The absolute value is what makes it indifferent to whether the corners were
 * tapped clockwise or anticlockwise, which a person will not think about.
 */
export function shoelaceArea(points: readonly Pt[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** The polygon's perimeter, in the same units as its vertices. */
export function perimeter(points: readonly Pt[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i++) total += distance(points[i], points[(i + 1) % points.length]);
  return total;
}

/**
 * THE AREA, IN SQUARE METRES, WITH THE RANGE AROUND IT.
 *
 * Area scales with the SQUARE of a length, so a calibration that is 1% out puts
 * the area out by about 2%. That is the reason the range is not decoration: a
 * finger-traced room off a printed dimension is realistically several per cent
 * either way, and a bare "23.4 m²" would be claiming a survey.
 *
 * Returned to one decimal place, because the second decimal is noise.
 */
export interface AreaReading {
  sqm: number;
  lowSqm: number;
  highSqm: number;
}

export function areaReading(
  imagePoints: readonly Pt[], metresPerImagePx: number, tolerancePct: number,
): AreaReading | null {
  if (imagePoints.length < 3) return null;
  if (!Number.isFinite(metresPerImagePx) || metresPerImagePx <= 0) return null;
  const sqm = shoelaceArea(imagePoints) * metresPerImagePx * metresPerImagePx;
  if (!Number.isFinite(sqm) || sqm <= 0) return null;
  const f = tolerancePct / 100;
  const round1 = (n: number): number => Math.round(n * 10) / 10;
  return { sqm: round1(sqm), lowSqm: round1(sqm * (1 - f)), highSqm: round1(sqm * (1 + f)) };
}

/** A wall's length in metres, for the live label while placing corners. */
export function lengthMetres(a: Pt, b: Pt, metresPerImagePx: number): number {
  return distance(a, b) * metresPerImagePx;
}

/**
 * Is this tap on the first corner — i.e. does it close the room? Measured in
 * SCREEN pixels, because the tolerance is about fingers, not about the drawing.
 */
export function closesRoom(tapScreen: Pt, firstScreen: Pt, radiusPx: number, pointCount: number, minPoints: number): boolean {
  if (pointCount < minPoints) return false;
  return distance(tapScreen, firstScreen) <= radiusPx;
}

/** Which placed corner a tap grabs, or null. Nearest wins inside the radius. */
export function hitPoint(tapScreen: Pt, screenPoints: readonly Pt[], radiusPx: number): number | null {
  let best: number | null = null;
  let bestD = radiusPx;
  screenPoints.forEach((p, i) => {
    const d = distance(tapScreen, p);
    if (d <= bestD) { bestD = d; best = i; }
  });
  return best;
}

/**
 * WHERE THE LOUPE GOES so the finger never hides the corner being placed.
 *
 * Always offset ABOVE the touch point by `offset`. Near the top of the surface
 * there is no room above, so it flips BELOW rather than being clipped — a loupe
 * half off-screen is worse than one in the other direction. It is also clamped
 * horizontally so it never leaves the surface.
 */
export function loupePosition(
  touch: Pt, surface: { width: number; height: number }, size: number, offset: number,
): { x: number; y: number; below: boolean } {
  const half = size / 2;
  const wantY = touch.y - offset - half;
  const below = wantY < 0;
  const y = below ? touch.y + offset + half : wantY;
  const x = Math.min(Math.max(touch.x, half), Math.max(half, surface.width - half));
  return { x, y: Math.min(Math.max(y, half), Math.max(half, surface.height - half)), below };
}

/**
 * T2 — SOLVING THE SCALE FROM A KNOWN AREA, rather than a known length.
 *
 * WHY THIS EXISTS. Over half of UK agent floorplans carry no printed dimension
 * at all, so "tap the ends of a dimension" is a dead end on most real listings.
 * But we usually already hold the property's total floor area, from the EPC.
 *
 * THE ALGEBRA. Area scales with the SQUARE of length. If the traced polygons
 * cover `tracedPx2` square pixels and the real thing is `knownSqm` square
 * metres, then
 *
 *     knownSqm = tracedPx2 × (metres per pixel)²
 *     metres per pixel = √(knownSqm ÷ tracedPx2)
 *
 * One number, solved once, applied to everything.
 *
 * WHAT IT DOES AND DOES NOT BUY. It anchors the TOTAL exactly — by
 * construction, the traced total will equal the known figure. It does nothing
 * for the distribution BETWEEN rooms: if a wall was traced sloppily, that room
 * is still wrong, and now its error is pushed onto its neighbours. The copy has
 * to say that, because a total that matches its source looks authoritative.
 */
export function scaleFromKnownArea(tracedPx2: number, knownSqm: number): number | null {
  if (!Number.isFinite(tracedPx2) || tracedPx2 <= 0) return null;
  if (!Number.isFinite(knownSqm) || knownSqm <= 0) return null;
  return Math.sqrt(knownSqm / tracedPx2);
}

/** The unscaled area of many polygons, in square image pixels. */
export function totalPx2(polygons: readonly (readonly Pt[])[]): number {
  let total = 0;
  for (const poly of polygons) total += shoelaceArea(poly);
  return total;
}

/**
 * T2 — IS THE PLAN ZOOMED IN ENOUGH TO TRACE ACCURATELY?
 *
 * At the zoom a plan first appears at, a room corner is two or three pixels and
 * a fingertip is fifty. The loupe makes the corner VISIBLE but cannot make the
 * placement finer than the underlying image allows: every corner carries the
 * error of one screen pixel, which at 1× is a large share of a small room.
 *
 * Rather than nag, this answers a factual question — how much plan is on screen
 * — so the surface can prompt once, early, and stop.
 */
export function needsMoreZoom(viewScale: number, minScale: number): boolean {
  return viewScale < minScale;
}
