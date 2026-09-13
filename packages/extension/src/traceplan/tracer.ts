/**
 * TRACEPLAN — THE STATE MACHINE. No DOM, no SVG, no image, no strings.
 *
 * Every interaction the feature has is a function from (state, event) to state,
 * so the whole of "what happens when I tap there" is testable without a browser
 * or a finger. The view below is then only a drawing of whatever this returns.
 *
 * ONE RULE THROUGHOUT: corners are stored in IMAGE pixels. Zoom and pan change
 * what you see, never what you traced. Anything measured against a finger — the
 * close radius, the grab radius — is compared in SCREEN pixels, because those
 * tolerances are about hands, not about the drawing.
 */
import { TRACEPLAN_TOLERANCES as T } from './config';
import {
  areaReading, closesRoom, distance, hitPoint, metresPerPixel, toImage, toScreen,
  type AreaReading, type Pt, type ViewTransform,
} from './geometry';

/** Where the user is. The screen renders exactly one of these. */
export type Phase = 'scale' | 'trace' | 'done';

export interface TracerState {
  phase: Phase;
  /** The two ends of the printed dimension, in image px. */
  scalePoints: Pt[];
  /** Metres per image pixel, once calibrated. */
  metresPerPx: number | null;
  /** The real length the user typed, kept so the screen can say it back. */
  scaleMetres: number | null;
  /** The room's corners, in image px, in the order they were tapped. */
  points: Pt[];
  /** True once the polygon is closed. */
  closed: boolean;
  /** Index of the corner being dragged, or null. */
  dragging: number | null;
  view: ViewTransform;
  /** Set when the last action could not be done, so the screen can say why. */
  error: string | null;
}

export function initialState(): TracerState {
  return {
    phase: 'scale', scalePoints: [], metresPerPx: null, scaleMetres: null,
    points: [], closed: false, dragging: null,
    view: { scale: 1, tx: 0, ty: 0 }, error: null,
  };
}

const clampZoom = (s: number): number => Math.min(Math.max(s, T.minZoom), T.maxZoom);

/** Pan by a screen-pixel delta. */
export function pan(s: TracerState, dx: number, dy: number): TracerState {
  return { ...s, view: { ...s.view, tx: s.view.tx + dx, ty: s.view.ty + dy } };
}

/**
 * Zoom about a fixed screen point — the midpoint between two fingers — so the
 * bit of plan under the pinch stays under the pinch. Zooming about the origin
 * instead makes the image shoot away, which feels broken.
 */
export function zoomAbout(s: TracerState, centre: Pt, factor: number): TracerState {
  const next = clampZoom(s.view.scale * factor);
  const applied = next / s.view.scale;
  return {
    ...s,
    view: {
      scale: next,
      tx: centre.x - (centre.x - s.view.tx) * applied,
      ty: centre.y - (centre.y - s.view.ty) * applied,
    },
  };
}

/** A tap during the scale phase: first end, then second end. */
export function tapScale(s: TracerState, screen: Pt): TracerState {
  if (s.phase !== 'scale') return s;
  const img = toImage(screen, s.view);
  if (s.scalePoints.length >= 2) return { ...s, scalePoints: [img], error: null };
  return { ...s, scalePoints: [...s.scalePoints, img], error: null };
}

/**
 * Commit the typed real length. Refuses a reference too short to calibrate
 * from, and says so instead of returning a confident wrong number.
 */
export function setScale(s: TracerState, metres: number, tooShortMessage: string): TracerState {
  if (s.scalePoints.length < 2) return s;
  const [a, b] = s.scalePoints;
  const screenA = toScreen(a, s.view);
  const screenB = toScreen(b, s.view);
  if (distance(screenA, screenB) < T.minScalePx) return { ...s, error: tooShortMessage };
  const mpp = metresPerPixel(a, b, metres, 0);
  if (mpp === null) return { ...s, error: tooShortMessage };
  return { ...s, metresPerPx: mpp, scaleMetres: metres, phase: 'trace', error: null };
}

export function redoScale(s: TracerState): TracerState {
  return { ...s, phase: 'scale', scalePoints: [], metresPerPx: null, scaleMetres: null, error: null };
}

/** Screen positions of the corners as they currently appear. */
export function screenPoints(s: TracerState): Pt[] {
  return s.points.map((p) => toScreen(p, s.view));
}

/**
 * A tap during tracing means exactly two things, and the order matters:
 *   1. close the room — on the first corner, once there are enough corners;
 *   2. otherwise, place a new corner.
 *
 * IT NEVER GRABS AN EXISTING CORNER WHILE THE ROOM IS OPEN, and that is a
 * deliberate choice rather than an omission. While you are tracing you are
 * BUILDING: a tap near a corner you already placed is a small wall or a fumble,
 * and in both cases you meant to place. If it grabbed instead, a genuine tight
 * corner would silently drag the previous one and the room would deform under
 * you. Adjusting is a separate job and belongs to the closed room, where there
 * is nothing else a touch on a corner could mean.
 */
export function tapTrace(s: TracerState, screen: Pt): TracerState {
  if (s.phase !== 'trace' || s.closed) return s;
  const pts = screenPoints(s);
  if (pts.length > 0 && closesRoom(screen, pts[0], T.closeRadiusPx, s.points.length, T.minPoints)) {
    return { ...s, closed: true, phase: 'done', error: null };
  }
  return { ...s, points: [...s.points, toImage(screen, s.view)], error: null };
}

/**
 * Begin moving a placed corner. ONLY on a closed room — see tapTrace above for
 * why an open trace must not do this.
 */
export function grab(s: TracerState, screen: Pt): TracerState {
  if (!s.closed) return s;
  const i = hitPoint(screen, screenPoints(s), T.grabRadiusPx);
  return i === null ? s : { ...s, dragging: i, error: null };
}

/** Move the held corner to wherever the crosshair is now. */
export function moveHeld(s: TracerState, screen: Pt): TracerState {
  if (s.dragging === null) return s;
  const next = [...s.points];
  next[s.dragging] = toImage(screen, s.view);
  return { ...s, points: next };
}

export function release(s: TracerState): TracerState {
  return s.dragging === null ? s : { ...s, dragging: null };
}

/**
 * Undo. Reopens a closed room rather than doing nothing, because "undo" after
 * closing obviously means "I closed it too early".
 */
export function undo(s: TracerState): TracerState {
  if (s.closed) return { ...s, closed: false, phase: 'trace', error: null };
  if (s.points.length === 0) return s;
  return { ...s, points: s.points.slice(0, -1), dragging: null, error: null };
}

export function closeRoom(s: TracerState): TracerState {
  if (s.points.length < T.minPoints) return s;
  return { ...s, closed: true, phase: 'done', dragging: null, error: null };
}

export function restart(s: TracerState): TracerState {
  return { ...s, points: [], closed: false, phase: 'trace', dragging: null, error: null };
}

/** The reading, or null while there is not yet enough to read. */
export function reading(s: TracerState): AreaReading | null {
  if (s.metresPerPx === null || !s.closed) return null;
  return areaReading(s.points, s.metresPerPx, T.areaTolerancePct);
}

/** The wall being drawn right now, in metres, for the live label. */
export function lastWallMetres(s: TracerState): number | null {
  if (s.metresPerPx === null || s.points.length < 2) return null;
  const a = s.points[s.points.length - 2];
  const b = s.points[s.points.length - 1];
  return distance(a, b) * s.metresPerPx;
}
